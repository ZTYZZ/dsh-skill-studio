# Changelog

All notable changes to this project are documented here.

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
