import os from 'node:os';
import path from 'node:path';
import { installFromSource } from './lib/install.js';
import { SKILL_CREATOR } from './lib/meta-skill.js';
import { createSkillStore, normalizeResourcePath } from './lib/skills.js';

export const name = 'skill-studio';
export const inject = ['tools'];

const TOOL_PREFIX = 'skill';

export function apply(ctx, rawConfig = {}) {
  const skillsDir = resolveSkillsDir(rawConfig);
  const store = createSkillStore({ root: skillsDir });

  const register = (definition) => ctx.effect(() => ctx.tools.register(definition));

  register(listTool(store));
  register(readTool(store));
  register(createTool(store));
  register(installTool(store));
  register(updateTool(store));
  register(deleteTool(store));

  // Teach the model how to author skills well. The skill is registered as a
  // runtime skill, so it is available even before the first skill is written.
  ctx.inject(['skills'], (skillsCtx) => {
    skillsCtx.effect(() =>
      skillsCtx.skills.register({
        name: SKILL_CREATOR.name,
        description: SKILL_CREATOR.description,
        whenToUse: SKILL_CREATOR.whenToUse,
        source: 'runtime',
        content: SKILL_CREATOR.content,
      }),
    );
  });
}

function resolveSkillsDir(config) {
  const configured = typeof config?.skillsDir === 'string' ? config.skillsDir.trim() : '';
  if (configured !== '') {
    return expandHome(configured);
  }
  const home = process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh');
  return path.join(home, 'skills');
}

function expandHome(input) {
  let value = input;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    value = path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

function text(content) {
  return [{ type: 'text', text: content }];
}

function describeLocation(root) {
  return `Skills directory: ${root}`;
}

function listTool(store) {
  return {
    name: `${TOOL_PREFIX}_list`,
    description:
      'List the skills stored in the local Skill Studio directory, including invalid SKILL.md files and their diagnostics that the session catalog hides. Use it before creating a skill to avoid duplicates, and after writing one to confirm it is valid. Set includeInvalid to false to hide broken entries.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        includeInvalid: {
          type: 'boolean',
          description: 'Include entries that failed parsing or validation. Defaults to true.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          root: { type: 'string' },
          count: { type: 'number' },
          skills: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args, value) => text(renderList(value)),
    },
    async execute(args) {
      const result = await store.list({ includeInvalid: args?.includeInvalid !== false });
      return {
        root: result.root,
        count: result.skills.length,
        skills: result.skills.map((skill) => ({
          name: skill.name,
          description: truncate(skill.description, 500),
          valid: skill.valid,
          path: skill.path,
          errors: skill.errors,
          warnings: skill.warnings,
          invocation: skill.invocation,
          files: skill.files.map((file) => file.path),
        })),
      };
    },
  };
}

function readTool(store) {
  return {
    name: `${TOOL_PREFIX}_read`,
    description:
      "Read one skill's frontmatter, instructions, and resource file list, or one resource file inside it. Use it before updating a skill, or when the session catalog names a skill whose exact instructions matter.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string',
          description: 'Skill name (kebab-case), or the on-disk directory/file name.',
        },
        file: {
          type: 'string',
          description: 'Optional resource path relative to the skill directory, such as references/format.md. Omit to read SKILL.md.',
        },
      },
      required: ['name'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
          description: { type: 'string' },
          body: { type: 'string' },
          content: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => text(renderRead(value)),
    },
    async execute(args) {
      const result = await store.read(args?.name, { file: args?.file });
      if (result.file !== undefined) {
        return {
          name: result.name,
          path: result.filePath,
          file: result.file,
          content: result.content,
        };
      }
      const value = {
        name: result.name,
        path: result.path,
        description: result.description,
        body: result.body,
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        files: result.files.map((file) => file.path),
      };
      if (result.whenToUse !== undefined) value.whenToUse = result.whenToUse;
      return value;
    },
  };
}

