# Commiat CLI - CRUSH.md

## Project Overview
Commiat is a Node.js CLI tool that generates AI-powered Git commit messages based on staged changes. It supports OpenRouter and Ollama (with optional fallback to OpenRouter). Configuration is split between global (~/.commiat/config as dotenv) and local (.commiat as JSON for commit formats). The tool prompts for lead generation (Commiat Cloud early access) after successful commits, with state tracking in ~/.commiat/state.

Key features:
- Analyzes git diff of staged files.
- Uses LLM to generate messages in customizable formats with variables (e.g., {type}, {msg}, {gitBranchNumber}).
- Handles custom variable descriptions via prompts.
- Supports --add-all, --prefix, --affix, --no-verify flags.
- Commands: `commiat`, `commiat config`, `commiat ollama`.

Repository structure (observed):
- `src/`: Source code (cli.js, config.js, variables.js, utils/git.js).
- `docs/`: Documentation (coding-rules.md, feat-format.md, refactor-plan.md).
- `package.json`: Dependencies (axios, commander, dotenv, inquirer, simple-git).
- No tests, no build scripts.

## Essential Commands
- Install: `npm install`
- Run CLI: `npx commiat` or `commiat` (if globally installed via `npm install -g`).
- Generate commit: `commiat` (uses staged changes; prompts if none).
- Stage all and commit: `commiat -a` or `commiat --add-all`.
- Manage global config: `commiat config` (opens ~/.commiat/config in editor).
- Test LLM: `commiat config --test`.
- Configure Ollama: `commiat ollama` (enable/disable, set URL/model/fallback).
- No build/deploy commands observed. Version managed manually in package.json.

Git integration: Requires a Git repo with staged changes. Uses simple-git library.

## Code Organization and Structure
- **Entry point**: `src/cli.js` (~937 lines) - Handles Commander setup, main logic, API calls, user prompts. Partially refactored; still handles multiple responsibilities (config, LLM, git, etc.).
- **Modules** (modular, single-responsibility per docs/coding-rules.md):
  - `src/config.js`: Loads/saves/validates local .commiat JSON config (format, variables).
  - `src/variables.js`: Detects variables in format, prompts for custom descriptions, fetches system vars (gitBranch, gitBranchNumber).
  - `src/utils/git.js`: Git branch detection and number extraction.
- Planned structure (from docs/refactor-plan.md, in progress):
  - `src/config/global.js`: Global config/state management.
  - `src/services/llm.js`: LLM API calls (Ollama/OpenRouter).
  - `src/utils/logger.js`, `editor.js`, `lead_gen.js`.
  - `src/commands/commit.js`, `config.js`, `ollama.js`.
  - Refactored `src/cli.js`: Only Commander setup and delegation (<300 lines goal).
- Files under 300 lines except cli.js. Use absolute paths starting with `/home/javi/ai/commiat/` for edits.

## Naming Conventions and Style Patterns
- **Functions**: camelCase (e.g., `loadConfig`, `getGitBranch`).
- **Constants**: UPPER_SNAKE_CASE (e.g., `GLOBAL_CONFIG_PATH`, `CONFIG_KEY_API_KEY`).
- **Variables**: camelCase (e.g., `localConfig`, `systemVarValues`).
- **Files**: kebab-case (e.g., cli.js, git.js).
- **Indentation**: 2 spaces (observed in source files).
- **Modules**: CommonJS (require/module.exports).
- **Comments**: JSDoc-style for key functions (e.g., in config.js, variables.js).
- **Error Handling**: Try-catch with console.error and fsLogError to ~/.commiat/error.log.
- **Style Rule** (from docs/coding-rules.md): Modular files with single responsibility, <300 lines. Focus on maintainability.
- No linter/formatter observed; match existing style exactly (2-space indent, no semicolons in some places? Wait, has semicolons).

## Testing Approach and Patterns
- No tests implemented. package.json has placeholder: `"test": "echo \"Error: no test specified\" && exit 1"`.
- Manual verification: Run `commiat config --test` to check LLM connectivity.
- From docs/feat-format.md testing plan: Test format processing, git extraction, error handling, LLM output compliance.
- Suggested: Add Jest/Mocha tests for utils (e.g., variable detection, git funcs). Run after changes.

## Important Gotchas and Non-Obvious Patterns
- **Configs**:
  - Local: .commiat (JSON) in project root for format/variables. Auto-created on first run.
  - Global: ~/.commiat/config (dotenv) for API keys, Ollama settings. Edited via `commiat config`.
  - State: ~/.commiat/state (dotenv) tracks lead prompts (e.g., LEAD_PROMPTED_SUCCESS=1 skips forever).
- **Variables**:
  - System: {type} (LLM-generated), {msg} (implicit), {gitBranch}, {gitBranchNumber} (extracted from branch, e.g., "feat/123" -> "123").
  - Custom: {context} etc. - Prompted for description on first use, stored in .commiat.
  - LLM prompt includes format, descriptions, system values for context-aware generation.
- **LLM**:
  - Default: OpenRouter (gemini-flash-1.5). Needs API key.
  - Ollama: Local (http://localhost:11434, llama3). Fallback if enabled and OpenRouter configured.
  - Prompt cleans diff (ignores formatting), enforces format adherence.
  - Errors logged to ~/.commiat/error.log with details (provider, status, stack).
- **Git**:
  - Requires staged changes; prompts to `git add .` if none.
  - Branch number: First \d+ in branch name; empty if none (e.g., "main" -> "").
  - Detached HEAD: Returns empty branch.
- **Lead Gen**: After commit, prompts for email (weekly if declined, never if success). Webhook to ActivePieces; fails silently.
- **Editor**: Uses $EDITOR or "nano" for config; detached spawn.
- **Refactoring in Progress**: cli.js is monolithic; follow refactor-plan.md for further splits. Ensure <300 lines per file.
- **No Detached/Background**: All sync/async handled in main thread.
- **Env Vars**: Override global config (e.g., COMMIAT_OPENROUTER_API_KEY).
- **Version**: Manual in package.json; recent bump to 1.0.6.

## Additional Context
- From docs/feat-format.md: Detailed variable handling, config structure, implementation plan.
- Security: API keys in global config (not committed); no secrets in code.
- Deployment: NPM package (bin: commiat -> src/cli.js).
- Gotchas for Edits: Match 2-space indent, include newlines/blank lines exactly. Read files before editing. Test LLM with `commiat config --test` after changes.