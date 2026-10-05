// Fails when a copied RGPL brand file differs from brand-assets.json, is missing, or when an unlisted file
// appears in the brand folders. It reads only this repository, so it runs anywhere without the RGPL monorepo.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const inventory = JSON.parse(readFileSync(join(webRoot, 'brand-assets.json'), 'utf8'));
const publicRoot = join(webRoot, inventory.directory);
// Folders that hold only brand files, so anything in them must be listed; a stray file there would ship too.
const brandFolders = ['brand', 'icons'];

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const listFiles = (folder) =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
const isMissing = (error) => error.code === 'ENOENT';

const problems = [];
for (const [file, expected] of Object.entries(inventory.files)) {
  let actual;
  try {
    actual = sha256(join(publicRoot, file));
  } catch (error) {
    if (!isMissing(error)) throw error;
    problems.push(`missing: ${file}`);
    continue;
  }
  if (actual !== expected) {
    problems.push(`changed: ${file} (expected ${expected}, found ${actual})`);
  }
}
for (const folder of brandFolders) {
  let paths;
  try {
    paths = listFiles(join(publicRoot, folder));
  } catch (error) {
    if (!isMissing(error)) throw error;
    problems.push(`missing folder: ${folder}`);
    continue;
  }
  for (const path of paths) {
    const file = relative(publicRoot, path).split(sep).join('/');
    if (!(file in inventory.files)) problems.push(`unlisted: ${file}`);
  }
}

if (problems.length > 0) {
  console.error('Brand files do not match brand-assets.json:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    'To undo an accidental change, restore the file with `git restore`. To update the copies, follow docs/brand.md.',
  );
  process.exit(1);
}
console.log(`Brand files match brand-assets.json (${Object.keys(inventory.files).length} files).`);
