import { mkdir, readdir, readFile, rename, rm, stat, lstat, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SkillFormatError,
  invocationOf,
  limits,
  parseSkillText,
  renderSkillText,
  validateSkillDefinition,
} from './frontmatter.js';

const MAX_RESOURCE_FILES = 50;
const MAX_RESOURCE_BYTES = 256 * 1024;
const MAX_SKILL_FILE_BYTES = 512 * 1024;
const MAX_LISTED_FILES = 200;
const MAX_TOOL_RESULT_BYTES = 128 * 1024;

export class SkillStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SkillStoreError';
  }
}

/**
 * Create the filesystem-backed store used by the tools. `root` must be an
 * absolute directory; nothing outside it is ever written or deleted.
 */
export function createSkillStore({ root }) {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new SkillStoreError('A skills directory is required.');
  }
  const skillsRoot = path.resolve(root);

  async function listEntries() {
    let entries;
    try {
      entries = await readdir(skillsRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const found = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(skillsRoot, entry.name);
      let kind = null;
      if (entry.isDirectory()) {
        kind = 'directory';
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        kind = 'file';
      } else if (entry.isSymbolicLink()) {
        try {
          const target = await stat(absolute);
          if (target.isDirectory()) kind = 'directory';
          else if (target.isFile() && entry.name.endsWith('.md')) kind = 'file';
        } catch {
          found.push({ kind: 'broken', id: entry.name, path: absolute });
          continue;
        }
      }
      if (kind === null) continue;
      found.push({
        kind,
        id: kind === 'file' ? entry.name.slice(0, -3) : entry.name,
        path: absolute,
      });
    }
    return found;
  }

  async function readEntry(entry) {
    const skillFile = entry.kind === 'file' ? entry.path : path.join(entry.path, 'SKILL.md');
    let text;
    try {
      const info = await stat(skillFile);
      if (info.size > MAX_SKILL_FILE_BYTES) {
        throw new SkillStoreError(`SKILL.md is larger than ${MAX_SKILL_FILE_BYTES} bytes.`);
      }
      text = await readFile(skillFile, 'utf8');
    } catch (error) {
      if (error instanceof SkillStoreError) throw error;
      if (error.code === 'ENOENT') {
        throw new SkillStoreError(entry.kind === 'file' ? 'Skill file disappeared.' : 'Directory has no SKILL.md.');
      }
      throw error;
    }
    const parsed = parseSkillText(text);
    const validation = validateSkillDefinition({
      ...parsed.data,
      body: parsed.body,
    });
    const files = entry.kind === 'directory' ? await collectFiles(entry.path) : [];
    return {
      id: entry.id,
      name: typeof parsed.data.name === 'string' && parsed.data.name !== '' ? parsed.data.name : entry.id,
      description: typeof parsed.data.description === 'string' ? parsed.data.description : '',
      whenToUse: typeof parsed.data.whenToUse === 'string' ? parsed.data.whenToUse : undefined,
      path: skillFile,
      directory: entry.kind === 'directory' ? entry.path : null,
      body: parsed.body,
      extras: parsed.extras,
      data: parsed.data,
      files,
      bytes: Buffer.byteLength(text, 'utf8'),
      valid: validation.valid && parsed.issues.length === 0,
      errors: [...validation.errors, ...parsed.issues],
      warnings: validation.warnings,
      invocation: invocationOf(parsed.data),
    };
  }

  async function findEntry(name) {
    const wanted = String(name ?? '').trim();
    if (wanted === '') throw new SkillStoreError('A skill name is required.');
    const entries = await listEntries();
    for (const entry of entries) {
      if (entry.kind === 'broken') continue;
      if (entry.id === wanted) return entry;
    }
    for (const entry of entries) {
      if (entry.kind === 'broken') continue;
      try {
        const skill = await readEntry(entry);
        if (skill.name === wanted) return entry;
      } catch {
        // An unreadable sibling must not hide a later match.
      }
    }
    return undefined;
  }

  async function collectFiles(directory) {
    const files = [];
    const walk = async (current, prefix, depth) => {
      if (depth > 4 || files.length >= MAX_LISTED_FILES) return;
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(absolute, relative, depth + 1);
        } else if (entry.isFile() && relative !== 'SKILL.md') {
          try {
            const info = await stat(absolute);
            files.push({ path: relative, bytes: info.size });
          } catch {
            // Ignore files that vanish between readdir and stat.
          }
        }
      }
    };
    await walk(directory, '', 0);
    files.sort((left, right) => left.path.localeCompare(right.path));
    return files;
  }

  async function list({ includeInvalid = true } = {}) {
    const entries = await listEntries();
    const skills = [];
    for (const entry of entries) {
      if (entry.kind === 'broken') {
        if (includeInvalid) {
          skills.push({
            id: entry.id,
            name: entry.id,
            description: '',
            path: entry.path,
            valid: false,
            errors: ['Skill entry is a broken symbolic link.'],
            warnings: [],
            invocation: { modelInvocable: true, userInvocable: true },
            bytes: 0,
            files: [],
          });
        }
        continue;
      }
      try {
        const skill = await readEntry(entry);
        if (!includeInvalid && !skill.valid) continue;
        skills.push({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          whenToUse: skill.whenToUse,
          path: skill.path,
          directory: skill.directory,
          valid: skill.valid,
          errors: skill.errors,
          warnings: skill.warnings,
          invocation: skill.invocation,
          bytes: skill.bytes,
          files: skill.files,
        });
      } catch (error) {
        if (!includeInvalid) continue;
        skills.push({
          id: entry.id,
          name: entry.id,
          description: '',
          path: entry.path,
          valid: false,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: [],
          invocation: { modelInvocable: true, userInvocable: true },
          bytes: 0,
          files: [],
        });
      }
    }
    skills.sort((left, right) => left.name.localeCompare(right.name));
    return { root: skillsRoot, skills };
  }

  async function read(name, options = {}) {
    const entry = await findEntry(name);
    if (entry === undefined) {
      throw new SkillStoreError(`Skill "${name}" was not found in ${skillsRoot}.`);
    }
    const skill = await readEntry(entry);

    if (options.file !== undefined) {
      if (typeof options.file !== 'string' || options.file.trim() === '') {
        throw new SkillStoreError('file must be a non-empty relative path.');
      }
      if (skill.directory === null) {
        throw new SkillStoreError(`Skill "${skill.name}" is a flat file and has no resource files.`);
      }
      const relative = normalizeResourcePath(options.file);
      const absolute = path.join(skill.directory, ...relative.split('/'));
      const content = await readResource(skill.directory, absolute);
      return { ...summaryOf(skill), file: relative, filePath: absolute, content };
    }

    return {
      ...summaryOf(skill),
      body: skill.body,
      data: skill.data,
      files: skill.files,
    };
  }

  async function create(input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const definition = {
      name,
      description: typeof input?.description === 'string' ? input.description : '',
      whenToUse: input?.whenToUse,
      disableModelInvocation: input?.disableModelInvocation,
      userInvocable: input?.userInvocable,
      metadata: input?.metadata,
      body: typeof input?.body === 'string' ? input.body : '',
    };
    assertValid(definition);
    const files = normalizeResources(input?.files);
    const suppliedExtras = Array.isArray(input?.extras)
      ? input.extras.filter((line) => typeof line === 'string' && line.trim() !== '')
      : [];

    await mkdir(skillsRoot, { recursive: true });
    const directory = path.join(skillsRoot, name);
    const flatFile = path.join(skillsRoot, `${name}.md`);
    const existing = await existingEntry(directory, flatFile);
    if (existing !== undefined) {
      if (input?.overwrite !== true) {
        throw new SkillStoreError(`Skill "${name}" already exists at ${existing}. Pass overwrite: true to replace its SKILL.md.`);
      }
      if (existing === flatFile) {
        throw new SkillStoreError(`A flat skill file already exists at ${flatFile}; update it with skill_update instead.`);
      }
      let extras = suppliedExtras;
      if (extras.length === 0) {
        try {
          const previous = await readEntry({ kind: 'directory', id: name, path: directory });
          extras = previous.extras;
        } catch {
          // Replacing an unreadable bundle starts from a clean frontmatter.
        }
      }
      await ensureRealDirectory(directory);
      for (const file of files) {
        await writeResource(directory, file.path, file.content);
      }
      await writeSkillFile(directory, definition, extras);
    } else {
      // Build the bundle in a dot-prefixed staging directory (the provider skips
      // dot entries), then publish it with one rename.
      const staging = path.join(skillsRoot, `.staging-${name}-${process.pid}-${Date.now()}`);
      await mkdir(staging);
      try {
        for (const file of files) {
          await writeResource(staging, file.path, file.content);
        }
        await writeSkillFile(staging, definition, suppliedExtras);
        await rename(staging, directory);
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        throw error;
      }
    }

    const result = await read(name);
    return { ...result, created: true };
  }

  async function update(name, patch = {}) {
    const entry = await findEntry(name);
    if (entry === undefined) {
      throw new SkillStoreError(`Skill "${name}" was not found in ${skillsRoot}.`);
    }
    const current = await readEntry(entry);
    const definition = {
      name: current.data.name ?? current.id,
      description: patch.description ?? current.data.description ?? '',
      whenToUse: patch.whenToUse ?? current.data.whenToUse,
      disableModelInvocation: patch.disableModelInvocation ?? current.data.disableModelInvocation,
      userInvocable: patch.userInvocable ?? current.data.userInvocable,
      metadata: patch.metadata ?? current.data.metadata,
      body: patch.body ?? current.body,
    };
    assertValid(definition);

    if (entry.kind === 'file') {
      if (patch.files !== undefined || patch.removeFiles !== undefined) {
        throw new SkillStoreError('A flat skill file has no resource files; create a directory bundle instead.');
      }
      const text = renderSkillText(definition, definition.body, current.extras);
      await writeFileAtomic(entry.path, text);
      return { ...(await read(current.id)), updated: true };
    }

    const directory = entry.path;
    const files = normalizeResources(patch.files);
    for (const file of files) {
      await writeResource(directory, file.path, file.content);
    }
    for (const relative of normalizeRemovals(patch.removeFiles)) {
      await removeResource(directory, relative);
    }
    await writeSkillFile(directory, definition, current.extras);
    return { ...(await read(current.id)), updated: true };
  }

  async function remove(name, confirm) {
    if (confirm !== name) {
      throw new SkillStoreError(`Deletion is destructive: pass confirm: "${name}" to move the skill to the trash.`);
    }
    const entry = await findEntry(name);
    if (entry === undefined) {
      throw new SkillStoreError(`Skill "${name}" was not found in ${skillsRoot}.`);
    }
    const trash = path.join(skillsRoot, '.trash');
    await mkdir(trash, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(trash, `${entry.id}-${stamp}`);
    await rename(entry.path, target);
    return { deleted: true, name, trashedTo: target };
  }

  async function writeSkillFile(directory, definition, extras) {
    await ensureRealDirectory(directory);
    const text = renderSkillText(definition, definition.body, extras);
    await writeFileAtomic(path.join(directory, 'SKILL.md'), text);
  }

  async function readResource(directory, absolute) {
    const rootReal = await realpath(directory);
    let targetReal;
    try {
      targetReal = await realpath(absolute);
    } catch {
      throw new SkillStoreError('Resource file was not found.');
    }
    if (!isWithin(rootReal, targetReal)) {
      throw new SkillStoreError('Resource path escapes the skill directory.');
    }
    const info = await stat(targetReal);
    if (!info.isFile()) throw new SkillStoreError('Resource path is not a regular file.');
    if (info.size > MAX_TOOL_RESULT_BYTES) {
      throw new SkillStoreError(`Resource file is larger than ${MAX_TOOL_RESULT_BYTES} bytes.`);
    }
    return readFile(targetReal, 'utf8');
  }

  async function writeResource(directory, relative, content) {
    if (typeof content !== 'string') {
      throw new SkillStoreError(`Resource "${relative}" must be provided as text.`);
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_RESOURCE_BYTES) {
      throw new SkillStoreError(`Resource "${relative}" is ${bytes} bytes; the limit is ${MAX_RESOURCE_BYTES}.`);
    }
    const normalized = normalizeResourcePath(relative);
    await assertNoSymlink(directory, normalized);
    const target = path.join(directory, ...normalized.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFileAtomic(target, content);
  }

  async function removeResource(directory, relative) {
    const normalized = normalizeResourcePath(relative);
    const target = path.join(directory, ...normalized.split('/'));
    if (!isWithin(directory, target)) throw new SkillStoreError('Resource path escapes the skill directory.');
    await rm(target, { force: true });
  }

  return { root: skillsRoot, list, read, create, update, remove };
}

function summaryOf(skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse,
    path: skill.path,
    directory: skill.directory,
    valid: skill.valid,
    errors: skill.errors,
    warnings: skill.warnings,
    invocation: skill.invocation,
    bytes: skill.bytes,
    files: skill.files,
  };
}

