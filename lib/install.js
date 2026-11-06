import os from 'node:os';
import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { isUtf8 } from 'node:buffer';
import { parseSkillText, validateSkillDefinition } from './frontmatter.js';
import { SkillStoreError, normalizeResourcePath } from './skills.js';

const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 20000;
const PROVENANCE_FILE = '.skill-studio.json';
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff',
  '.pdf', '.zip', '.gz', '.tar', '.tgz', '.7z', '.woff', '.woff2', '.ttf', '.otf',
  '.mp3', '.wav', '.ogg', '.mp4', '.mov', '.webm', '.docx', '.xlsx', '.pptx',
]);

/**
 * Install a skill bundle from a local directory/file, a GitHub tree/blob URL,
 * an `owner/repo/path` shorthand, or a raw SKILL.md URL.
 */
export async function installFromSource({ source, store, overwrite = false, fetchImpl = fetch, allowPrivateHosts = false }) {
  const parsedSource = parseSource(source);
  const request = createFetcher(fetchImpl, allowPrivateHosts);

  let loaded;
  if (parsedSource.kind === 'local') {
    loaded = await loadLocal(parsedSource.path);
  } else if (parsedSource.kind === 'github') {
    loaded = await loadGitHub(parsedSource, request);
  } else if (parsedSource.kind === 'github-file') {
    loaded = await loadGitHubFile(parsedSource, request);
  } else {
    loaded = await loadUrl(parsedSource.url, request);
  }

  const document = parseSkillText(loaded.skillText);
  const validation = validateSkillDefinition({ ...document.data, body: document.body });
  if (!validation.valid) {
    throw new SkillStoreError(`The source skill is invalid: ${validation.errors.join(' ')}`);
  }
  if (typeof document.data.name !== 'string' || document.data.name === '') {
    throw new SkillStoreError('The source SKILL.md has no name.');
  }

  const files = [
    ...loaded.files,
    {
      path: PROVENANCE_FILE,
      content: `${JSON.stringify(
        {
          source: String(source),
          resolvedFrom: loaded.description,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    },
  ];

  const result = await store.create({
    name: document.data.name,
    description: document.data.description,
    whenToUse: document.data.whenToUse,
    disableModelInvocation: document.data.disableModelInvocation,
    userInvocable: document.data.userInvocable,
    metadata: document.data.metadata,
    body: document.body,
    extras: document.extras,
    files,
    overwrite,
  });

  const skipped = (loaded.skipped ?? []).map(
    (file) => `Skipped non-text resource "${file}" (binary assets are not installed).`,
  );
  return {
    installed: true,
    name: result.name,
    path: result.path,
    source: String(source),
    resolvedFrom: loaded.description,
    files: result.files.map((file) => file.path),
    warnings: [...validation.warnings, ...skipped],
  };
}

export function parseSource(source) {
  const raw = String(source ?? '').trim();
  if (raw === '') {
    throw new SkillStoreError('A source is required: a local path, a GitHub URL, owner/repo/path, or a raw SKILL.md URL.');
  }

  if (/^https?:\/\//i.test(raw)) return parseHttpSource(raw);
  if (raw === '~' || raw.startsWith('~/') || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) {
    return { kind: 'local', path: expandHome(raw) };
  }
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/.*)?$/.test(raw)) {
    return parseGitHubShorthand(raw);
  }
  throw new SkillStoreError(
    `Unrecognized source "${raw}". Use an absolute local path, a GitHub URL, owner/repo/path, or a raw SKILL.md URL.`,
  );
}

function parseHttpSource(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SkillStoreError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SkillStoreError('Only http(s) URLs are supported.');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'github.com' || host === 'www.github.com') {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const [owner, repo, mode, ref, ...rest] = segments;
      if (mode === 'tree' && ref) {
        return { kind: 'github', owner, repo, ref, path: rest.join('/') };
      }
      if (mode === 'blob' && ref) {
        return { kind: 'github-file', owner, repo, ref, path: rest.join('/') };
      }
      if (mode === undefined) {
        return { kind: 'github', owner, repo, ref: undefined, path: '' };
      }
    }
    throw new SkillStoreError(`Unsupported GitHub URL: ${raw}`);
  }
  if (host === 'raw.githubusercontent.com') {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 4) {
      const [owner, repo, ref, ...rest] = segments;
      return { kind: 'github-file', owner, repo, ref, path: rest.join('/') };
    }
  }
  return { kind: 'url', url: url.toString() };
}

function parseGitHubShorthand(raw) {
  const segments = raw.split('/');
  if (segments.length < 2) throw new SkillStoreError(`Expected owner/repo/path, got "${raw}".`);
  const [owner, repo, ...rest] = segments;
  return { kind: 'github', owner, repo, ref: undefined, path: rest.join('/') };
}

function expandHome(input) {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return path.resolve(input);
}

function createFetcher(fetchImpl, allowPrivateHosts) {
  return async function request(url, accept) {
    if (!allowPrivateHosts) assertPublicHost(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { 'user-agent': 'dsh-skill-studio/1.1', accept },
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new SkillStoreError(`Timed out fetching ${url}.`);
      throw new SkillStoreError(`Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      if (response.status === 404) throw new SkillStoreError(`Not found: ${url}`);
      if (response.status === 403 && String(url).includes('api.github.com')) {
        throw new SkillStoreError('GitHub API rate limit reached. Wait an hour or install from a local clone.');
      }
      throw new SkillStoreError(`Fetching ${url} failed with HTTP ${response.status}.`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_TOTAL_BYTES) {
      throw new SkillStoreError(`The source is larger than ${MAX_TOTAL_BYTES} bytes.`);
    }
    return text;
  };
}

function assertPublicHost(rawUrl) {
  const host = new URL(rawUrl).hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    throw new SkillStoreError('Refusing to fetch a loopback address. Use a local path for local skills.');
  }
  if (/^(?:127|10)\./.test(host) || /^192\.168\./.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) {
    throw new SkillStoreError('Refusing to fetch a private network address. Use a local path for local skills.');
  }
  if (host === '[::1]' || host === '::1' || host.endsWith('.local')) {
    throw new SkillStoreError('Refusing to fetch a local address. Use a local path for local skills.');
  }
}

