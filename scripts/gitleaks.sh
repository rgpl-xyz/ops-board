#!/usr/bin/env bash
# Runs Gitleaks from its image, pinned by version and digest, with Docker or Podman, so nothing is installed and no
# license key is needed. Findings are redacted, since CI logs are public.
#
#   tools/gitleaks.sh git             scan every commit of the repository's history
#   tools/gitleaks.sh staged          scan the lines the next commit adds; the pre-commit hook runs this
#   tools/gitleaks.sh install-hook    install that pre-commit hook in this clone
#   tools/gitleaks.sh dir <folder> <config>    scan build output with explicit rules
#
# The git and staged scans use Gitleaks' default rules plus gitleaks.toml beside this script, passed explicitly.
# Extra arguments to git go to Gitleaks. A scan exits 1 when it finds a secret and 2 when it cannot scan.
set -euo pipefail

readonly IMAGE='ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'
# Git reads attributes from this empty tree instead of the checkout, so -diff and binary cannot hide a file's lines.
readonly NO_ATTRIBUTES=4b825dc642cb6eb9a060e54bf8d69288fbee4904
# Gitleaks' exit status for findings, kept apart from its own failures, which also exit 1.
readonly FOUND=3

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
self="$(basename "$here")/$(basename "${BASH_SOURCE[0]}")"
readonly here root self

usage() {
  echo "usage: $self git [gitleaks options] | staged | install-hook | dir <folder> <config>" >&2
  exit 2
}

find_runtime() {
  if command -v docker >/dev/null && docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
    runtime=docker
  elif command -v podman >/dev/null; then
    runtime=podman
  else
    echo "$self: Docker or Podman is needed to run Gitleaks." >&2
    exit 2
  fi
}

# The checkout is mounted read-only into a container with no network. Labeling is turned off instead of relabeling
# the whole checkout for SELinux.
run() {
  # Ignore checkout attributes so -diff and binary cannot hide committed secrets.
  "$runtime" run --rm --network none --security-opt label=disable -v "$root:/repo:ro" \
    -e GIT_ATTR_SOURCE="$NO_ATTRIBUTES" "$IMAGE" "$@"
}

# Only the lines the commit adds are scanned, read from the index on this machine: a commit that removes a secret
# passes, and git commit -a or git commit <paths>, which hand the hook a temporary index, are scanned as committed.
# Gitleaks reads them on standard input, so it never sees the checkout or its configuration.
staged() {
  local status=0 mount=() config=()
  # Global, so the exit trap still sees it after this function returns.
  work="$(mktemp -d)"
  trap 'rm -rf "${work:-}"' EXIT

  GIT_ATTR_SOURCE="$NO_ATTRIBUTES" git -c core.quotePath=false diff --cached --no-color --no-ext-diff --no-textconv \
    --no-renames --src-prefix=a/ --dst-prefix=b/ --unified=0 --diff-filter=d >"$work/diff"
  # Each added line goes to the scan, and its path:line to the same line of the map.
  awk -v map="$work/map" '
    /^diff --git / { header = 1; next }
    header && /^\+\+\+ b\// { path = substr($0, 7); next }
    /^@@ / { header = 0; match($0, /\+[0-9]+/); line = substr($0, RSTART + 1, RLENGTH - 1); next }
    header { next }
    /^\+/ { print substr($0, 2); print path ":" line++ > map }
  ' "$work/diff" >"$work/added"
  [[ -s "$work/added" ]] || return 0

  if [[ -f "$here/gitleaks.toml" ]]; then
    mount=(-v "$here/gitleaks.toml:/rules.toml:ro")
    config=(--config /rules.toml)
  fi
  "$runtime" run --rm -i --network none --security-opt label=disable "${mount[@]}" "$IMAGE" \
    stdin --no-banner --redact --log-level error --ignore-gitleaks-allow --exit-code "$FOUND" "${config[@]}" \
    --report-format json --report-path - <"$work/added" >"$work/report" || status=$?

  case "$status" in
    0) ;;
    "$FOUND")
      echo "$self: the staged changes hold a probable secret; values are not shown:" >&2
      awk -F'"' '/"RuleID":/ { rule = $4 } /"StartLine":/ { gsub(/[^0-9]/, "", $3); print $3, rule }' "$work/report" |
        while read -r number rule; do
          printf '  %s  %s\n' "$(sed -n "${number}p" "$work/map")" "$rule" >&2
        done
      cat >&2 <<EOF
