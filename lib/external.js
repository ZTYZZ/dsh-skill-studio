import { watch } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { invocationOf, parseSkillText } from './frontmatter.js';

export const EXTERNAL_PROVIDER = 'skill-studio-external';
const DEFAULT_DIRS = [path.join(os.homedir(), '.codex', 'skills')];

/**
 * Resolve the directories of other agent tools that should be exposed as DSH
 * skills. Undefined keeps the Codex default; an empty array disables the
 * provider; a string array adds or replaces the roots.
 */
export function resolveExternalDirs(config) {
  const raw = config?.externalSkillDirs;
  if (raw === false || raw === null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((entry) => typeof entry === 'string' && entry.trim() !== '')
      .map((entry) => expandHome(entry.trim()));
  }
  if (typeof raw === 'string' && raw.trim() !== '') return [expandHome(raw.trim())];
  return DEFAULT_DIRS;
}

function expandHome(input) {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return path.resolve(input);
}

/**
 * A read-only skill provider over other agents' skill directories. Skills are
 * read in place, so edits in Codex/Claude/Cursor are visible without copying;
 * a directory watcher invalidates the catalog on change.
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
      const candidates = [];
      for (const root of roots) {
        let entries;
        try {
          entries = await readdir(root, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const absolute = path.join(root, entry.name);
          let file;
          let dir;
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
          if (typeof name !== 'string' || name.trim() === '') continue;
          if (typeof description !== 'string' || description.trim() === '') continue;

          candidates.push({
            name,
            description,
            ...(typeof document.data.whenToUse === 'string' && document.data.whenToUse !== ''
              ? { whenToUse: document.data.whenToUse }
              : {}),
            invocation: invocationOf(document.data),
            source: 'custom',
            provider: EXTERNAL_PROVIDER,
            path: file,
            resourceBase: { kind: 'directory', path: dir },
            rank: 600,
            locator: { file, dir },
          });
        }
      }
      return { candidates, complete: true };
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
        description: document.data.description,
        ...(typeof document.data.whenToUse === 'string' && document.data.whenToUse !== ''
          ? { whenToUse: document.data.whenToUse }
          : {}),
        invocation: invocationOf(document.data),
        source: 'custom',
        provider: EXTERNAL_PROVIDER,
        path: locator.file,
        resourceBase: { kind: 'directory', path: locator.dir },
        content: document.body,
        metadata: { external: true },
      };
    },
  };
}
