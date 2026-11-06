# Contributing

Thanks for helping. This plugin is intentionally small: five tools, one store, one parser, one runtime skill. Keep it that way unless a change clearly earns its complexity.

## Development

```bash
git clone https://github.com/ZTYZZ/dsh-skill-studio.git
cd dsh-skill-studio
npm test
npm run check
```

There are no runtime or development dependencies. Tests use `node:test`; each store test runs against a fresh temporary directory.

## What to change where

| Area | File |
| --- | --- |
| Tool schemas, descriptions, rendering | `index.js` |
| Frontmatter parsing, writing, validation, limits | `lib/frontmatter.js` |
| Filesystem operations, path safety, trash | `lib/skills.js` |
| Authoring instructions registered as `skill-creator` | `lib/meta-skill.js` |

## Rules

- **Validation before writes.** Every write path must call `validateSkillDefinition` first.
- **Never destroy user content.** Preserve unknown frontmatter keys and files not listed in the request; move deletions to `.trash`.
- **Stay inside `skillsDir`.** Normalize resource paths, reject absolute paths, `..`, backslashes, and symlink traversal.
- **No dependencies.** The plugin must install in any profile without a build step.
- **Tool results must be lossless JSON.** Do not return `undefined` fields; a tool failure is reported as `Error: tool ... returned invalid output`.
- **Keep descriptions honest.** Every claim in a tool description must match observed behavior, including the hot-reload and size-limit claims.

## Tests

Add a test for every behavior change. Run:

```bash
npm test
```

The suite must pass on Node 20 and 22 (CI covers both).

## Pull requests

- One concern per PR; explain the user-visible behavior and how you verified it.
- Update `README.md`, `README.en.md`, and `CHANGELOG.md` when behavior or configuration changes.
- If you change a tool schema, verify it through `cordis_inspect_query` (`Tool.listTools`) in a running Harness, not only by reading the source.
