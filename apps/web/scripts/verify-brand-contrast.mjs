// Checks the RGPL lockup's pairings on the surface OpsBoard actually draws it on: the page background behind the
// sidebar (--ob-bg), not the canonical brand off-white. Colors are read from the stylesheet and the mark itself,
// so a change to either is checked. WCAG 2.x contrast ratios; OpsBoard holds text to AA (docs/accessibility.md).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const styles = readFileSync(join(webRoot, 'src/styles.scss'), 'utf8');
const mark = readFileSync(join(webRoot, 'public/brand/g-compact-iris.svg'), 'utf8');

function token(name) {
  const match = styles.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!match) throw new Error(`--${name} is not a six-digit hex color in src/styles.scss`);
  return match[1];
}

const luminance = (hex) => {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const surface = token('ob-bg');
const ink = token('ob-brand-ink');
const ground = token('ob-brand-ground');
const iris = mark.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/)?.[1];
if (!iris) throw new Error('The g mark has no Iris square');

const checks = [
  {
    what: 'lockup name on the sidebar surface',
    foreground: ink,
    background: surface,
    minimum: 4.5,
  },
  {
    what: 'Iris mark against the sidebar surface',
    foreground: iris,
    background: surface,
    minimum: 3,
  },
  {
    what: 'lockup name on the forced-colors ground',
    foreground: ink,
    background: ground,
    minimum: 4.5,
  },
];

const failures = checks.filter(
  (check) => contrast(check.foreground, check.background) < check.minimum,
);
for (const check of checks) {
  const value = contrast(check.foreground, check.background).toFixed(2);
  console.log(
    `${failures.includes(check) ? 'FAIL' : 'ok'}  ${check.what}: ${value}:1 (at least ${check.minimum}:1)`,
  );
}
if (failures.length > 0) process.exit(1);
