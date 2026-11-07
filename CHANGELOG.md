# Changelog

All notable changes to this project are documented here.

## 1.5.0 — 2026-11-07

- Add an Antigravity (agy) adapter: `antigravity/install.mjs` registers every known agent skill root in `~/.gemini/config/skills.json` and installs a `skill-studio` plugin under `~/.gemini/config/plugins/skill-studio`.
- The agy `skill-studio` skill lists 84 local skills (Chinese H1 first, English technical name second), reads any skill, and installs from a local directory, GitHub tree URL, or raw `SKILL.md`.
- `skills.json` exposes Codex, Claude, Cursor, Grok, Gemini, WorkBuddy, Hub, DSH, and the Antigravity install root.
- Add `/antigravity/README.md`, a dry-run install mode, and an uninstall mode.

## 1.4.0 — 2026-11-06

- Auto-discover every known agent skill root: Codex, Claude, WorkBuddy, Hub, Gemini, Cursor, Grok, plus generic `<agent>/skills` directories under the home directory.
- Mount 80+ external skills read-only in one provider; skip invalid names (underscores/uppercase) and broken symlinks, deduplicate names, and truncate oversized descriptions.
- The settings page now lists external skills alongside local ones; each row shows the Chinese H1 title first and the English technical name second.
- External skills can be opened read-only through `/skill-studio/api?action=readExternal`.
- Add `autoDiscoverExternalSkills`; document the `/` menu's technical-name limitation.

## 1.3.0 — 2026-11-06

- Add a read-only external skill provider that exposes other agents' skill directories to DSH. The default root is `~/.codex/skills`, so Codex skills appear in every session catalog without copying.
- Directories are watched; edits in the other tool invalidate the catalog. Resource bases point at the original directory, so `references/` and scripts resolve in place.
- Configure more roots (for example `~/.claude/skills`) with `externalSkillDirs`; set `[]` to disable.
- Document the difference between DSH roots and other agents' roots.

## 1.2.0 — 2026-11-06

- New Skill Studio settings page (Settings → 技能工坊 / Skill Studio): live skill list, search, detail view, install, create, and delete with confirmation.
- The page reads `/skill-studio/api`; GET is read-only and POST requires a same-port loopback `Origin`.
- Invalid skills, invocation flags, file counts, and installed provenance are visible in the UI.
- Chinese is now the default README; the English version moved to `README.en.md`.
- UI follows the host theme tokens and the active app locale.

## 1.1.0 — 2026-11-06

- New `skill_install` tool: install an existing bundle from a GitHub tree/blob URL, `owner/repo/path`, a raw `SKILL.md` URL, or a local directory or `.md` file.
- GitHub directory installs fetch `SKILL.md` and text resources through the Contents API; single-file and raw installs are supported.
- Installs are validated before writing, preserve unknown frontmatter, and record source provenance in `.skill-studio.json`.
- Remote installs reject loopback and private-network hosts; text-only bundles, 50 files / 1 MiB limits, 20 s fetch timeout.
- Documentation and tests for source parsing, local/GitHub/raw installs, validation failures, and private-host rejection.

## 1.0.0 — 2026-11-06

First release.

- Five agent-facing tools: `skill_list`, `skill_read`, `skill_create`, `skill_update`, `skill_delete`.
- Runtime `skill-creator` skill with description guidance, progressive disclosure, and a validation checklist.
- SKILL.md frontmatter parser/writer for the subset the Harness provider consumes, preserving unknown keys.
- Validation for names, descriptions, body size, catalog truncation, metadata, and invocation flags.
- Filesystem jail: relative resources, no traversal, no writes through symlinks, 512 KiB/256 KiB/1 MiB limits.
- Recoverable deletion into `<skills-dir>/.trash`.
- English and Chinese plugin metadata; zero runtime dependencies; unit tests and CI.
