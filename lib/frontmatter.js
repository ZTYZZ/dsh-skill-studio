/**
 * SKILL.md frontmatter: a deliberately small YAML reader/writer.
 *
 * Skills only need a handful of scalar keys, so this module implements the
 * subset the filesystem skill provider consumes instead of depending on a YAML
 * library. Unknown top-level blocks are preserved verbatim so `skill_update`
 * never destroys keys written by hand or by another tool.
 */

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BOOLEAN_TRUE = new Set(['true', 'yes', 'on', '1']);
const BOOLEAN_FALSE = new Set(['false', 'no', 'off', '0']);
const BLOCK_SCALAR = /^([|>])([+-]?)$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const CATALOG_DESCRIPTION_LENGTH = 500;
const MAX_BODY_LENGTH = 60000;
const BODY_WARNING_LENGTH = 7500;
const RESERVED_METADATA_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class SkillFormatError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'SkillFormatError';
    this.issues = issues;
  }
}

function normalizeText(text) {
  return String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/**
 * Split a SKILL.md document into frontmatter data, unknown raw blocks, and body.
 * Throws SkillFormatError when the document has no delimited frontmatter.
 */
export function parseSkillText(text) {
  const source = normalizeText(text);
  const lines = source.split('\n');
  if ((lines[0] ?? '').trim() !== '---') {
    throw new SkillFormatError('SKILL.md must begin with a YAML frontmatter block delimited by "---".');
  }
  let close = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      close = index;
      break;
    }
  }
  if (close === -1) {
    throw new SkillFormatError('SKILL.md frontmatter is missing its closing "---" line.');
  }
  const parsed = parseFrontmatter(lines.slice(1, close));
  const body = lines.slice(close + 1).join('\n').replace(/^\n+/, '');
  return {
    data: parsed.data,
    extras: parsed.extras,
    issues: parsed.issues,
    body,
    rawFrontmatter: lines.slice(1, close).join('\n'),
  };
}

function parseFrontmatter(lines) {
  const data = {};
  const extras = [];
  const issues = [];
  const seen = new Set();
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      index += 1;
      continue;
    }
    if (/^[ \t]/.test(line)) {
      issues.push(`Unexpected indentation at frontmatter line ${index + 2}: ${line.trim()}`);
      index += 1;
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (match === null) {
      issues.push(`Unrecognized frontmatter line ${index + 2}: ${line.trim()}`);
      index += 1;
      continue;
    }

    const key = match[1];
    const inline = match[2];
    const block = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const next = lines[cursor];
      if (next.trim() === '' || /^[ \t]/.test(next)) {
        block.push(next);
        cursor += 1;
        continue;
      }
      break;
    }
    while (block.length > 0 && block[block.length - 1].trim() === '') block.pop();
    index = cursor;

    if (seen.has(key)) {
      issues.push(`Duplicate frontmatter key "${key}"; the later value wins.`);
    }
    seen.add(key);

    try {
      if (key === 'name' || key === 'description' || key === 'whenToUse') {
        const value = parseScalar(inline, block, key);
        if (typeof value !== 'string') {
          issues.push(`"${key}" must be a string.`);
        } else {
          data[key] = value.trim();
        }
      } else if (key === 'disable-model-invocation' || key === 'user-invocable') {
        const value = parseBoolean(inline);
        if (value === undefined) {
          issues.push(`"${key}" must be a boolean (true/false, yes/no, on/off, 1/0).`);
        } else {
          data[key === 'disable-model-invocation' ? 'disableModelInvocation' : 'userInvocable'] = value;
        }
      } else if (key === 'metadata') {
        const value = parseMetadata(block);
        if (value === undefined) {
          issues.push('"metadata" must be a flat map of scalar values.');
        } else {
          data.metadata = value;
        }
      } else {
        extras.push([line, ...block].join('\n'));
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { data, extras, issues };
}

function parseScalar(inline, block, key) {
  const value = inline.trim();
  const blockMatch = BLOCK_SCALAR.exec(value);
  if (blockMatch !== null) {
    return parseBlockScalar(blockMatch[1], blockMatch[2], block);
  }
  if (value === '' && block.length > 0) {
    throw new SkillFormatError(`"${key}" expects a single-line value, but a nested block was found.`);
  }
  if (value === '') return '';
  return parseInlineScalar(value);
}

function parseBoolean(inline) {
  const raw = inline.trim();
  if (raw === '' || raw.startsWith('"') || raw.startsWith("'")) return undefined;
  const lowered = raw.toLowerCase();
  if (BOOLEAN_TRUE.has(lowered)) return true;
  if (BOOLEAN_FALSE.has(lowered)) return false;
  return undefined;
}

function parseBlockScalar(style, chomp, block) {
  const indents = block
    .filter((line) => line.trim() !== '')
    .map((line) => /^[ \t]*/.exec(line)[0].length);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  const lines = block.map((line) => (line.trim() === '' ? '' : line.slice(indent)));

  let text;
  if (style === '|') {
    text = lines.join('\n');
  } else {
    text = '';
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (index > 0) {
        const previous = lines[index - 1];
        text += line === '' || previous === '' ? '\n' : ' ';
      }
      text += line;
    }
  }

  if (chomp === '-') return text.replace(/\n+$/, '');
  if (chomp === '+') return text;
  return text === '' ? '' : `${text.replace(/\n+$/, '')}\n`;
}

