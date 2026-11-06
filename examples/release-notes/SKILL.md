---
name: release-notes
description: Write release notes from git history, merged pull requests, and issue references. Use when the user asks for a changelog, release notes, a version summary, what changed, or 发布说明.
whenToUse: The user asks what changed in a release or needs notes for a tag.
---

# Release notes

Produce notes a user can read without opening the diff.

## Inputs

- The target version, tag, or date range. If none is given, use the latest tag and `HEAD`.
- The previous release tag. Find it with `git describe --tags --abbrev=0 <target>^`.
- Merged pull requests and linked issues when the repository uses them.

Ask only for a range that cannot be inferred.

## Steps

1. List commits in the range, excluding merge commits and release chores.
2. Group changes by what a user can now do — not by `feat`/`fix` labels. A refactor with no user-visible effect belongs in an "Internal" section or nowhere.
3. For each entry, state the change and its practical effect. Prefer "Exports now honor `--format json`" over "Refactored exporter".
4. Call out breaking changes, migrations, and required configuration first.
5. Verify every claim against the diff or the pull request. Do not invent issue numbers or credit.
6. Link pull requests and issues using the repository's existing style.

## Output

Use the structure in `references/format.md` unless the repository already has a release template; then follow the repository.

## Failure behavior

If the tag does not exist, say which tags do. If the range is empty, return "No user-visible changes" rather than padding the notes.
