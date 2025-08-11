#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

// 1) bump version + tag with standard-version
const type = process.argv[2] || 'patch'; // patch|minor|major
execSync(`npx --yes standard-version --release-as ${type}`, { stdio: 'inherit' });

// 2) figure out tags (current & previous)
const tags = execSync('git tag --sort=-v:refname', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
const currentTag = tags[0];
const previousTag = tags[1] || '';

// 3) read new version from package.json
// after standard-version, package.json is already bumped
// (avoid require cache by reading text)
const pkg = JSON.parse(execSync('cat package.json', { encoding: 'utf8' }));
const version = pkg.version;

// 4) collect commits between previousTag..currentTag
const range = previousTag ? `${previousTag}..${currentTag}` : currentTag;
const raw = execSync(`git log ${range} --pretty=format:%H%n%s%n%b%n==END==`, { encoding: 'utf8' });

const blocks = raw.split('\n==END==').map(s => s.trim()).filter(Boolean);

// 5) parse Conventional Commits (lightweight parser)
function parseSubject(subj) {
  // e.g. feat(scope)!: message
  const m = subj.match(/^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!m) return { type: 'other', scope: null, breaking: false, description: subj };
  return {
    type: m[1],
    scope: m[3] || null,
    breaking: Boolean(m[4]),
    description: m[5],
  };
}

function extractBreaking(body) {
  const lines = body.split('\n');
  const notes = [];
  let breaking = false;
  for (const ln of lines) {
    const idx = ln.toLowerCase().indexOf('breaking change');
    if (idx !== -1) {
      breaking = true;
      notes.push(ln.substring(idx).replace(/^breaking change:\s*/i, '').trim());
    }
  }
  return { breaking, notes };
}

const commits = [];
for (const block of blocks) {
  const [hash, subject, ...bodyLines] = block.split('\n');
  const body = bodyLines.join('\n');
  const s = parseSubject(subject);
  const br = extractBreaking(body);
  commits.push({
    hash,
    shortHash: hash.substring(0, 7),
    type: s.type,
    scope: s.scope,
    subject: s.description,
    breaking: s.breaking || br.breaking,
    notes: br.notes,
    body: body || ''
  });
}

// 6) group by common buckets
const buckets = {
  features: commits.filter(c => c.type === 'feat'),
  fixes: commits.filter(c => c.type === 'fix'),
  perf: commits.filter(c => c.type === 'perf'),
  refactor: commits.filter(c => c.type === 'refactor'),
  docs: commits.filter(c => c.type === 'docs'),
  chores: commits.filter(c => c.type === 'chore' || c.type === 'build' || c.type === 'ci'),
  tests: commits.filter(c => c.type === 'test'),
  others: commits.filter(c =>
    !['feat','fix','perf','refactor','docs','chore','build','ci','test'].includes(c.type)),
  breaking: commits.filter(c => c.breaking),
};

const out = {
  version,
  tag: currentTag,
  previousTag: previousTag || null,
  date: new Date().toISOString(),
  stats: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
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
  commits, // full detail if you want it
};

function pick(c) {
  return {
    hash: c.shortHash,
    type: c.type,
    scope: c.scope,
    subject: c.subject,
    breaking: c.breaking,
    notes: c.notes,
  };
}

// 7) write JSON file
const file = join(process.cwd(), 'release-notes', `release-v${version}.json`);
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
console.log(`\n✅ JSON release notes written to: ${file}\n`);

// 8) commit the JSON notes
execSync(`git add "${file}"`, { stdio: 'inherit' });
execSync(`git commit -m "docs(release): add JSON notes for v${version}"`, { stdio: 'inherit' });

console.log('🎯 Done. Use: npm run release:push  # to push commit + tags');