function parseInlineScalar(raw) {
  const value = stripComment(raw).trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return unescapeDoubleQuoted(value.slice(1, -1));
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function stripComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote !== null) {
      if (quote === '"' && char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '#' && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

function unescapeDoubleQuoted(value) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (match, escape) => {
    switch (escape[0]) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '0':
        return '\0';
      case '"':
        return '"';
      case '\\':
        return '\\';
      case '/':
        return '/';
      case 'u':
      case 'x':
        return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
      default:
        return escape;
    }
  });
}

function parseMetadata(block) {
  if (block.length === 0) return {};
  const metadata = {};
  let valid = true;
  for (const rawLine of block) {
    if (rawLine.trim() === '') continue;
    const match = /^[ \t]+([A-Za-z0-9_.-]+)[ \t]*:[ \t]*(.*)$/.exec(rawLine);
    if (match === null) {
      valid = false;
      continue;
    }
    const key = match[1];
    if (RESERVED_METADATA_KEYS.has(key)) {
      valid = false;
      continue;
    }
    const value = match[2].trim();
    if (value === '') {
      metadata[key] = '';
    } else {
      const parsed = parseInlineScalar(value);
      metadata[key] = parsed;
    }
  }
  return valid ? metadata : undefined;
}

/**
 * Render a complete SKILL.md document. Unknown raw frontmatter blocks are
 * appended unchanged after the fields this plugin manages.
 */
export function renderSkillText(definition, body, extras = []) {
  const name = String(definition.name ?? '').trim();
  const description = String(definition.description ?? '').trim();
  if (name === '') throw new SkillFormatError('A skill name is required.');
  if (description === '') throw new SkillFormatError('A skill description is required.');

  const lines = ['---', `name: ${inlineString(name)}`, `description: ${inlineString(description)}`];
  if (typeof definition.whenToUse === 'string' && definition.whenToUse.trim() !== '') {
    lines.push(`whenToUse: ${inlineString(definition.whenToUse.trim())}`);
  }
  if (definition.disableModelInvocation === true) {
    lines.push('disable-model-invocation: true');
  } else if (definition.disableModelInvocation === false) {
    lines.push('disable-model-invocation: false');
  }
  if (definition.userInvocable === true) {
    lines.push('user-invocable: true');
  } else if (definition.userInvocable === false) {
    lines.push('user-invocable: false');
  }
  if (definition.metadata !== undefined && definition.metadata !== null) {
    const entries = Object.entries(definition.metadata).filter(([, value]) => value !== undefined);
    if (entries.length > 0) {
      lines.push('metadata:');
      for (const [key, value] of entries) {
        lines.push(`  ${key}: ${inlineScalar(value)}`);
      }
    }
  }
  for (const extra of extras) {
    if (typeof extra === 'string' && extra.trim() !== '') lines.push(extra);
  }
  lines.push('---');

  const normalizedBody = normalizeText(body ?? '').replace(/^\n+/, '').trimEnd();
  return `${lines.join('\n')}\n\n${normalizedBody}${normalizedBody === '' ? '' : '\n'}`;
}