function createTool(store) {
  return {
    name: `${TOOL_PREFIX}_create`,
    description:
      "Create a reusable skill: a directory <name>/SKILL.md with YAML frontmatter and imperative instructions. The built-in skill provider watches this directory, so the new skill enters every session's catalog without a restart. Use it when the user asks to save a workflow, checklist, or domain procedure for reuse. Write a third-person description that states what the skill does and when to use it, front-loading trigger phrases (the catalog shows at most 500 characters). Keep the body under 7,500 characters and move long material into references/ files. Fails when the skill already exists unless overwrite is true.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string',
          description: 'Kebab-case skill name, at most 64 characters. It becomes the directory name.',
        },
        description: {
          type: 'string',
          description: 'One-line description stating what the skill does and when to use it, with trigger phrases first.',
        },
        body: {
          type: 'string',
          description: 'Imperative Markdown instructions, usually under 7,500 characters.',
        },
        whenToUse: {
          type: 'string',
          description: 'Optional metadata about when to use the skill. Not shown in the session catalog.',
        },
        disableModelInvocation: {
          type: 'boolean',
          description: 'When true, hide the skill from the model; it stays available through an explicit /name invocation.',
        },
        userInvocable: {
          type: 'boolean',
          description: 'When false, remove the explicit /name invocation while keeping the skill model-invocable.',
        },
        metadata: {
          type: 'object',
          description: 'Optional flat metadata map of string, number, or boolean values.',
          additionalProperties: true,
        },
        files: {
          type: 'array',
          description: 'Optional resource files written beside SKILL.md.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string', description: 'Relative path, such as references/format.md.' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
        overwrite: {
          type: 'boolean',
          description: 'Replace an existing SKILL.md at the same name. Defaults to false.',
        },
      },
      required: ['name', 'description', 'body'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          created: { type: 'boolean' },
          name: { type: 'string' },
          path: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => text(renderWrite('Created', value)),
    },
    async execute(args) {
      const result = await store.create({
        name: args?.name,
        description: args?.description,
        body: args?.body,
        whenToUse: args?.whenToUse,
        disableModelInvocation: args?.disableModelInvocation,
        userInvocable: args?.userInvocable,
        metadata: args?.metadata,
        files: args?.files,
        overwrite: args?.overwrite === true,
      });
      return {
        created: true,
        name: result.name,
        path: result.path,
        files: result.files.map((file) => file.path),
        bytes: result.bytes,
        warnings: result.warnings,
      };
    },
  };
}

function installTool(store) {
  return {
    name: `${TOOL_PREFIX}_install`,
    description:
      'Install an existing skill bundle from a GitHub tree/blob URL, an owner/repo/path shorthand, a raw SKILL.md URL, or a local directory. The source must contain a valid SKILL.md; text resources are copied, the bundle is validated before any write, provenance is recorded in .skill-studio.json, and an existing skill is preserved unless overwrite is true. Use this to bring in a skill someone else wrote; use skill_create to author a new one.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: {
          type: 'string',
          description: 'GitHub tree URL (github.com/owner/repo/tree/ref/path), owner/repo/path shorthand, raw SKILL.md URL, or an absolute local path to a skill directory or .md file.',
        },
        overwrite: {
          type: 'boolean',
          description: 'Replace an existing skill with the same name. Defaults to false.',
        },
      },
      required: ['source'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          installed: { type: 'boolean' },
          name: { type: 'string' },
          path: { type: 'string' },
          source: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => text(renderInstall(value)),
    },
    async execute(args) {
      const result = await installFromSource({
        source: args?.source,
        store,
        overwrite: args?.overwrite === true,
      });
      return {
        installed: true,
        name: result.name,
        path: result.path,
        source: result.source,
        files: result.files,
        warnings: result.warnings,
      };
    },
  };
}

