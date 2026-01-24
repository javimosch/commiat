# Multi-Commit Mode

## Overview
Multi-commit mode (`--multi`) creates multiple commits from a single working set of changes by asking the configured LLM to group staged changes into cohesive commit “groups”. Each group is committed independently.

## Usage
```bash
# Multi-commit from staged changes
commiat --multi

# Include untracked files in the grouping plan
commiat --multi --untracked

# Fully automated multi-commit (no prompts)
commiat --non-interactive --multi
```

## Input and scope
- Multi-commit operates on the staged diff (`git diff --staged`).
- With `--untracked`, untracked files are temporarily staged so they can be included in the staged diff and grouped.

## Planning (grouping) phase
1. Commiat collects the staged diff.
2. The LLM is asked to return **only JSON**: an array of objects with:
   - `group`: short group name
   - `files`: file path array
   - `description`: brief description

### Validation and normalization
The returned groups are normalized against the current relevant file list:
- Files not in the relevant set are dropped.
- If a file appears in multiple groups, **first-group-wins** (later groups drop overlaps).
- If some relevant files are not assigned to any group, an extra `(Unassigned)` group is appended.

Warnings are printed for dropped overlaps or empty groups.

## Preview and selection (interactive mode)
When `--non-interactive` is not set:
1. Commiat generates a suggested commit message for each group.
2. It prints a “Planned commits” preview showing:
   - group name/description
   - suggested commit message
   - full file list
3. The user can:
   - commit all planned groups
   - select a subset of groups to commit now
   - leave the session

After committing a subset, Commiat returns to the remaining groups so the user can commit more or leave.

### Exit semantics
If the user leaves (or cancels during a group commit), Commiat:
- discards the remaining plan
- leaves remaining changes **unstaged**

## Execution phase
For each group to be committed:
1. All staged files are unstaged.
2. Only the group’s files are staged.
3. The commit message is confirmed/edited via prompt (or auto-accepted in non-interactive mode).
4. The group is committed.

## Non-interactive mode
With `--non-interactive --multi`:
- No preview/selection prompts are shown.
- Groups are committed sequentially using the generated messages.

## Failure handling
If the LLM grouping output cannot be parsed as JSON, Commiat falls back to the single-commit flow (commit all staged changes in one commit).