function inlineString(value) {
  const text = String(value);
  if (text === '') return '""';
  const plain = /^[A-Za-z0-9][A-Za-z0-9 .,()_/-]*$/.test(text);
  if (plain && !text.includes(': ') && !text.includes(' #') && !text.endsWith(' ')) return text;
  return JSON.stringify(text);
}

function inlineScalar(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return inlineString(value);
}

/**
 * Validate a skill definition before it is written. Errors block the write;
 * warnings are returned to the caller as authoring guidance.
 */
export function validateSkillDefinition(definition) {
  const errors = [];
  const warnings = [];
  const name = typeof definition.name === 'string' ? definition.name.trim() : '';
  const description = typeof definition.description === 'string' ? definition.description.trim() : '';
  const whenToUse = typeof definition.whenToUse === 'string' ? definition.whenToUse.trim() : '';
  const body = typeof definition.body === 'string' ? definition.body : '';

  if (name === '') {
    errors.push('name is required.');
  } else if (!NAME_PATTERN.test(name)) {
    errors.push('name must be kebab-case: lowercase letters and digits separated by single hyphens (for example "release-notes").');
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.push(`name must be at most ${MAX_NAME_LENGTH} characters.`);
  }

  if (description === '') {
    errors.push('description is required.');
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`);
  } else if (description.includes('\n')) {
    errors.push('description must be a single line.');
  } else if (description.length > CATALOG_DESCRIPTION_LENGTH) {
    warnings.push(`description is ${description.length} characters; the session catalog renders at most ${CATALOG_DESCRIPTION_LENGTH}, so the tail will be hidden. Put trigger phrases first.`);
  }

  if (whenToUse.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`whenToUse must be at most ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  if (body.length > MAX_BODY_LENGTH) {
    errors.push(`body must be at most ${MAX_BODY_LENGTH} characters; move detail into references/ files.`);
  } else if (body.length > BODY_WARNING_LENGTH) {
    warnings.push(`body is ${body.length} characters; the standard preset trims skill results above 8192 characters. Move detail into references/ files and keep the core procedure short.`);
  }

  if (definition.metadata !== undefined && definition.metadata !== null) {
    if (typeof definition.metadata !== 'object' || Array.isArray(definition.metadata)) {
      errors.push('metadata must be a flat object of string, number, or boolean values.');
    } else {
      for (const [key, value] of Object.entries(definition.metadata)) {
        if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
          errors.push(`metadata key "${key}" may only contain letters, digits, "_", ".", and "-".`);
        }
        if (!['string', 'number', 'boolean'].includes(typeof value)) {
          errors.push(`metadata value for "${key}" must be a string, number, or boolean.`);
        }
      }
    }
  }

  if (definition.disableModelInvocation !== undefined && typeof definition.disableModelInvocation !== 'boolean') {
    errors.push('disableModelInvocation must be a boolean.');
  }
  if (definition.userInvocable !== undefined && typeof definition.userInvocable !== 'boolean') {
    errors.push('userInvocable must be a boolean.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Prefer a human title from the first Markdown H1, then the technical name. */
export function displayNameOf(data, body, fallback = '') {
  const explicit = data?.title ?? data?.displayName;
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim();
  const match = /^#\s+(.+?)\s*$/m.exec(String(body ?? ''));
  if (match !== null) return match[1].trim();
  return fallback;
}

/** Translate frontmatter flags into the registry's invocation policy. */
export function invocationOf(data) {
  return {
    modelInvocable: data.disableModelInvocation !== true,
    userInvocable: data.userInvocable !== false,
  };
}

export const limits = {
  NAME_PATTERN,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  CATALOG_DESCRIPTION_LENGTH,
  MAX_BODY_LENGTH,
  BODY_WARNING_LENGTH,
};
