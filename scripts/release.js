#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('node:child_process');
const { writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

// args: release type + extra flags for standard-version
// usage: node scripts/release.js patch -m "chore(release): v%s – my note"
const args = process.argv.slice(2);
const type = args[0] || 'patch';

// Build command with properly quoted arguments
let command = `npx --yes standard-version --release-as ${type}`;

// Process additional arguments (everything after the release type)
if (args.length > 1) {
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    // Check if this is a flag like -m or --message
    if (arg.startsWith('-')) {
      command += ` ${arg}`;
      // If next arg exists and doesn't start with -, it's the value for this flag
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        i++;
        const value = args[i];
        // Properly escape and quote the value
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        command += ` "${escaped}"`;
      }
    } else {
      // Standalone argument
      const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      command += ` "${escaped}"`;
    }
  }
}

console.log(`Executing: ${command}`);

// 1) bump version + tag (allow custom -m)
try {
  execSync(command, { stdio: 'inherit', shell: true });
} catch (error) {
  console.error('Failed to run standard-version:', error.message);
  process.exit(1);
}

// 2) determine tags
const rawTags = execSync('git tag --sort=-version:refname', { encoding: 'utf8' }).trim();
const tags = rawTags ? rawTags.split('\n') : [];

if (tags.length === 0) {
  console.warn('⚠️  No git tags found. This may be the first release or tags were not fetched.');
}

const currentTag = tags[0] || 'HEAD';
const previousTag = tags[1] || '';

console.log(`Current tag: ${currentTag}`);
console.log(`Previous tag: ${previousTag || 'none (first release)'}`);

// 3) read bumped version (no require cache)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

// 4) collect commits for range
const range = previousTag ? `${previousTag}..${currentTag}` : currentTag;
console.log(`Collecting commits from range: ${range}`);

const raw = execSync(`git log ${range} --pretty=format:%H%n%s%n%b%n==END==`, { encoding: 'utf8' });

const blocks = raw.split('\n==END==').map(s => s.trim()).filter(Boolean);

// parse conventional commits (same as before) …
function parseSubject(subj) {
  const m = subj.match(/^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!m) return { type: 'other', scope: null, breaking: false, description: subj };
  return { type: m[1], scope: m[3] || null, breaking: !!m[4], description: m[5] };
}
function extractBreaking(body) {
  const lines = body.split('\n');
  const notes = [];
  let breaking = false;
  for (const ln of lines) {
    const i = ln.toLowerCase().indexOf('breaking change');
    if (i !== -1) { breaking = true; notes.push(ln.slice(i).replace(/^breaking change:\s*/i, '').trim()); }
  }
  return { breaking, notes };
}
const commits = blocks.map(block => {
  const [hash, subject, ...bodyLines] = block.split('\n');
  const body = bodyLines.join('\n');
  const s = parseSubject(subject);
  const br = extractBreaking(body);
  return {
    hash, shortHash: hash.slice(0,7), type: s.type, scope: s.scope,
    subject: s.description, breaking: s.breaking || br.breaking, notes: br.notes, body
  };
});
const buckets = {
  features: commits.filter(c => c.type === 'feat'),
  fixes: commits.filter(c => c.type === 'fix'),
  perf: commits.filter(c => c.type === 'perf'),
  refactor: commits.filter(c => c.type === 'refactor'),
  docs: commits.filter(c => c.type === 'docs'),
  chores: commits.filter(c => c.type === 'chore' || c.type === 'build' || c.type === 'ci'),
  tests: commits.filter(c => c.type === 'test'),
  others: commits.filter(c => !['feat','fix','perf','refactor','docs','chore','build','ci','test'].includes(c.type)),
  breaking: commits.filter(c => c.breaking),
};
function pick(c){ return { hash:c.shortHash, type:c.type, scope:c.scope, subject:c.subject, breaking:c.breaking, notes:c.notes }; }
const out = {
  version, tag: currentTag, previousTag: previousTag || null, date: new Date().toISOString(),
  stats: Object.fromEntries(Object.entries(buckets).map(([k,v]) => [k, v.length])),
  sections: {
    features: buckets.features.map(pick),
    fixes: buckets.fixes.map(pick),
    perf: buckets.perf.map(pick),
    refactor: buckets.refactor.map(pick),
    docs: buckets.docs.map(pick),
    chores: buckets.chores.map(pick),
    tests: buckets.tests.map(pick),
    others: buckets.others.map(pick),
    breaking: buckets.breaking.map(pick),
  },
  commits
};
// 7) write JSON + separate commit
const file = join(process.cwd(), 'release-notes', `release-v${version}.json`);
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
execSync(`git add "${file}"`, { stdio: 'inherit' });
execSync(`git commit -m "chore(release): add JSON notes for v${version}"`, { stdio: 'inherit' });

console.log('\n🎯 Done. Push with: npm run release:push\n');