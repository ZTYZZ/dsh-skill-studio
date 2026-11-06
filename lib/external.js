import { existsSync, readdirSync, watch } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { displayNameOf, invocationOf, limits, parseSkillText } from './frontmatter.js';

export const EXTERNAL_PROVIDER = 'skill-studio-external';

/** Known user-facing skill roots, in priority order. */
const KNOWN_ROOTS = [
  '.codex/skills',
  '.claude/skills',
  '.workbuddy/skills',
  '.hub/skills',
  '.gemini/antigravity/skills',
  '.gemini/antigravity/builtin/skills',
  '.cursor/skills-cursor',
  '.grok/bundled/skills',
  '.grok/skills',
  '.openclaw/skills',
  '.reasonix/skills',
  '.workbuddy-ai/skills',
];

const EXCLUDED_HOME_DIRS = new Set(['.dsh', '.agents', 'Library', '.Trash']);
const DEFAULT_DIRS = [path.join(os.homedir(), '.codex', 'skills')];

/**
 * Discover the skill directories of other agent tools under `home`. A root is
 * included only when it contains at least one actual SKILL.md, so empty agent
 * config directories do not appear.
 */
export function discoverExternalDirs(home = os.homedir()) {
  const found = [];
  const add = (candidate) => {
    if (!found.includes(candidate) && hasSkillFiles(candidate)) found.push(candidate);
  };

  for (const relative of KNOWN_ROOTS) add(path.join(home, relative));

  let entries;
  try {
    entries = readdirSync(home, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('.') || EXCLUDED_HOME_DIRS.has(entry.name)) continue;
    const base = path.join(home, entry.name);
    add(path.join(base, 'skills'));
    let children = [];
    try {
      children = readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      if (/^skills(?:-|$)/.test(child.name)) add(path.join(base, child.name));
      add(path.join(base, child.name, 'skills'));
    }
  }
  return found;
}

function hasSkillFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isFile() && entry.name.endsWith('.md')) return true;
    if (existsSync(path.join(directory, entry.name, 'SKILL.md'))) return true;
  }
  return false;
}

/**
 * Resolve the roots to mount. `externalSkillDirs` may replace or extend the
 * discovered set; an explicit empty array disables external skills entirely.
 */
export function resolveExternalDirs(config) {
  const home = os.homedir();
  const raw = config?.externalSkillDirs;
  if (Array.isArray(raw) && raw.length === 0) return [];

  const explicit = Array.isArray(raw)
    ? raw.filter((entry) => typeof entry === 'string' && entry.trim() !== '').map((entry) => expandHome(entry.trim()))
    : typeof raw === 'string' && raw.trim() !== ''
      ? [expandHome(raw.trim())]
      : [];

  const dirs = [...explicit];
  if (config?.autoDiscoverExternalSkills !== false) dirs.push(...discoverExternalDirs(home));
  if (dirs.length === 0) dirs.push(...DEFAULT_DIRS);

  const dshHome = process.env.DSH_HOME?.trim() || path.join(home, '.dsh');
  const owned = new Set([path.join(dshHome, 'skills'), path.join(home, '.agents', 'skills')]);
  return [...new Set(dirs.filter((dir) => !owned.has(dir)))];
}

function expandHome(input) {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return path.resolve(input);
}

export function agentOf(root) {
  const lower = root.toLowerCase();
  if (lower.includes('/.codex/')) return 'Codex';
  if (lower.includes('/.claude/')) return 'Claude';
  if (lower.includes('/.cursor/')) return 'Cursor';
  if (lower.includes('/.grok/')) return 'Grok';
  if (lower.includes('/.gemini/')) return 'Gemini';
  if (lower.includes('/.workbuddy')) return 'WorkBuddy';
  if (lower.includes('/.hub/')) return 'Hub';
  if (lower.includes('/.openclaw/')) return 'OpenClaw';
  if (lower.includes('/.reasonix/')) return 'Reasonix';
  const name = path.basename(path.dirname(root));
  return name.replace(/^\./, '').replace(/[-_]/g, ' ') || 'Other';
}

/**
 * Scan every configured root into registry candidates. Never copies: `path`
 * and `resourceBase` point at the original bundle.
 */
