#!/usr/bin/env bash
# Exercises the history scan, the staged scan and the pre-commit hook with the wrapper's pinned container image.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT

# Keep fixture commits independent of the caller's identity, signing settings, hooks and Git configuration.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

failures=0

# --- staged and hook cases ---
folder="$(basename "$here")"

# Assemble synthetic credentials at runtime so this file contains no scannable token. The tails let each check prove
# that no output shows a value.
github_token() { printf '%s%s%s' 'ghp_' 'Ab3De6Gh9Jk2Mn5Pq8' 'Rs1Tu4Vw7Xy0Za3Bc6'; }
openrouter_key() { printf '%s%s%s' 'sk-or-v1-' '9f86d081884c7d659a2feaa0c55ad015' 'a3bf4f1b2b0b822cd15d6c15b0f00a08'; }
groq_key() { printf '%s%s%s' 'gsk_' 'Wq8Zt3Lp6Vn1Xr4Ks7Jd2Hf5Gb9Mc0Ny' 'Qe3Ra6Tu9Io2Pa5Sd8Fg'; }
tails=('Rs1Tu4Vw7Xy0Za3Bc6' 'a3bf4f1b2b0b822cd15d6c15b0f00a08' 'Qe3Ra6Tu9Io2Pa5Sd8Fg')

fixture_commit() {
  git -C "$1" -c user.name='Gitleaks test' -c user.email=gitleaks@example.invalid \
    commit --no-gpg-sign --quiet "${@:2}"
}

# fixture_repo <name>: a clean repository holding a copy of the wrapper and its rules.
fixture_repo() {
  local repo="$temporary/$1"
  mkdir -p "$repo/$folder"
  cp "$here/gitleaks.sh" "$repo/$folder/gitleaks.sh"
  if [[ -f "$here/gitleaks.toml" ]]; then
    cp "$here/gitleaks.toml" "$repo/$folder/gitleaks.toml"
  fi
  git init --quiet --initial-branch=main "$repo"
  printf '%s\n' 'This repository contains no credentials.' >"$repo/notes.txt"
  git -C "$repo" add -A
  fixture_commit "$repo" -m 'Start'
}

# check_result <name> <expected status> <status> <log> [text the log must hold...]
check_result() {
  local name="$1" expected="$2" actual="$3" log="$4" text tail problem=''
  shift 4
  [[ "$actual" == "$expected" ]] || problem="expected exit $expected, got $actual"
  for text in "$@"; do
    grep -qF -- "$text" "$log" || problem="${problem:+$problem; }the output lacks '$text'"
  done
  for tail in "${tails[@]}"; do
    if grep -qF -- "$tail" "$log"; then problem="${problem:+$problem; }the output shows a secret value"; fi
  done
  if [[ -n "$problem" ]]; then
    echo "FAIL: $name ($problem)" >&2
    tail -n 30 "$log" >&2
    failures=$((failures + 1))
  else
    echo "PASS: $name"
  fi
}

# staged_case <name> <expected status> <file content> [text the output must hold...]
staged_case() {
  local name="$1" expected="$2" content="$3" status=0
  shift 3
  local repo="$temporary/staged-$name" log="$temporary/staged-$name.log"
  fixture_repo "staged-$name"
  printf 'retries = 3\n%s\n' "$content" >"$repo/config.txt"
  git -C "$repo" add config.txt
  (cd "$repo" && "$folder/gitleaks.sh" staged) >"$log" 2>&1 || status=$?
  check_result "staged: $name" "$expected" "$status" "$log" "$@"
}

staged_case github 1 "token = \"$(github_token)\"" 'config.txt:2' 'github-pat'
staged_case openrouter 1 "OPENROUTER_API_KEY=$(openrouter_key)" 'config.txt:2' 'openrouter-api-key'
staged_case groq 1 "GROQ_API_KEY=$(groq_key)" 'config.txt:2' 'groq-api-key'
staged_case 'inline allow comment' 1 "token = \"$(github_token)\" # gitleaks:allow" 'config.txt:2'
staged_case clean 0 'timeout = 30'