async function loadLocal(target) {
  const resolved = path.resolve(target);
  const info = await stat(resolved);
  if (info.isFile()) {
    return { description: resolved, skillText: await readFile(resolved, 'utf8'), files: [], skipped: [] };
  }
  if (!info.isDirectory()) throw new SkillStoreError(`${resolved} is not a file or directory.`);

  const skillPath = path.join(resolved, 'SKILL.md');
  let skillText;
  try {
    skillText = await readFile(skillPath, 'utf8');
  } catch {
    throw new SkillStoreError(`No SKILL.md found in ${resolved}.`);
  }

  const files = [];
  const skipped = [];
  let total = 0;
  const walk = async (directory, prefix, depth) => {
    if (depth > 4) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (relative === 'SKILL.md') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(absolute, relative, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        skipped.push(relative);
        continue;
      }
      if (files.length >= MAX_FILES) throw new SkillStoreError(`The skill has more than ${MAX_FILES} resource files.`);
      const buffer = await readFile(absolute);
      if (buffer.includes(0) || !isUtf8(buffer)) {
        skipped.push(relative);
        continue;
      }
      const content = buffer.toString('utf8');
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > MAX_FILE_BYTES) throw new SkillStoreError(`Resource "${relative}" is larger than ${MAX_FILE_BYTES} bytes.`);
      total += bytes;
      if (total > MAX_TOTAL_BYTES) throw new SkillStoreError(`The skill resources exceed ${MAX_TOTAL_BYTES} bytes.`);
      files.push({ path: normalizeResourcePath(relative), content });
    }
  };
  await walk(resolved, '', 0);
  return { description: resolved, skillText, files, skipped };
}

async function loadGitHubFile(source, request) {
  const ref = source.ref || 'HEAD';
  const encoded = source.path.split('/').map(encodeURIComponent).join('/');
  const raw = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${ref}/${encoded}`;
  return { description: raw, skillText: await request(raw, 'text/plain'), files: [], skipped: [] };
}

async function loadGitHub(source, request) {
  const contentsPath = source.path === '' ? '' : `${source.path.split('/').map(encodeURIComponent).join('/')}`;
  const api = new URL(`https://api.github.com/repos/${source.owner}/${source.repo}/contents/${contentsPath}`);
  if (source.ref !== undefined) api.searchParams.set('ref', source.ref);
  const listing = await request(api.toString(), 'application/vnd.github+json');

  let parsed;
  try {
    parsed = JSON.parse(listing);
  } catch {
    throw new SkillStoreError('GitHub returned an unreadable directory listing.');
  }

  if (!Array.isArray(parsed)) {
    if (parsed?.type === 'file' && parsed.name === 'SKILL.md') {
      return {
        description: parsed.html_url ?? source.path,
        skillText: await request(parsed.download_url, 'text/plain'),
        files: [],
        skipped: [],
      };
    }
    throw new SkillStoreError(`No SKILL.md found at ${source.owner}/${source.repo}/${source.path}.`);
  }

  let skillText;
  const files = [];
  const skipped = [];
  let total = 0;

  const walk = async (entries, prefix, depth) => {
    if (depth > 4) return;
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.type === 'dir') {
        const next = new URL(`https://api.github.com/repos/${source.owner}/${source.repo}/contents/${entry.path.split('/').map(encodeURIComponent).join('/')}`);
        if (source.ref !== undefined) next.searchParams.set('ref', source.ref);
        const child = JSON.parse(await request(next.toString(), 'application/vnd.github+json'));
        if (Array.isArray(child)) await walk(child, relative, depth + 1);
        continue;
      }
      if (entry.type !== 'file' || entry.download_url === null || entry.download_url === undefined) continue;
      if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        skipped.push(relative);
        continue;
      }
      const content = await request(entry.download_url, 'text/plain');
      if (relative === 'SKILL.md') {
        skillText = content;
        continue;
      }
      if (files.length >= MAX_FILES) throw new SkillStoreError(`The skill has more than ${MAX_FILES} resource files.`);
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > MAX_FILE_BYTES) throw new SkillStoreError(`Resource "${relative}" is larger than ${MAX_FILE_BYTES} bytes.`);
      total += bytes;
      if (total > MAX_TOTAL_BYTES) throw new SkillStoreError(`The skill resources exceed ${MAX_TOTAL_BYTES} bytes.`);
      files.push({ path: normalizeResourcePath(relative), content });
    }
  };

  await walk(parsed, '', 0);
  if (skillText === undefined) {
    throw new SkillStoreError(`No SKILL.md found at ${source.owner}/${source.repo}/${source.path || '.'}.`);
  }
  return {
    description: `https://github.com/${source.owner}/${source.repo}${source.path ? `/${source.path}` : ''}`,
    skillText,
    files,
    skipped,
  };
}

async function loadUrl(url, request) {
  const text = await request(url, 'text/plain');
  if (!text.trimStart().startsWith('---')) {
    throw new SkillStoreError('The URL does not point at a SKILL.md document (no YAML frontmatter).');
  }
  return { description: url, skillText: text, files: [], skipped: [] };
}