export async function scanExternalSkills(dirs) {
  const skills = [];
  const seen = new Set();

  for (const root of dirs) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
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
      let dir;
      if (isDirectory) {
        file = path.join(absolute, 'SKILL.md');
        dir = absolute;
      } else if (isFile && entry.name.endsWith('.md')) {
        file = absolute;
        dir = root;
      } else {
        continue;
      }

      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      let document;
      try {
        document = parseSkillText(text);
      } catch {
        continue;
      }
      const name = document.data.name;
      const description = document.data.description;
      if (typeof name !== 'string' || !limits.NAME_PATTERN.test(name)) continue;
      if (name.length > limits.MAX_NAME_LENGTH) continue;
      if (typeof description !== 'string' || description.trim() === '') continue;
      if (seen.has(name)) continue;
      seen.add(name);

      skills.push({
        name,
        displayName: displayNameOf(document.data, document.body, name),
        description: description.slice(0, limits.MAX_DESCRIPTION_LENGTH),
        ...(typeof document.data.whenToUse === 'string' && document.data.whenToUse !== ''
          ? { whenToUse: document.data.whenToUse.slice(0, limits.MAX_DESCRIPTION_LENGTH) }
          : {}),
        invocation: invocationOf(document.data),
        source: 'custom',
        provider: EXTERNAL_PROVIDER,
        path: file,
        resourceBase: { kind: 'directory', path: dir },
        rank: 600,
        locator: { file, dir, root, agent },
        metadata: { external: true, agent, root },
      });
    }
  }

  return skills;
}

/**
 * Read one external skill by its SKILL.md path, restricted to the configured
 * roots. Used by the settings page's read-only detail view.
 */
export async function readExternalSkill(dirs, file) {
  const target = await realpath(file);
  let matchedRoot;
  for (const dir of dirs) {
    let root;
    try {
      root = await realpath(dir);
    } catch {
      continue;
    }
    if (target === root || target.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)) {
      matchedRoot = root;
      break;
    }
  }
  if (matchedRoot === undefined) throw new Error('The path is outside the configured external skill directories.');
  if (!path.basename(target).endsWith('.md')) throw new Error('Only Markdown skill files can be read.');

  const text = await readFile(target, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > 512 * 1024) throw new Error('SKILL.md is larger than 512 KiB.');
  const document = parseSkillText(text);
  return {
    name: document.data.name,
    displayName: displayNameOf(document.data, document.body, document.data.name),
    description: document.data.description,
    whenToUse: document.data.whenToUse,
    body: document.body,
    path: target,
    root: matchedRoot,
    agent: agentOf(matchedRoot),
  };
}

/**
 * A read-only skill provider over other agents' skill directories. Skills are
 * read in place, so edits in the other tool are visible without copying; a
 * directory watcher invalidates the catalog on change.
 */
export function createExternalProvider({ dirs, control }) {
  const roots = [...new Set(dirs)];
  const watchers = [];
  let timer = null;

  const invalidate = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      control.invalidate();
    }, 60);
  };

  for (const root of roots) {
    try {
      const watcher = watch(root, { persistent: false }, invalidate);
      watcher.on('error', () => {});
      watchers.push(watcher);
    } catch {
      // A missing root is valid: it contributes no skills.
    }
  }

  const dispose = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
        // Already closed.
      }
    }
  };
  if (control.signal.aborted) dispose();
  else control.signal.addEventListener('abort', dispose, { once: true });

  return {
    name: EXTERNAL_PROVIDER,

    async list() {
      return { candidates: await scanExternalSkills(roots), complete: true };
    },

    async get(candidate) {
      const locator = candidate?.locator;
      if (locator === undefined || typeof locator.file !== 'string') return undefined;
      let text;
      try {
        text = await readFile(locator.file, 'utf8');
      } catch {
        return undefined;
      }
      let document;
      try {
        document = parseSkillText(text);
      } catch {
        return undefined;
      }
      return {
        name: document.data.name,
        displayName: displayNameOf(document.data, document.body, document.data.name),
        description: String(document.data.description).slice(0, limits.MAX_DESCRIPTION_LENGTH),
        ...(typeof document.data.whenToUse === 'string' && document.data.whenToUse !== ''
          ? { whenToUse: document.data.whenToUse.slice(0, limits.MAX_DESCRIPTION_LENGTH) }
          : {}),
        invocation: invocationOf(document.data),
        source: 'custom',
        provider: EXTERNAL_PROVIDER,
        path: locator.file,
        resourceBase: { kind: 'directory', path: locator.dir },
        content: document.body,
        metadata: { external: true, agent: locator.agent, root: locator.root },
      };
    },
  };
}
