import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  agentOf,
  discoverExternalDirs,
  readExternalSkill,
  resolveExternalDirs,
  scanExternalSkills,
} from '../lib/external.js';

async function writeSkill(root, id, name, title) {
  const directory = path.join(root, id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${title} 的描述。\n---\n\n# ${title}\n\n步骤。\n`,
    'utf8',
  );
}

test('discovers known agent roots and skips DSH-owned roots', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'external-home-'));
  try {
    await writeSkill(path.join(home, '.codex', 'skills'), 'codex-one', 'codex-one', 'Codex 技能');
    await writeSkill(path.join(home, '.cursor', 'skills-cursor'), 'cursor-one', 'cursor-one', 'Cursor 技能');
    await writeSkill(path.join(home, '.grok', 'bundled', 'skills'), 'grok-one', 'grok-one', 'Grok 技能');
    await writeSkill(path.join(home, '.dsh', 'skills'), 'dsh-one', 'dsh-one', 'DSH 技能');
    await writeSkill(path.join(home, '.agents', 'skills'), 'agents-one', 'agents-one', 'Agents 技能');

    const dirs = discoverExternalDirs(home);
    assert.ok(dirs.some((dir) => dir.endsWith('/.codex/skills')));
    assert.ok(dirs.some((dir) => dir.endsWith('/.cursor/skills-cursor')));
    assert.ok(dirs.some((dir) => dir.endsWith('/.grok/bundled/skills')));
    assert.ok(!dirs.some((dir) => dir.includes('/.dsh/')));
    assert.ok(!dirs.some((dir) => dir.includes('/.agents/')));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('scans external skills with Chinese display names and deduplicates names', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'external-scan-'));
  try {
    const codex = path.join(home, '.codex', 'skills');
    const cursor = path.join(home, '.cursor', 'skills-cursor');
    await writeSkill(codex, 'codex-one', 'shared-name', '中文标题甲');
    await writeSkill(codex, 'codex-two', 'codex-two', '中文标题乙');
    await writeSkill(cursor, 'cursor-one', 'shared-name', '重复名字');
    await symlink(path.join(home, 'missing'), path.join(codex, 'broken-link'));

    const skills = await scanExternalSkills([codex, cursor]);
    assert.equal(skills.length, 2);
    const shared = skills.find((skill) => skill.name === 'shared-name');
    assert.equal(shared.displayName, '中文标题甲');
    assert.equal(shared.metadata.agent, 'Codex');
    assert.ok(skills.every((skill) => skill.provider === 'skill-studio-external'));
    assert.equal(agentOf(cursor), 'Cursor');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('reads an external skill only through the configured roots', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'external-read-'));
  try {
    const codex = path.join(home, '.codex', 'skills');
    await writeSkill(codex, 'safe-skill', 'safe-skill', '安全标题');
    const file = path.join(codex, 'safe-skill', 'SKILL.md');
    const skill = await readExternalSkill([codex], file);
    assert.equal(skill.displayName, '安全标题');
    assert.match(skill.body, /步骤/);
    await assert.rejects(readExternalSkill([codex], path.join(home, 'outside.md')), /outside/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('resolves explicit roots and the disable switch', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'external-config-'));
  try {
    const root = path.join(home, 'custom-skills');
    await writeSkill(root, 'custom-one', 'custom-one', '自定义');
    const dirs = resolveExternalDirs({
      externalSkillDirs: [root],
      autoDiscoverExternalSkills: false,
    });
    assert.deepEqual(dirs, [root]);
    assert.deepEqual(resolveExternalDirs({ externalSkillDirs: [] }), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('skips names the registry cannot accept', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'external-invalid-'));
  try {
    const codex = path.join(home, '.codex', 'skills');
    await writeSkill(codex, 'valid-name', 'valid-name', '合法');
    await writeSkill(codex, 'bad-name', 'generative_ui', '非法下划线');
    const skills = await scanExternalSkills([codex]);
    assert.deepEqual(skills.map((skill) => skill.name), ['valid-name']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
