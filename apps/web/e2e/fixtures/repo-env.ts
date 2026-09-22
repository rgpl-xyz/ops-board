import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads the repository's compose env file for the values the API and the
 * design-time EF commands need.
 *
 * `.env` is a compose env file, not a shell script: a value may contain `;` or
 * `=`, so only the first `=` separates the key from the value and nothing is
 * unquoted. Sourcing it in a shell truncates the connection string at its first
 * semicolon.
 */
export function readRepoEnv(repoRoot: string): Record<string, string> {
  const values: Record<string, string> = {};

  let raw: string;
  try {
    raw = readFileSync(join(repoRoot, '.env'), 'utf8');
  } catch {
    return values;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }

  return values;
}