function assertValid(definition) {
  const validation = validateSkillDefinition(definition);
  if (!validation.valid) {
    throw new SkillStoreError(`Invalid skill: ${validation.errors.join(' ')}`);
  }
  return validation;
}

export function normalizeResourcePath(relative) {
  if (typeof relative !== 'string' || relative.trim() === '') {
    throw new SkillStoreError('Resource path must be a non-empty string.');
  }
  if (relative.includes('\\')) {
    throw new SkillStoreError(`Resource path "${relative}" must use forward slashes.`);
  }
  if (relative.startsWith('/') || /^[A-Za-z]:/.test(relative)) {
    throw new SkillStoreError(`Resource path "${relative}" must be relative.`);
  }
  const normalized = path.posix.normalize(relative);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new SkillStoreError(`Resource path "${relative}" escapes the skill directory.`);
  }
  if (normalized === 'SKILL.md') {
    throw new SkillStoreError('SKILL.md is written from the skill definition, not as a resource file.');
  }
  if (normalized.startsWith('.trash/')) {
    throw new SkillStoreError('The .trash directory is reserved.');
  }
  return normalized;
}

function normalizeResources(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new SkillStoreError('files must be an array of { path, content } objects.');
  if (input.length > MAX_RESOURCE_FILES) {
    throw new SkillStoreError(`At most ${MAX_RESOURCE_FILES} resource files may be written at once.`);
  }
  let total = 0;
  const seen = new Set();
  const files = [];
  for (const file of input) {
    if (file === null || typeof file !== 'object') {
      throw new SkillStoreError('Each resource file must be an object with path and content.');
    }
    const relative = normalizeResourcePath(file.path);
    if (seen.has(relative)) throw new SkillStoreError(`Resource "${relative}" is listed twice.`);
    seen.add(relative);
    if (typeof file.content !== 'string') throw new SkillStoreError(`Resource "${relative}" must have string content.`);
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes > MAX_RESOURCE_BYTES) {
      throw new SkillStoreError(`Resource "${relative}" is ${bytes} bytes; the limit is ${MAX_RESOURCE_BYTES}.`);
    }
    total += bytes;
    files.push({ path: relative, content: file.content });
  }
  if (total > 1024 * 1024) {
    throw new SkillStoreError('Resource files exceed the 1 MiB per-call limit.');
  }
  return files;
}

