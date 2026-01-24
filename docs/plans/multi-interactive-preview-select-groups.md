## Plan (LOCKED): Interactive preview + selective execution loop for `--multi`

### Context / current behavior
- `--multi` groups files via LLM JSON output, then iterates groups sequentially.
- For each group, it stages that group’s files, generates a message, prompts confirm/adjust/cancel, and commits.
- There is no “preview all groups first” step and no way to skip committing some groups while committing others.

### Goal
Add an interactive step (only when `--multi` and not `--non-interactive`) to:
1) preview the planned grouped commits (group name + description + files), and
2) select a subset of groups to actually commit now (e.g., commit 2 of 3), and
3) after committing some groups, return to selection for the remaining groups until the user leaves.

### Non-goals (for this iteration)
- Manual editing of group composition (moving files between groups).
- Reordering commits.
- Persisting/reusing group plan across runs.

### Proposed UX
1. Run analysis as today to produce `groups[]`.
2. Print a “Planned commits” summary:
   - `#1 <group>` — <description> (N files)
   - show the suggested commit message preview
   - show full file list (all affected files)
3. Prompt user:
   - **Commit all groups** (current behavior)
   - **Select groups to commit** (new)
   - **Leave** (exit multi session; planned commits are discarded; remaining changes are left unstaged)
4. If “Select groups…”:
   - Use an inquirer **checkbox** prompt with default = all groups selected.
   - After selection, show a confirmation summary (selected group numbers + total files).
   - If none selected: treat as **Leave**.
5. Execute commits only for selected groups (same per-group promptUser flow as today).
6. Return to step (2) with remaining groups so the user can pick more.

### Staging semantics (important)
Commiat is staged-changes-first, but `--multi` necessarily stages/unstages repeatedly.

Lock-in rules:
- Preserve the initial staged set at entry (baseline for analysis).
- During the multi loop, the tool will stage files per selected group for commit isolation.
- After each batch of commits, return to selection for remaining groups.
- If the user **Leaves** at any point, remaining changes are **left unstaged** (planned commits are lost).

Note: This implies we keep the remaining changes available in the working tree, but do not keep them staged on exit.

### Data validation / robustness
- Normalize group output before displaying:
  - Filter to `filesInGroup = group.files ∩ relevantFiles`.
  - Detect duplicates (same file in multiple groups). Strategy: **first group wins**; later groups drop duplicates and warn.
  - Detect “uncategorized” files (in `relevantFiles` but not in any group) and show them as an extra pseudo-group “(Unassigned)”.
- If LLM JSON parse fails: keep existing fallback (single commit prompt).

### CLI / config surface
- No new required flags.
- Behavior is gated by `!options.nonInteractive`.
- (Optional later) add `--multi-preview` to show grouping and exit without committing.

### Implementation sketch (code touchpoints)
- `src/cli.js`
  - Extend `handleMultiCommit(options)`:
    - After `groups` parsed/cleaned, call a new helper like `promptMultiGroupSelection(groups, options)`.
    - Use selection result to decide which groups to process.
    - Add staging restoration at the end.
  - Add helper(s):
    - `formatGroupSummary(groups)` (printing)
    - `normalizeGroups(groups, relevantFiles)` (dedupe + unassigned)
    - `promptSelectGroups(groups)` (inquirer checkbox)
- Docs:
  - Update README multi section to mention preview + selective commit.

### Implementation notes (FINAL)
- Group planning uses a dedicated LLM call (separate from commit-message generation) via `generateLlmText(prompt)`.
- Parsing/normalization lives in `src/utils/multiCommit.js`:
  - `parseGroupsFromLlmResponse(text)` strips optional markdown fences and extracts the first JSON array.
  - `normalizeMultiCommitGroups(rawGroups, relevantFiles)` filters to staged files, applies **first-group-wins** overlap resolution, and appends an `(Unassigned)` group for any remaining files.
- Multi flow (`handleMultiCommit` in `src/cli.js`):
  - Builds a grouping prompt from `git diff --staged` and requests JSON groups.
  - Pre-generates `suggestedMessage` per group using `generateCommitMessage(groupDiff, ...)` and applies `--prefix/--affix` via `applyPrefixAffixToMessage`.
  - Interactive loop shows a full preview (suggested message + file list) and lets the user: commit all / select groups / leave.
  - After committing selected groups, returns to the remaining groups until the user leaves or none remain.
  - On leave/cancel, remaining changes are left **unstaged**.


### Tests (recommended)
- Unit-test normalization/dedupe/unassigned logic (pure functions).
- Integration-style tests with mocked `simple-git` to assert:
  - only selected groups lead to `git.commit` calls
  - leave path leaves remaining changes unstaged

### Acceptance criteria
- When running `commiat --multi`, user can see all planned group commits before committing.
- User can select subset of groups to commit.
- After committing some groups, user is returned to selection for remaining groups.
- If user leaves, planned commits are discarded and remaining changes are unstaged.
- `--non-interactive --multi` remains unchanged (no new prompts).

### Decisions locked-in
1. On leave/exit: remaining changes are **unstaged**.
2. Commiat is staged-first; preserve the initial staged set for analysis entry.
3. Preview shows suggested commit message plus full list of affected files.
4. Overlaps: **first group wins**.