function updateTool(store) {
  return {
    name: `${TOOL_PREFIX}_update`,
    description:
      "Update an existing skill in place. Only supplied fields change; omitted fields, unknown frontmatter keys, and unlisted files are preserved. Read the skill first. Pass body to rewrite the instructions, files to add or replace resources, and removeFiles to delete them. Use skill_create to rename or create a new skill.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', description: 'Skill name or on-disk directory name.' },
        description: { type: 'string' },
        body: { type: 'string' },
        whenToUse: { type: 'string' },
        disableModelInvocation: { type: 'boolean' },
        userInvocable: { type: 'boolean' },
        metadata: {
          type: 'object',
          additionalProperties: true,
          description: 'Replaces the metadata map when supplied; pass {} to clear it.',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
        removeFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Relative resource paths to delete.',
        },
      },
      required: ['name'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          updated: { type: 'boolean' },
          name: { type: 'string' },
          path: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => text(renderWrite('Updated', value)),
    },
    async execute(args) {
      const patchKeys = ['description', 'body', 'whenToUse', 'disableModelInvocation', 'userInvocable', 'metadata', 'files', 'removeFiles'];
      if (!patchKeys.some((key) => args?.[key] !== undefined)) {
        throw new Error('Nothing to update: pass at least one of description, body, whenToUse, disableModelInvocation, userInvocable, metadata, files, or removeFiles.');
      }
      if (args?.files !== undefined) {
        if (!Array.isArray(args.files)) throw new Error('files must be an array.');
        for (const file of args.files) {
          if (file?.path !== undefined) normalizeResourcePath(file.path);
        }
      }
      const result = await store.update(args.name, {
        description: args.description,
        body: args.body,
        whenToUse: args.whenToUse,
        disableModelInvocation: args.disableModelInvocation,
        userInvocable: args.userInvocable,
        metadata: args.metadata,
        files: args.files,
        removeFiles: args.removeFiles,
      });
      return {
        updated: true,
        name: result.name,
        path: result.path,
        files: result.files.map((file) => file.path),
        bytes: result.bytes,
        warnings: result.warnings,
      };
    },
  };
}

function deleteTool(store) {
  return {
    name: `${TOOL_PREFIX}_delete`,
    description:
      'Move a skill out of the catalog into <skills>/.trash so it can be recovered by hand. Requires confirm to equal the exact skill name. Use only when the user asks to delete a skill; prefer skill_update.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', description: 'Skill name or on-disk directory name.' },
        confirm: { type: 'string', description: 'Repeat the exact skill name to confirm the deletion.' },
      },
      required: ['name', 'confirm'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          deleted: { type: 'boolean' },
          name: { type: 'string' },
          trashedTo: { type: 'string' },
        },
      },
      render: (_args, value) =>
        text(`Deleted skill "${value.name}".\nRecoverable at: ${value.trashedTo}\n${describeLocation(store.root)}`),
    },
    async execute(args) {
      return store.remove(args?.name, args?.confirm);
    },
  };
}

function renderList(value) {
  const lines = [`${value.count} skill${value.count === 1 ? '' : 's'} in ${value.root}`];
  if (value.count === 0) {
    lines.push('', 'No skills yet. Use skill_create to add one.');
    return lines.join('\n');
  }
  for (const skill of value.skills) {
    const state = skill.valid ? 'valid' : 'INVALID';
    lines.push('', `- ${skill.name} (${state})`);
    lines.push(`  ${skill.description === '' ? '(no description)' : skill.description}`);
    lines.push(`  path: ${skill.path}`);
    if (skill.files.length > 0) lines.push(`  files: ${skill.files.join(', ')}`);
    if (!skill.invocation.modelInvocable) lines.push('  model-invocable: no');
    if (!skill.invocation.userInvocable) lines.push('  user-invocable: no');
    for (const error of skill.errors) lines.push(`  error: ${error}`);
    for (const warning of skill.warnings) lines.push(`  warning: ${warning}`);
  }
  return lines.join('\n');
}

function renderRead(value) {
  if (value.file !== undefined) {
    return `# ${value.name}: ${value.file}\n${value.path}\n\n${value.content}`;
  }
  const lines = [`# ${value.name}`, value.path, '', value.description];
  if (value.whenToUse) lines.push('', `When to use: ${value.whenToUse}`);
  if (value.files.length > 0) lines.push('', `Resources: ${value.files.join(', ')}`);
  if (value.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of value.warnings) lines.push(`- ${warning}`);
  }
  lines.push('', '---', '', value.body);
  return lines.join('\n');
}

function renderInstall(value) {
  const lines = [`Installed skill "${value.name}".`, value.path, `Source: ${value.source}`];
  if (value.files.length > 0) lines.push(`Files: ${value.files.join(', ')}`);
  if (value.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of value.warnings) lines.push(`- ${warning}`);
  }
  lines.push('', 'The skill catalog refreshes automatically; the change is available to later steps.');
  return lines.join('\n');
}

function renderWrite(verb, value) {
  const lines = [`${verb} skill "${value.name}".`, value.path];
  if (value.files.length > 0) lines.push(`Resources: ${value.files.join(', ')}`);
  if (value.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of value.warnings) lines.push(`- ${warning}`);
  }
  lines.push('', 'The skill catalog refreshes automatically; the change is available to later steps.');
  return lines.join('\n');
}

function truncate(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