staged_special() {
  local name="$1" expected="$2" status=0 repo="$temporary/special-$1" log="$temporary/special-$1.log"
  fixture_repo "special-$name"
  case "$name" in
    removal)
      # Removing a committed secret is the fix, so it must pass.
      printf 'token = "%s"\n' "$(github_token)" >"$repo/config.txt"
      git -C "$repo" add config.txt
      fixture_commit "$repo" -m 'Add a secret'
      printf 'retries = 3\n' >"$repo/config.txt"
      git -C "$repo" add config.txt
      ;;
    attributes)
      # A committed attribute that makes Git omit a file's lines must not hide them.
      printf '* -diff\n' >"$repo/.gitattributes"
      git -C "$repo" add .gitattributes
      fixture_commit "$repo" -m 'Set attributes'
      printf 'token = "%s"\n' "$(github_token)" >"$repo/config.txt"
      git -C "$repo" add config.txt
      ;;
    'no scanner')
      # A runtime that cannot start Gitleaks blocks the commit instead of passing it.
      mkdir -p "$temporary/stubs"
      printf '#!/bin/sh\nexit 125\n' >"$temporary/stubs/docker"
      printf '#!/bin/sh\nexit 125\n' >"$temporary/stubs/podman"
      chmod +x "$temporary/stubs/docker" "$temporary/stubs/podman"
      printf 'retries = 3\n' >"$repo/config.txt"
      git -C "$repo" add config.txt
      (cd "$repo" && PATH="$temporary/stubs:$PATH" "$folder/gitleaks.sh" staged) >"$log" 2>&1 || status=$?
      check_result "staged: $name" "$expected" "$status" "$log" "${@:3}"
      return
      ;;
  esac
  (cd "$repo" && "$folder/gitleaks.sh" staged) >"$log" 2>&1 || status=$?
  check_result "staged: $name" "$expected" "$status" "$log" "${@:3}"
}

staged_special removal 0
staged_special attributes 1 'config.txt:1' 'github-pat'
staged_special 'no scanner' 2 'could not run'

hook_cases() {
  local repo="$temporary/hook" log="$temporary/hook.log" status=0 commits
  fixture_repo hook
  (cd "$repo" && "$folder/gitleaks.sh" install-hook) >"$log" 2>&1 || status=$?
  check_result 'hook: installs' 0 "$status" "$log" 'installed'

  # git commit -a hands the hook a temporary index, which the scan must read.
  printf 'token = "%s"\n' "$(github_token)" >"$repo/notes.txt"
  status=0
  fixture_commit "$repo" -am 'Leak a secret' >"$log" 2>&1 || status=$?
  commits="$(git -C "$repo" rev-list --count HEAD)"
  check_result "hook: blocks commit -a (commits: $commits)" '1 1' "$status $commits" "$log" 'notes.txt:1' 'github-pat'

  printf 'retries = 3\n' >"$repo/notes.txt"
  status=0
  fixture_commit "$repo" -am 'Change a setting' >"$log" 2>&1 || status=$?
  check_result 'hook: passes a clean commit' 0 "$status" "$log"

  status=0
  (cd "$repo" && "$folder/gitleaks.sh" install-hook) >"$log" 2>&1 || status=$?
  check_result 'hook: reinstalling is a no-op' 0 "$status" "$log" 'already installed'

  fixture_repo hook-foreign
  printf '#!/bin/sh\nexit 0\n' >"$temporary/hook-foreign/.git/hooks/pre-commit"
  status=0
  (cd "$temporary/hook-foreign" && "$folder/gitleaks.sh" install-hook) >"$log" 2>&1 || status=$?
  check_result 'hook: never replaces another hook' 2 "$status" "$log" 'already exists'

  fixture_repo hook-path
  git -C "$temporary/hook-path" config core.hooksPath .githooks
  status=0
  (cd "$temporary/hook-path" && "$folder/gitleaks.sh" install-hook) >"$log" 2>&1 || status=$?
  check_result 'hook: refuses when core.hooksPath hides it' 2 "$status" "$log" 'core.hooksPath'
}

hook_cases
# --- end of staged and hook cases ---

history_case() {
  local name="$1" expected="$2" status=0 repo="$temporary/history-$1" log="$temporary/history-$1.log"
  fixture_repo "history-$name"
  case "$name" in
    'removed secret' | attributes)
      # Every commit is scanned, so a secret removed in a later commit still fails.
      printf 'token = "%s"\n' "$(github_token)" >"$repo/config.txt"
      git -C "$repo" add config.txt
      fixture_commit "$repo" -m 'Add a secret'
      printf 'retries = 3\n' >"$repo/config.txt"
      if [[ "$name" == attributes ]]; then printf '* -diff\n' >"$repo/.gitattributes"; fi
      git -C "$repo" add -A
      fixture_commit "$repo" -m 'Remove it'
      ;;
    'checkout rules')
      printf '[allowlist]\npaths = [".*"]\n' >"$repo/.gitleaks.toml"
      ;;
  esac
  "$repo/$folder/gitleaks.sh" git >"$log" 2>&1 || status=$?
  check_result "history: $name" "$expected" "$status" "$log" "${@:3}"
}

history_case clean 0
history_case 'removed secret' 1 'github-pat' 'config.txt'
history_case attributes 1 'github-pat' 'config.txt'
history_case 'checkout rules' 2 'would change the scan'

if [[ "$failures" != 0 ]]; then
  echo "FAIL: $failures scan tests" >&2
  exit 1
fi