Unstage it (git restore --staged <path>), keep the value out of the repository (runtime environment or a secret
store) and commit again. A deliberate fake gets a narrow allowlist in $(basename "$here")/gitleaks.toml, in a commit
of its own; never --no-verify. A secret that was ever committed, pushed or pasted anywhere must be rotated.
EOF
      exit 1
      ;;
    *)
      echo "$self: the secret scan could not run (exit $status), so the commit is blocked; check that $IMAGE" \
        "can be pulled." >&2
      exit 2
      ;;
  esac
}

# Installs a pre-commit hook that runs the staged scan from whichever checkout commits, worktrees included. It never
# replaces another hook, and refuses when core.hooksPath makes Git ignore the clone's hooks.
install_hook() {
  local configured hooks hook body
  configured="$(git -C "$root" config --get core.hooksPath || true)"
  if [[ -n "$configured" ]]; then
    echo "$self: core.hooksPath is $configured, so Git ignores this clone's hooks; call '$self staged' from" \
      "that folder's pre-commit hook instead." >&2
    exit 2
  fi
  hooks="$(git -C "$root" rev-parse --path-format=absolute --git-path hooks)"
  hook="$hooks/pre-commit"
  body="#!/usr/bin/env bash
# Installed by $self install-hook: the lines a commit adds pass the secret scan first.
script=\"\$(git rev-parse --show-toplevel)/$self\"
if [[ ! -x \"\$script\" ]]; then
  echo 'pre-commit: this checkout has no $self, so the secret scan cannot run; the commit is blocked.' >&2
  exit 1
fi
exec \"\$script\" staged"
  if [[ -e "$hook" ]]; then
    if [[ "$(<"$hook")" == "$body" ]]; then
      echo "$self: the pre-commit hook is already installed."
      return
    fi
    echo "$self: $hook already exists; add '$self staged' to it instead." >&2
    exit 2
  fi
  mkdir -p "$hooks"
  printf '%s\n' "$body" >"$hook"
  chmod +x "$hook"
  echo "$self: installed $hook"
}

case "${1:-}" in
  git)
    shift
    find_runtime
    # Only the checkout is mounted. A linked worktree's .git is a file pointing outside it, and Gitleaks would scan no
    # commit and still pass.
    if [[ ! -d "$root/.git" ]]; then
      echo "$self: the history scan needs the main checkout, not a linked worktree." >&2
      exit 2
    fi
    # A shallow clone would scan only the commits it holds and still pass.
    if [[ "$(git -C "$root" rev-parse --is-shallow-repository)" == true ]]; then
      echo "$self: the history scan needs a full clone; fetch it with 'git fetch --unshallow'." >&2
      exit 2
    fi
    # Gitleaks would read these from the scanned checkout, so a change could relax its own scan. Rules and allowlists
    # belong in gitleaks.toml beside this script, passed explicitly, where changing them is a reviewed edit.
    for file in .gitleaks.toml .gitleaksignore; do
      if [[ -e "$root/$file" ]]; then
        echo "$self: $file would change the scan's rules; put rules in $(basename "$here")/gitleaks.toml." >&2
        exit 2
      fi
    done
    rules=()
    if [[ -f "$here/gitleaks.toml" ]]; then
      rules=(--config "/repo/$(basename "$here")/gitleaks.toml")
    fi
    run git --no-banner --redact --verbose --ignore-gitleaks-allow "${rules[@]}" "$@" /repo
    ;;
  staged)
    [[ $# == 1 ]] || usage
    find_runtime
    staged
    ;;
  install-hook)
    [[ $# == 1 ]] || usage
    install_hook
    ;;
  dir)
    [[ $# == 3 && -d "$2" && -f "$3" ]] || usage
    find_runtime
    folder="$(cd "$2" && pwd -P)"
    config="$(realpath "$3")"
    case "$config" in
      "$folder"/*)
        echo "$self: the config must be outside the scanned folder." >&2
        exit 2
        ;;
    esac
    "$runtime" run --rm --network none --security-opt label=disable \
      -v "$folder:/scan:ro" -v "$config:/rules.toml:ro" "$IMAGE" \
      dir --no-banner --redact --verbose --ignore-gitleaks-allow --config /rules.toml /scan
    ;;
  *)
    usage
    ;;
esac
