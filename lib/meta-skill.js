/**
 * Always-available instructions for authoring skills. Registered as a runtime
 * skill on `ctx.skills`, so every session's catalog can route "create a skill"
 * requests here, and the model can load the full procedure with `skill`.
 */
export const SKILL_CREATOR = {
  name: 'skill-creator',
  description:
    'Create, revise, or review a reusable agent skill: design the trigger description, scaffold SKILL.md and resource files, validate the result, and keep it under the context limits. Use when the user asks to create a skill, turn a workflow into a reusable playbook, update an existing skill, or 创建/修改/沉淀技能。',
  whenToUse:
    'The user asks for a reusable procedure, checklist, or domain playbook, or asks to change an existing skill.',
  content: `# Create a skill

A skill is a small, reusable instruction package stored on disk:

\`\`\`text
<skills-dir>/<name>/
  SKILL.md          # frontmatter + imperative instructions
  references/       # optional deep detail, read on demand
  scripts/          # optional helpers
  assets/           # optional templates
\`\`\`

The built-in skill provider watches the directory, so a new or edited skill enters every session's catalog without a restart.

## 1. Decide whether a skill is warranted

Create a skill when the work is repeatable: a workflow, checklist, house style, domain procedure, or tool-specific playbook that should behave the same way next time. Do not create one for a one-off task, a fact, or something already covered by an existing skill.

Start with \`skill_list\` and read likely matches with \`skill_read\`. Extend an existing skill instead of creating a near-duplicate.

## 2. Design before writing

**Name** — kebab-case, at most 64 characters, stable and specific: \`release-notes\`, \`invoice-audit\`, \`dsh-plugin-review\`.

**Description** — one line, third person, front-loaded with the words a future request will use. It must say both what the skill does and when to use it, because the session catalog shows only the name and this description (truncated at 500 characters) when deciding whether to load the skill. Put trigger phrases first; put caveats later.

Good: \`Generate release notes from git history and merged pull requests. Use when the user asks for a changelog, release notes, version summary, or 发布说明.\`

Bad: \`Helps with releases.\`

**Body** — imperative instructions for a competent agent, not an essay. State the goal, the inputs to gather, the ordered steps, the decisions that need judgment, the validation that proves success, and the failure behavior. Omit generic advice the model already knows. Keep the body under 7,500 characters: the standard preset trims tool results above 8,192 characters, and a skill is loaded as a tool result.

**Progressive disclosure** — move long tables, examples, schemas, and background into \`references/*.md\`; reference each file by its relative path and say when to read it. Put deterministic helpers in \`scripts/\` and templates in \`assets/\`. The catalog stays small; the model loads detail only when the task needs it.

## 3. Write it

Call \`skill_create\` with \`name\`, \`description\`, \`body\`, and optional \`whenToUse\`, \`metadata\`, and \`files\` (each \`{ path, content }\`).

Frontmatter rules:

- \`name\` and \`description\` are required; \`name\` must match the directory name.
- \`whenToUse\` is optional metadata; it is not rendered in the catalog, so do not hide triggers there.
- \`disable-model-invocation: true\` hides the skill from the model but keeps it for explicit \`/name\` use.
- \`user-invocable: false\` removes the \`/name\` gesture.

A useful skeleton:

\`\`\`markdown
---
name: example-skill
description: Do X for Y. Use when the user asks for X, Y, or Z.
---

# X for Y

## Inputs

Collect A and B. Ask only for what cannot be discovered.

## Steps

1. Inspect ...
2. Produce ...
3. Verify by ...

## Failure behavior

If ... then ...; do not ...

## References

- \`references/format.md\` — read when the output format is ambiguous.
\`\`\`

Paths inside a skill resolve against its base directory. Use relative paths, never absolute machine-specific paths.

## 4. Validate

1. \`skill_list\` — the entry must be \`valid: true\` with no errors. Warnings about description length or body size are real: fix them.
2. \`skill_read\` — confirm the rendered body and the file list are what you intended.
3. Dry-run the instructions mentally against a concrete request. If a step needs a decision the skill does not cover, add the rule or the reference.
4. When practical, ask a fresh subagent to complete one task using the new skill, and fix anything it had to guess.

## 5. Revise and retire

\`skill_update\` changes only the fields you pass; unknown frontmatter keys and unlisted files are preserved. Use \`files\` to add or replace resources and \`removeFiles\` to delete them. \`skill_delete\` moves the skill into \`.trash\` (it requires \`confirm\` equal to the name), so prefer updating over deleting.

## Anti-patterns

- Encyclopedia bodies that restate general knowledge.
- Descriptions like "helps with tasks" that never match a real request.
- Secrets, tokens, or personal data in a skill.
- Absolute paths from your machine.
- Instructions that contradict the harness, or that ask the model to skip verification the task needs.
- A second skill that duplicates an existing one with a different name.
`,
};
