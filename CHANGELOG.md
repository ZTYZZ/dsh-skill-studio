# Changelog

All notable changes to this project are documented here.

## 1.0.0 — 2026-11-06

First release.

- Five agent-facing tools: `skill_list`, `skill_read`, `skill_create`, `skill_update`, `skill_delete`.
- Runtime `skill-creator` skill with description guidance, progressive disclosure, and a validation checklist.
- SKILL.md frontmatter parser/writer for the subset the Harness provider consumes, preserving unknown keys.
- Validation for names, descriptions, body size, catalog truncation, metadata, and invocation flags.
- Filesystem jail: relative resources, no traversal, no writes through symlinks, 512 KiB/256 KiB/1 MiB limits.
- Recoverable deletion into `<skills-dir>/.trash`.
- English and Chinese plugin metadata; zero runtime dependencies; unit tests and CI.
