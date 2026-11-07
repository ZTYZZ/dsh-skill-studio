#!/usr/bin/env node
/**
 * Skill Studio for Antigravity (agy).
 *
 * Lists, reads, and installs SKILL.md bundles that already live in any agent's
 * skill root. No dependencies; Node 20+.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const CONFIG = path.join(HOME, '.gemini', 'config');
const SKILLS_JSON = path.join(CONFIG, 'skills.json');
const INSTALL_ROOT = path.join(CONFIG, 'skills');
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function expand(input) {
  if (input === '~') return HOME;
  if (input.startsWith('~/')) return path.join(HOME, input.slice(2));
  return path.resolve(input);
}

function agentOf(root) {
  const lower = root.toLowerCase();
  if (lower.includes('/.codex/')) return 'Codex';
  if (lower.includes('/.claude/')) return 'Claude';
  if (lower.includes('/.cursor/')) return 'Cursor';
  if (lower.includes('/.grok/')) return 'Grok';
  if (lower.includes('/.gemini/')) return 'Gemini';
  if (lower.includes('/.workbuddy')) return 'WorkBuddy';
  if (lower.includes('/.hub/')) return 'Hub';
  if (lower.includes('/.dsh/')) return 'DSH';
  if (lower.includes('/.agents/')) return 'Agents';
  const name = path.basename(path.dirname(root));
  return name.replace(/^\./, '').replace(/[-_]/g, ' ') || 'Other';
}

async function configuredRoots() {
  const roots = [];
  try {
    const config = JSON.parse(await readFile(SKILLS_JSON, 'utf8'));
    for (const entry of config.entries ?? []) {
      if (typeof entry?.path === 'string') roots.push(expand(entry.path));
    }
  } catch {
    // No skills.json yet: fall back to the known roots below.
  }
  roots.push(path.join(CONFIG, 'skills'));
  roots.push(path.join(HOME, '.gemini', 'antigravity', 'skills'));
  roots.push(path.join(HOME, '.gemini', 'antigravity', 'builtin', 'skills'));
  try {
    const plugins = await readdir(path.join(CONFIG, 'plugins'), { withFileTypes: true });
    for (const plugin of plugins) {
      if (plugin.isDirectory()) roots.push(path.join(CONFIG, 'plugins', plugin.name, 'skills'));
    }
  } catch {
    // No plugins directory yet.
  }

  let directory = process.cwd();
  for (;;) {
    for (const dot of ['.agents', '.agent', '_agents', '_agent']) {
      roots.push(path.join(directory, dot, 'skills'));
    }
    if (existsSync(path.join(directory, '.git'))) break;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return [...new Set(roots)];
}

function parseSkill(text) {
  const source = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(source);
  if (match === null) return null;
  const body = source.slice(match[0].length);
  const data = {};
  const lines = match[1].split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const field = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(lines[index]);
    if (field === null) continue;
    let value = field[2].trim();
    if (/^[|>][+-]?$/.test(value)) {
      const block = [];
      while (index + 1 < lines.length && (/^[ \t]/.test(lines[index + 1]) || lines[index + 1] === '')) {
        block.push(lines[index + 1]);
        index += 1;
      }
      value = block.map((line) => line.replace(/^[ \t]{2}/, '')).join(' ').trim();
    }
    if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    data[field[1]] = value;
  }
  const heading = /^#\s+(.+?)\s*$/m.exec(body);
  return { data, body, displayName: heading === null ? data.name : heading[1].trim() };
}

async function scanSkillRoot(root) {
  const skills = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return skills;
  }
  const agent = agentOf(root);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(root, entry.name);
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const info = await stat(absolute);
        isDirectory = info.isDirectory();
        isFile = info.isFile();
      } catch {
        continue;
      }
    }
    let file;
    if (isDirectory) file = path.join(absolute, 'SKILL.md');
    else if (isFile && entry.name.endsWith('.md')) file = absolute;
    else continue;

    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const document = parseSkill(text);
    if (document === null) continue;
    const name = document.data.name;
    const description = document.data.description;
    if (typeof name !== 'string' || !NAME_PATTERN.test(name)) continue;
    if (typeof description !== 'string' || description.trim() === '') continue;
    skills.push({
      name,
      displayName: document.displayName || name,
      description: description.trim(),
      path: file,
      root,
      agent,
      body: document.body,
    });
  }
  return skills;
}

async function scanAll() {
  const seen = new Set();
  const skills = [];
  for (const root of await configuredRoots()) {
    for (const skill of await scanSkillRoot(root)) {
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      skills.push(skill);
    }
  }
  return skills;
}

function groupSkills(skills) {
  const groups = new Map();
  for (const skill of skills) {
    const group = groups.get(skill.agent) ?? [];
    group.push(skill);
    groups.set(skill.agent, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh'));
  }
  return [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}

function printList(skills) {
  console.log(`本机技能：${skills.length} 个（${groupSkills(skills).length} 个来源）\n`);
  for (const [agent, group] of groupSkills(skills)) {
    console.log(`${agent} (${group.length})`);
    for (const skill of group) {
      const title = skill.displayName.padEnd(28, ' ');
      console.log(`  ${title} ${skill.name}`);
    }
    console.log('');
  }
}

async function findSkill(name) {
  const skills = await scanAll();
  const skill = skills.find((candidate) => candidate.name === name || candidate.displayName === name);
  if (skill === undefined) throw new Error(`没有找到技能 "${name}"。先运行 list 查看本机技能。`);
  return skill;
}

async function install(source) {
  const raw = String(source ?? '').trim();
  if (raw === '') throw new Error('用法：install <本地目录 | GitHub tree URL | raw SKILL.md URL>');

  let temporary;
  try {
    let skillDirectory;
    if (/^https?:\/\//i.test(raw)) {
      const githubTree = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/.exec(raw);
      if (githubTree !== null) {
        const [, owner, repo, ref, subpath] = githubTree;
        temporary = await mkdtemp(path.join(os.tmpdir(), 'agy-skill-'));
        execFileSync('git', ['clone', '--depth', '1', '--branch', ref, `https://github.com/${owner}/${repo}.git`, temporary], {
          stdio: 'pipe',
        });
        skillDirectory = path.join(temporary, subpath);
      } else {
        const response = await fetch(raw);
        if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
        const text = await response.text();
        const document = parseSkill(text);
        if (document === null) throw new Error('这个 URL 不是 SKILL.md（缺少 frontmatter）。');
        const name = document.data.name;
        if (!NAME_PATTERN.test(name)) throw new Error(`技能名不合法：${name}`);
        const target = path.join(INSTALL_ROOT, name);
        if (existsSync(target)) throw new Error(`技能 "${name}" 已存在：${target}`);
        await mkdir(target, { recursive: true });
        await writeFile(path.join(target, 'SKILL.md'), text, 'utf8');
        console.log(`已安装 "${name}" → ${target}`);
        return;
      }
    } else {
      skillDirectory = expand(raw);
    }

    const info = await stat(skillDirectory);
    let file;
    let directory;
    if (info.isDirectory()) {
      directory = skillDirectory;
      file = path.join(skillDirectory, 'SKILL.md');
    } else {
      directory = null;
      file = skillDirectory;
    }
    const text = await readFile(file, 'utf8');
    const document = parseSkill(text);
    if (document === null) throw new Error('来源缺少 SKILL.md 或 frontmatter。');
    const name = document.data.name;
    if (!NAME_PATTERN.test(name)) throw new Error(`技能名不合法：${name}`);
    const target = path.join(INSTALL_ROOT, name);
    if (existsSync(target)) throw new Error(`技能 "${name}" 已存在：${target}`);
    await mkdir(INSTALL_ROOT, { recursive: true });
    if (directory === null) {
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, 'SKILL.md'), text, 'utf8');
    } else {
      await cp(directory, target, { recursive: true });
    }
    console.log(`已安装 "${name}" → ${target}`);
  } finally {
    if (temporary !== undefined) await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const [command = 'list', ...args] = process.argv.slice(2);
  if (command === 'list') {
    const skills = await scanAll();
    if (args.includes('--json')) {
      console.log(JSON.stringify(skills.map(({ body, ...rest }) => rest), null, 2));
      return;
    }
    printList(skills);
    return;
  }
  if (command === 'read' || command === 'where') {
    const name = args[0];
    if (name === undefined) throw new Error(`用法：${command} <name>`);
    const skill = await findSkill(name);
    if (command === 'where') {
      console.log(skill.path);
      return;
    }
    console.log(`# ${skill.displayName} (${skill.name})\n${skill.path}\n\n${skill.body}`);
    return;
  }
  if (command === 'install') {
    await install(args[0]);
    return;
  }
  console.log(`本机技能工坊

用法：
  node scripts/skill-studio.mjs list            列出所有技能（中文标题优先）
  node scripts/skill-studio.mjs list --json     输出 JSON
  node scripts/skill-studio.mjs read <name>     查看技能正文
  node scripts/skill-studio.mjs where <name>    查看技能路径
  node scripts/skill-studio.mjs install <来源>  安装本地目录 / GitHub tree / raw SKILL.md

技能来源由 ~/.gemini/config/skills.json 与全局 skills 目录决定。
安装写入 ${INSTALL_ROOT}。`);
}

main().catch((error) => {
  console.error(`错误：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
