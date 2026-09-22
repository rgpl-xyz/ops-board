/**
 * A journey owns what it mutates, so the things it creates carry a name unique
 * to the run. That is what lets the same journey run twice with the same result
 * against a database it does not reset.
 */
export function runName(prefix: string): string {
  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 8);
  return `${prefix} ${stamp}-${noise}`;
}
