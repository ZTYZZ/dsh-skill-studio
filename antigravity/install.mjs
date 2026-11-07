#!/usr/bin/env node
/**
 * Install the Antigravity skill-studio plugin and register every known agent
 * skill root in ~/.gemini/config/skills.json.
 *
 *   node antigravity/install.mjs
 *   node antigravity/install.mjs --force
 *   node antigravity/install.mjs --uninstall
 */
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const home = os.homedir();
const config = path.join(home, '.gemini', 'config');
const pluginSource = path.join(here, 'plugin');
const pluginTarget = path.join(config, 'plugins', 'skill-studio');
const skillsJson = path.join(config, 'skills.json');
const template = JSON.parse(await readFile(path.join(here, 'skills.json'), 'utf8'));

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const uninstall = args.has('--uninstall');
const dryRun = args.has('--dry-run');

async function readCurrent() {
  if (!existsSync(skillsJson)) return { entries: [] };
  const text = await readFile(skillsJson, 'utf8');
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
    throw new Error(`${skillsJson} has no entries array; refusing to rewrite it.`);
  }
  return parsed;
}

if (uninstall) {
  if (dryRun) {
    console.log(`Would remove ${pluginTarget} and Skill Studio entries from ${skillsJson}`);
  } else {
    await rm(pluginTarget, { recursive: true, force: true });
    const current = await readCurrent();
    const ours = new Set(template.entries.map((entry) => entry.path));
    current.entries = current.entries.filter((entry) => !ours.has(entry.path));
    await writeFile(skillsJson, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    console.log('Removed the Skill Studio plugin and its skill entries.');
  }
  process.exit(0);
}

if (existsSync(pluginTarget) && !force) {
  console.error(`Already installed at ${pluginTarget}. Use --force to replace it.`);
  process.exit(1);
}

if (dryRun) {
  console.log(`Would install ${pluginSource} → ${pluginTarget}`);
  console.log(`Would merge ${template.entries.length} entries into ${skillsJson}`);
  process.exit(0);
}

await mkdir(path.dirname(pluginTarget), { recursive: true });
if (existsSync(pluginTarget)) {
  const backupRoot = path.join(config, '.plugin-backups');
  await mkdir(backupRoot, { recursive: true });
  const backup = path.join(backupRoot, `skill-studio-${Date.now()}`);
  await rename(pluginTarget, backup);
  console.log(`Backed up the old plugin to ${backup}`);
}
await cp(pluginSource, pluginTarget, { recursive: true });

await mkdir(path.join(config, 'skills'), { recursive: true });
const current = await readCurrent();
if (existsSync(skillsJson)) {
  await cp(skillsJson, `${skillsJson}.bak-${Date.now()}`);
}
const byPath = new Map(current.entries.map((entry) => [entry.path, entry]));
for (const entry of template.entries) {
  if (!byPath.has(entry.path)) byPath.set(entry.path, entry);
}
current.entries = [...byPath.values()];
await writeFile(skillsJson, `${JSON.stringify(current, null, 2)}\n`, 'utf8');

console.log(`Installed Skill Studio → ${pluginTarget}`);
console.log(`Updated ${skillsJson} (${current.entries.length} roots).`);
console.log('Restart Antigravity, then open Settings → Customizations / Skills.');
console.log('Ask: “列出本机技能” or run the skill-studio skill.');
