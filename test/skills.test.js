import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSkillStore } from '../lib/skills.js';

async function withStore(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-studio-'));
  try {
    await run(createSkillStore({ root }), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('creates, lists, and reads a skill bundle', async () => {
  await withStore(async (store, root) => {
    const created = await store.create({
      name: 'release-notes',
      description: 'Draft release notes from git history. Use when the user asks for a changelog.',
      body: '# Release notes\n\n1. Collect commits.\n',
      files: [{ path: 'references/format.md', content: '## Format\n' }],
    });
    assert.equal(created.created, true);
    assert.equal(created.valid, true);
    assert.deepEqual(created.files.map((file) => file.path), ['references/format.md']);

    const listed = await store.list();
    assert.equal(listed.root, root);
    assert.equal(listed.skills.length, 1);
    assert.equal(listed.skills[0].name, 'release-notes');
    assert.equal(listed.skills[0].valid, true);

    const read = await store.read('release-notes');
    assert.match(read.body, /Collect commits/);
    const resource = await store.read('release-notes', { file: 'references/format.md' });
    assert.equal(resource.content, '## Format\n');
  });
});

test('refuses duplicates until overwrite is true', async () => {
  await withStore(async (store) => {
    await store.create({ name: 'dup-skill', description: 'First.', body: 'one' });
    await assert.rejects(
      store.create({ name: 'dup-skill', description: 'Second.', body: 'two' }),
      /already exists/,
    );
    const replaced = await store.create({
      name: 'dup-skill',
      description: 'Second.',
      body: 'two',
      overwrite: true,
    });
    assert.equal(replaced.description, 'Second.');
    assert.match(replaced.body, /two/);
  });
});

test('updates only supplied fields and preserves unknown frontmatter', async () => {
  await withStore(async (store, root) => {
    await store.create({
      name: 'keep-extra',
      description: 'Original description.',
      body: 'Original body.\n',
      metadata: { owner: 'platform' },
    });
    const skillFile = path.join(root, 'keep-extra', 'SKILL.md');
    const original = await readFile(skillFile, 'utf8');
    await writeFile(skillFile, original.replace(/\n---\n\n/, '\nlicense: MIT\n---\n\n'), 'utf8');

    const updated = await store.update('keep-extra', { description: 'Updated description.' });
    assert.equal(updated.description, 'Updated description.');
    assert.match(updated.body, /Original body/);
    const text = await readFile(skillFile, 'utf8');
    assert.match(text, /\nlicense: MIT\n/);
    assert.match(text, /\nmetadata:\n  owner: platform\n/);
  });
});

test('rewrites resources, removes them, and rejects traversal', async () => {
  await withStore(async (store, root) => {
    await store.create({
      name: 'resources',
      description: 'Has resources.',
      body: 'Body.',
      files: [{ path: 'scripts/run.sh', content: 'echo hi\n' }],
    });
    await store.update('resources', {
      files: [{ path: 'references/deep.md', content: 'deep\n' }],
      removeFiles: ['scripts/run.sh'],
    });
    const read = await store.read('resources');
    assert.deepEqual(read.files.map((file) => file.path), ['references/deep.md']);

    await assert.rejects(
      store.update('resources', { files: [{ path: '../escape.md', content: 'x' }] }),
      /escapes the skill directory/,
    );
    await assert.rejects(
      store.update('resources', { files: [{ path: '/tmp/escape.md', content: 'x' }] }),
      /must be relative/,
    );
    await assert.rejects(
      store.update('resources', { files: [{ path: 'SKILL.md', content: 'x' }] }),
      /SKILL.md is written/,
    );
    assert.equal(await readFile(path.join(root, 'escape.md'), 'utf8').catch(() => null), null);
  });
});

test('moves a skill to the trash after confirmation', async () => {
  await withStore(async (store, root) => {
    await store.create({ name: 'trash-me', description: 'Temporary.', body: 'Body.' });
    await assert.rejects(store.remove('trash-me', 'wrong'), /confirm/);
    const removed = await store.remove('trash-me', 'trash-me');
    assert.equal(removed.deleted, true);
    assert.match(removed.trashedTo, /\.trash\/trash-me-/);
    assert.equal((await store.list()).skills.length, 0);
    const trashed = await readFile(path.join(removed.trashedTo, 'SKILL.md'), 'utf8');
    assert.match(trashed, /name: trash-me/);
    assert.ok(removed.trashedTo.startsWith(root));
  });
});

test('discovers flat markdown skills and updates them in place', async () => {
  await withStore(async (store, root) => {
    await writeFile(
      path.join(root, 'legacy.md'),
      '---\nname: legacy\ndescription: Flat skill.\n---\n\nOld body.\n',
      'utf8',
    );
    const listed = await store.list();
    assert.equal(listed.skills.length, 1);
    assert.equal(listed.skills[0].name, 'legacy');
    assert.equal(listed.skills[0].directory, null);

    const updated = await store.update('legacy', { body: 'New body.\n' });
    assert.match(updated.body, /New body/);
    const text = await readFile(path.join(root, 'legacy.md'), 'utf8');
    assert.match(text, /New body/);
  });
});

test('lists invalid entries with diagnostics', async () => {
  await withStore(async (store, root) => {
    await mkdir(path.join(root, 'broken-skill'), { recursive: true });
    await writeFile(path.join(root, 'broken-skill', 'SKILL.md'), 'no frontmatter here\n', 'utf8');
    const listed = await store.list();
    assert.equal(listed.skills.length, 1);
    assert.equal(listed.skills[0].valid, false);
    assert.ok(listed.skills[0].errors.length > 0);
    assert.equal((await store.list({ includeInvalid: false })).skills.length, 0);
  });
});

test('refuses to write through a symbolic link inside a skill', async () => {
  await withStore(async (store, root) => {
    await store.create({ name: 'symlinked', description: 'Symlink test.', body: 'Body.' });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'skill-studio-outside-'));
    try {
      await symlink(outside, path.join(root, 'symlinked', 'references'));
      await assert.rejects(
        store.update('symlinked', {
          files: [{ path: 'references/escape.md', content: 'x' }],
        }),
        /symbolic link/,
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

test('does not publish a partial skill when a resource is invalid', async () => {
  await withStore(async (store, root) => {
    await assert.rejects(
      store.create({
        name: 'partial-skill',
        description: 'Should not exist.',
        body: 'Body.',
        files: [{ path: '../escape.md', content: 'x' }],
      }),
      /escapes the skill directory/,
    );
    assert.equal((await store.list()).skills.length, 0);
    assert.deepEqual(await readdir(root), []);
  });
});

test('validates the skill name before touching the filesystem', async () => {
  await withStore(async (store) => {
    await assert.rejects(
      store.create({ name: 'Bad Name', description: 'Nope.', body: 'Body.' }),
      /kebab-case/,
    );
    await assert.rejects(store.read('missing-skill'), /was not found/);
  });
});

test('lists broken symlinks without breaking the summary shape', async () => {
  await withStore(async (store, root) => {
    await symlink(path.join(root, 'missing-target'), path.join(root, 'broken-link'));
    const listed = await store.list();
    assert.equal(listed.skills.length, 1);
    assert.equal(listed.skills[0].valid, false);
    assert.deepEqual(listed.skills[0].invocation, { modelInvocable: true, userInvocable: true });
  });
});

test('preserves unknown frontmatter when overwriting a skill', async () => {
  await withStore(async (store, root) => {
    await store.create({ name: 'overwrite-extra', description: 'First.', body: 'one' });
    const file = path.join(root, 'overwrite-extra', 'SKILL.md');
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replace(/\n---\n\n/, '\nlicense: MIT\n---\n\n'), 'utf8');
    await store.create({
      name: 'overwrite-extra',
      description: 'Second.',
      body: 'two',
      overwrite: true,
    });
    const replaced = await readFile(file, 'utf8');
    assert.match(replaced, /\nlicense: MIT\n/);
    assert.match(replaced, /description: Second\./);
  });
});

test('rejects resource operations on a flat skill', async () => {
  await withStore(async (store, root) => {
    await writeFile(
      path.join(root, 'flat.md'),
      '---\nname: flat\ndescription: Flat.\n---\n\nBody.\n',
      'utf8',
    );
    await assert.rejects(
      store.update('flat', { files: [{ path: 'references/x.md', content: 'x' }] }),
      /no resource files/,
    );
  });
});
