# Skill Studio

**Create, read, update, list, and delete reusable agent skills — from the conversation itself.**

DeepSeek Harness already knows how to *use* skills: the `skill` tool loads them and the session catalog advertises them. Skill Studio adds the missing half: a small, safe authoring surface so an agent can *make* a skill, validate it, revise it, and retire it without leaving the session.

It works like the skill-creator workflow in Codex, but the skills are ordinary `SKILL.md` bundles on disk, discovered by the Harness's own filesystem provider and hot-reloaded into every session.

```text
You: Turn our release-notes process into a skill.

Agent: [loads skill-creator]
       [calls skill_list]      → no existing release-notes skill
       [calls skill_create]    → ~/.dsh/skills/release-notes/SKILL.md
       Created skill "release-notes".
       The skill catalog refreshes automatically.
```

No restart. No config editing. The new skill appears in the catalog on the next step, for every session using the standard preset.

---

## What you get

| Tool | What it does |
| --- | --- |
| `skill_list` | Lists every skill in the skills directory, **including invalid files** and their diagnostics — the session catalog silently hides broken skills, so this is how you find out why one is missing. |
| `skill_read` | Reads a skill's frontmatter, instructions, and resource file list, or one resource file inside it. |
| `skill_create` | Writes `<skills-dir>/<name>/SKILL.md` plus optional `references/`, `scripts/`, and `assets/` files, with validation and conflict protection. |
| `skill_update` | Patches an existing skill. Omitted fields, unknown frontmatter keys, and unlisted files are preserved; resources can be added, replaced, or removed. |
| `skill_delete` | Moves a skill into `<skills-dir>/.trash` instead of destroying it. Requires an exact-name confirmation. |

Plus a runtime skill, **`skill-creator`**, registered by the plugin. It teaches the agent how to write a skill that actually works: trigger-first descriptions, imperative bodies, progressive disclosure into `references/`, the 8 KB tool-result limit, and a validate-before-you-ship checklist.

---

## Install

### Requirements

- DeepSeek Harness Desktop (or any DSH deployment) with the default `standard` agent preset — it mounts `@deepseek-ai/dsh-skill-filesystem` and `@deepseek-ai/dsh-tool-skill`.
- Node.js 20+ (the Host runtime qualifies).

### Install the bundle

Clone the repository, then ask the agent to install the local bundle:

```bash
git clone https://github.com/ZTYZZ/dsh-skill-studio.git
```

```text
Install the DSH bundle at /absolute/path/to/dsh-skill-studio using plugin_manager.
```

The equivalent direct call is `plugin_manager` with `action: "install_bundle"` and the absolute package directory as `target`. The manager links the checkout into the profile, so a later `git pull` updates the files on disk.

### Updating

Replacing the JavaScript of an installed package needs a fresh module generation: `git pull`, then restart the app or toggle the bundle off and on in **Settings → Plugins**. Creating skills never requires a restart — only updating the plugin code does.

Verify from a fresh step:

```text
skill_list
→ 0 skills in /Users/you/.dsh/skills
```

The five tools and the `skill-creator` catalog entry should be visible immediately.

### Manual composition

If you manage the profile by hand, add the bundle to the profile's `cordis.patch.yml` (after making the package resolvable in the profile):

```yaml
- insert:
    - id: skill-studio
      name: dsh-skill-studio
      config: {}
```

Prefer `plugin_manager`: it installs the package, records the bundle, and reports whether the composition actually applied.

---

## Use it

Ask in normal language; the agent routes the request through `skill-creator` and the tools:

- “Create a skill for our weekly analytics report.”
- “Turn this checklist into a reusable skill, and make the description match how I phrase the request.”
- “This skill is too long — move the API details into a reference file.”
- “把刚才这套分镜流程沉淀成一个技能。”
- “Delete the old `weekly-report` skill.”

A useful pattern for the agent:

1. `skill_list` — check what already exists.
2. `skill_read` — inspect a near-match before deciding to extend it.
3. `skill_create` — write the smallest skill that works.
4. `skill_list` / `skill_read` — confirm validity and read the rendered body back.
5. `skill_update` — iterate after a real trial run.

---

## Skill format

A skill is a directory bundle with a `SKILL.md`:

```text
~/.dsh/skills/
  release-notes/
    SKILL.md
    references/
      format.md
    scripts/
      collect.sh
```

```markdown
---
name: release-notes
description: Write release notes from git history and merged pull requests. Use when the user asks for a changelog, release notes, a version summary, or 发布说明.
whenToUse: The user asks what changed in a release.
---

# Release notes

## Steps

1. Collect commits since the last tag.
2. Group by user-visible area, not by commit type.
3. Verify every claim against the diff.

Read `references/format.md` when the output structure is ambiguous.
```

