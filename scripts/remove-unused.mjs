import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import depcheck from 'depcheck';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = process.cwd();
const PKG_PATH = path.join(ROOT, 'package.json');
const CONFIG_PATH = path.join(ROOT, 'depcheck.config.cjs');

if (!fs.existsSync(PKG_PATH)) {
  console.error('package.json not found in', ROOT);
  process.exit(1);
}
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('depcheck.config.cjs not found in', ROOT);
  process.exit(1);
}

// Load config and keep list
const cfg = await import(pathToFileURL(CONFIG_PATH).href).catch(() => null);
function pathToFileURL(p) {
  const u = new URL('file://');
  u.pathname = path.resolve(p).replace(/\\/g, '/');
  return u;
}
const KEEP = cfg?.default?._internal_keep || cfg?._internal_keep || [];

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const apply = process.argv.includes('--apply');

const result = await depcheck(ROOT, {
  specials: cfg?.default?.specials ?? cfg?.specials,
  detectors: cfg?.default?.detectors ?? cfg?.detectors,
  ignoreMatches: cfg?.default?.ignoreMatches ?? cfg?.ignoreMatches,
});

const unusedDeps = new Set(result.dependencies || []);
const unusedDevDeps = new Set(result.devDependencies || []);

// Don’t remove anything in KEEP
KEEP.forEach((name) => {
  unusedDeps.delete(name);
  unusedDevDeps.delete(name);
});

// Construct removal lists only if actually present in pkg
const removeDeps = Array.from(unusedDeps).filter((d) => (pkg.dependencies || {})[d]);
const removeDevDeps = Array.from(unusedDevDeps).filter((d) => (pkg.devDependencies || {})[d]);

const rows = [];
removeDeps.forEach((d) => rows.push({ dep: d, section: 'dependencies' }));
removeDevDeps.forEach((d) => rows.push({ dep: d, section: 'devDependencies' }));

console.log('\n📦 Depcheck summary (safe list protected)\n');
if (rows.length === 0) {
  console.log('✅ No removable unused deps found.');
} else {
  console.table(rows);
}

if (!apply || rows.length === 0) {
  console.log('\nDry-run complete. Re-run with "--apply" to actually remove them.\n');
  process.exit(0);
}

// Apply removals
const toRemove = rows.map((r) => r.dep);
if (toRemove.length) {
  console.log('🧹 Removing:', toRemove.join(', '));
  // Use npm since your projects use npm
  const { spawnSync } = await import('node:child_process');
  const rm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['uninstall', ...toRemove], {
    stdio: 'inherit',
  });
  if (rm.status !== 0) process.exit(rm.status);
}

// Dedupe and reinstall to tighten the tree
const { spawnSync } = await import('node:child_process');
spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['dedupe'], { stdio: 'inherit' });
spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], { stdio: 'inherit' });

console.log('\n✅ Unused deps removed, tree deduped & reinstalled.\n');