function normalizeRemovals(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new SkillStoreError('removeFiles must be an array of relative paths.');
  return input.map((relative) => normalizeResourcePath(relative));
}

async function existingEntry(directory, flatFile) {
  for (const candidate of [directory, flatFile]) {
    try {
      await lstat(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}

async function ensureRealDirectory(directory) {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory()) throw new SkillStoreError(`${directory} exists but is not a directory.`);
    return;
  } catch (error) {
    if (error instanceof SkillStoreError) throw error;
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(directory, { recursive: true });
  const info = await lstat(directory);
  if (!info.isDirectory()) throw new SkillStoreError(`${directory} is not a directory.`);
}

async function assertNoSymlink(directory, relative) {
  let current = directory;
  const segments = relative.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new SkillStoreError(`Refusing to write through symbolic link "${path.relative(directory, current)}".`);
      }
    } catch (error) {
      if (error instanceof SkillStoreError) throw error;
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function writeFileAtomic(file, content) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, 'utf8');
  try {
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function isWithin(root, target) {
  return target === root || target.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
}

export const storeLimits = {
  MAX_RESOURCE_FILES,
  MAX_RESOURCE_BYTES,
  MAX_SKILL_FILE_BYTES,
  MAX_TOOL_RESULT_BYTES,
  NAME_PATTERN: limits.NAME_PATTERN,
};