Rules the plugin enforces or warns about:

| Rule | Behavior |
| --- | --- |
| `name` and `description` are required | Hard error |
| `name` is kebab-case, ≤ 64 characters | Hard error |
| `description` is one line, ≤ 1024 characters | Hard error above 1024; **warning above 500**, because the catalog renders at most 500 |
| Body ≤ 7,500 characters | Warning; the standard preset trims tool results above 8,192 characters |
| Body ≤ 60,000 characters | Hard error |
| Resource paths are relative and stay inside the skill | Hard error on `..`, absolute paths, backslashes, or symlink traversal |
| `SKILL.md` is not a resource | Hard error; pass `body` instead |
| Deleting requires `confirm` equal to the name | Hard error otherwise |
| A skill may already exist | Hard error unless `overwrite: true` |

Optional frontmatter:

- `disable-model-invocation: true` — hide from the model catalog; keep it for explicit `/name` invocation.
- `user-invocable: false` — remove the `/name` gesture; keep it model-invocable.
- `metadata: { owner: platform, version: 2 }` — flat string/number/boolean map.
- Unknown top-level keys are preserved verbatim by `skill_update`.

Flat `<name>.md` skills are discovered and can be read and updated, but `skill_create` always writes a directory bundle.

---

## Configuration

The only setting is where skills live:

```yaml
- insert:
    - id: skill-studio
      name: dsh-skill-studio
      config:
        skillsDir: /Users/you/work/skills
```

| Field | Default | Meaning |
| --- | --- | --- |
| `skillsDir` | `$DSH_HOME/skills` (usually `~/.dsh/skills`) | Directory scanned and written by the tools. `~` is expanded; relative paths resolve against the Host process working directory. |

The default is the same user root the built-in filesystem provider scans, so skills created here are visible to every session and survive restarts. A custom `skillsDir` must also be added to the provider's `customSkillDirs` if you want the catalog to discover it — the tools will still work, but the skills would not be advertised.

---

## How it works

- The plugin is a Host bundle: `cordis.patch.yml` inserts one plugin row; `index.js` registers five tools on the global tool registry and one runtime skill on `ctx.skills`.
- `skill_create` / `skill_update` / `skill_delete` write only under `skillsDir`, using atomic renames.
- The Harness's `dsh-skill-filesystem` provider watches the directory. Adding, editing, or removing `SKILL.md` invalidates its catalog, and `dsh-tool-skill` appends a replacement catalog to the session. That is why no restart is needed.
- Validation happens before any write. The same rules are exported from `lib/frontmatter.js` and covered by unit tests.
- No runtime dependencies, no network calls, no background process: the plugin is a few hundred lines of ESM on top of `node:fs`.

---

## Safety

- **Writes are jailed** to `skillsDir`. `..`, absolute paths, backslash paths, `SKILL.md`-as-resource, and writes through symlinks are rejected.
- **Deletes are recoverable**: skills move to `<skillsDir>/.trash/<name>-<timestamp>`.
- **Size limits** cap a skill file at 512 KiB, a resource at 256 KiB, and a create/update call at 1 MiB.
- **Skills are instructions**, not passive data. A skill created from untrusted content can influence future sessions. Review skills you did not author before keeping them; the `.trash` directory is not scanned, so removing a skill removes its influence from the catalog.
- The plugin does not read environment secrets, make network requests, or execute skill scripts. `scripts/` files are stored, not run.

---

## Development

```bash
npm test        # node:test — frontmatter, store, path safety, trash, flat files
npm run check   # node --check on every runtime module
```

Layout:

```text
index.js              Host plugin: tools, config, runtime skill registration
lib/frontmatter.js    YAML-subset parser/serializer, validation, limits
lib/skills.js         Filesystem store: list/read/create/update/delete
lib/meta-skill.js     The skill-creator instructions registered at runtime
test/                 Unit tests
examples/             A ready-to-copy example skill
```

Design principles:

- Write the smallest skill that works; move detail into `references/`.
- The catalog is a routing surface: description quality matters more than body length.
- Never destroy user content. Preserve unknown frontmatter and unlisted files; trash instead of delete.
- Keep the plugin dependency-free so it installs in any profile.

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Roadmap

- A Settings → Skills page (browse, create, and edit without asking the agent).
- `skill_install`: import a skill directory or a GitHub URL, with a review step.
- A `skill_validate` tool for CI-style linting of a whole skills directory.
- Optional project-scoped root (`.dsh/skills` in the current repository).

Issues and pull requests are welcome.

---

## License

MIT © 2026 ZTYZZ. See [LICENSE](LICENSE).

[中文说明](README.zh.md)
