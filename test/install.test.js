import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installFromSource, parseSource } from '../lib/install.js';
import { createSkillStore } from '../lib/skills.js';

async function withTmp(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-install-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

function fakeFetch(routes) {
  return async (url) => {
    const key = String(url);
    if (!(key in routes)) return response('', 404);
    const value = routes[key];
    return response(typeof value === 'string' ? value : JSON.stringify(value));
  };
}

const SKILL_TEXT = `---
name: demo-skill
description: Demonstrate installing a skill. Use when testing installation.
license: MIT
---

# Demo

Read \`references/note.md\`.
`;

test('parses local, GitHub, and raw sources', () => {
  assert.equal(parseSource('/tmp/skills/demo').kind, 'local');
  assert.equal(parseSource('~/skills/demo').kind, 'local');
  const tree = parseSource('https://github.com/acme/skills/tree/main/skills/demo');
  assert.deepEqual(tree, { kind: 'github', owner: 'acme', repo: 'skills', ref: 'main', path: 'skills/demo' });
  const blob = parseSource('https://github.com/acme/skills/blob/main/skills/demo/SKILL.md');
  assert.equal(blob.kind, 'github-file');
  assert.equal(blob.path, 'skills/demo/SKILL.md');
  const raw = parseSource('https://raw.githubusercontent.com/acme/skills/main/skills/demo/SKILL.md');
  assert.equal(raw.kind, 'github-file');
  assert.equal(parseSource('acme/skills/skills/demo').kind, 'github');
  assert.equal(parseSource('https://example.com/SKILL.md').kind, 'url');
  assert.throws(() => parseSource('not a source'), /Unrecognized source/);
});

test('installs a local directory bundle and preserves unknown frontmatter', async () => {
  await withTmp(async (root) => {
    const source = path.join(root, 'source');
    const storeRoot = path.join(root, 'store');
    await mkdir(path.join(source, 'references'), { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), SKILL_TEXT, 'utf8');
    await writeFile(path.join(source, 'references', 'note.md'), '# Note\n', 'utf8');

    const store = createSkillStore({ root: storeRoot });
    const result = await installFromSource({ source, store });
    assert.equal(result.installed, true);
    assert.equal(result.name, 'demo-skill');

    const read = await store.read('demo-skill');
    assert.match(read.body, /Read `references\/note.md`/);
    assert.deepEqual(read.files.map((file) => file.path), ['references/note.md']);

    const installed = await readFile(path.join(storeRoot, 'demo-skill', 'SKILL.md'), 'utf8');
    assert.match(installed, /\nlicense: MIT\n/);

    const provenance = JSON.parse(
      await readFile(path.join(storeRoot, 'demo-skill', '.skill-studio.json'), 'utf8'),
    );
    assert.equal(provenance.source, source);
    assert.match(provenance.installedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test('skips binary resources and reports them', async () => {
  await withTmp(async (root) => {
    const source = path.join(root, 'source');
    await mkdir(path.join(source, 'assets'), { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), SKILL_TEXT, 'utf8');
    await writeFile(path.join(source, 'assets', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
    const store = createSkillStore({ root: path.join(root, 'store') });
    const result = await installFromSource({ source, store });
    assert.deepEqual(result.files, []);
    assert.ok(result.warnings.some((warning) => warning.includes('logo.png')));
  });
});

test('installs a flat SKILL.md file', async () => {
  await withTmp(async (root) => {
    const file = path.join(root, 'standalone.md');
    await writeFile(file, SKILL_TEXT, 'utf8');
    const store = createSkillStore({ root: path.join(root, 'store') });
    const result = await installFromSource({ source: file, store });
    assert.equal(result.name, 'demo-skill');
    assert.equal((await store.read('demo-skill')).files.length, 0);
  });
});

test('installs a GitHub directory with resources through the contents API', async () => {
  await withTmp(async (root) => {
    const source = 'https://github.com/acme/skills/tree/main/skills/demo';
    const fetchImpl = fakeFetch({
      'https://api.github.com/repos/acme/skills/contents/skills/demo?ref=main': [
        {
          type: 'file',
          name: 'SKILL.md',
          path: 'skills/demo/SKILL.md',
          download_url: 'https://raw.githubusercontent.com/acme/skills/main/skills/demo/SKILL.md',
        },
        { type: 'dir', name: 'references', path: 'skills/demo/references' },
      ],
      'https://api.github.com/repos/acme/skills/contents/skills/demo/references?ref=main': [
        {
          type: 'file',
          name: 'note.md',
          path: 'skills/demo/references/note.md',
          download_url: 'https://raw.githubusercontent.com/acme/skills/main/skills/demo/references/note.md',
        },
      ],
      'https://raw.githubusercontent.com/acme/skills/main/skills/demo/SKILL.md': SKILL_TEXT,
      'https://raw.githubusercontent.com/acme/skills/main/skills/demo/references/note.md': '# Note\n',
    });

    const store = createSkillStore({ root: path.join(root, 'store') });
    const result = await installFromSource({ source, store, fetchImpl });
    assert.equal(result.name, 'demo-skill');
    assert.deepEqual(result.files, ['references/note.md']);
    assert.match((await store.read('demo-skill')).body, /Demo/);
  });
});

test('installs a raw SKILL.md URL as a single file', async () => {
  await withTmp(async (root) => {
    const url = 'https://example.com/skills/demo/SKILL.md';
    const fetchImpl = fakeFetch({ [url]: SKILL_TEXT });
    const store = createSkillStore({ root: path.join(root, 'store') });
    const result = await installFromSource({ source: url, store, fetchImpl });
    assert.equal(result.name, 'demo-skill');
    assert.equal((await store.read('demo-skill')).files.length, 0);
  });
});

test('rejects private network sources and invalid skills before writing', async () => {
  await withTmp(async (root) => {
    const store = createSkillStore({ root: path.join(root, 'store') });
    await assert.rejects(
      installFromSource({ source: 'http://127.0.0.1/SKILL.md', store, fetchImpl: async () => response('') }),
      /loopback|private/,
    );

    const invalid = path.join(root, 'invalid');
    await mkdir(invalid);
    await writeFile(path.join(invalid, 'SKILL.md'), '---\nname: broken\n---\n', 'utf8');
    await assert.rejects(installFromSource({ source: invalid, store }), /invalid: description is required/);
    assert.equal((await store.list()).skills.length, 0);
  });
});
