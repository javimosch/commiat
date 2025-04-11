# Refactoring Plan: src/cli.js

**Goal:** Refactor `src/cli.js` to comply with the project's coding rule: "Organize frontend and backend code into modular, single-responsibility files... keeping each under 300 lines for maintainability."

**Current State:** `src/cli.js` is over 500 lines and handles multiple responsibilities including CLI parsing, global config, state management, API interactions, command logic, utility functions, etc.

**Proposed Module Structure:**

1.  **`src/config/global.js`:**
    *   **Responsibility:** Manage global configuration (`~/.commiat/config`) and state (`~/.commiat/state`).
    *   **Functions to move:** `ensureGlobalConfigDirExists`, `ensureGlobalConfigFileExists`, `loadGlobalConfig`, `saveGlobalConfig`, `updateGlobalConfig`, `ensureGlobalStateFileExists`, `loadState`, `saveState`, `updateState`.
    *   **Constants to move/reference:** `GLOBAL_CONFIG_DIR`, `GLOBAL_CONFIG_PATH`, `GLOBAL_STATE_PATH`, `CONFIG_KEY_*`, `STATE_KEY_*`.

2.  **`src/services/llm.js`:**
    *   **Responsibility:** Handle interactions with LLM providers (OpenRouter, Ollama), including API key management, provider selection, and API calls.
    *   **Functions to move:** `promptForApiKey`, `isOpenRouterConfigured`, `getApiKey`, `getLlmProviderConfig`, `callOllamaApi`, `callOpenRouterApi`, `generateCommitMessage`, `testLlmCompletion`.
    *   **Constants to move/reference:** `OPENROUTER_API_URL`, `DEFAULT_OPENROUTER_MODEL`, `DEFAULT_OLLAMA_BASE_URL`, `DEFAULT_OLLAMA_MODEL`, `CONFIG_KEY_API_KEY`, `CONFIG_KEY_OPENROUTER_MODEL`, `CONFIG_KEY_USE_OLLAMA`, `CONFIG_KEY_OLLAMA_BASE_URL`, `CONFIG_KEY_OLLAMA_MODEL`, `CONFIG_KEY_OLLAMA_FALLBACK`.
    *   **Dependencies:** `axios`, `inquirer`, `src/config/global.js`, `src/utils/logger.js`.

3.  **`src/utils/logger.js`:**
    *   **Responsibility:** Provide error logging functionality.
    *   **Functions to move:** `fsLogError`.
    *   **Dependencies:** `fs`, `path`, `src/config/global.js` (for `GLOBAL_CONFIG_DIR`).

4.  **`src/utils/editor.js`:**
    *   **Responsibility:** Open files in the user's default editor.
    *   **Functions to move:** `openConfigInEditor`.
    *   **Dependencies:** `child_process`, `src/config/global.js` (for `ensureGlobalConfigFileExists`, `GLOBAL_CONFIG_PATH`).

5.  **`src/utils/lead_gen.js`:**
    *   **Responsibility:** Handle the lead generation prompt.
    *   **Functions to move:** `promptForLead`.
    *   **Dependencies:** `inquirer`, `axios`, `src/config/global.js` (for state management), `src/utils/logger.js`.
    *   **Constants to move/reference:** `LEAD_WEBHOOK_URL`, `STATE_KEY_LEAD_PROMPTED`.

6.  **`src/commands/commit.js`:**
    *   **Responsibility:** Handle the main logic for the default `commiat` command (generating and committing messages).
    *   **Functions to move:** `mainAction`, `ensureStagedFiles`, `promptUser`. (Note: `generateCommitMessage` moves to `llm.js`).
    *   **Dependencies:** `simple-git`, `inquirer`, `src/config.js` (local config), `src/variables.js`, `src/services/llm.js`, `src/utils/lead_gen.js`.

7.  **`src/commands/config.js`:**
    *   **Responsibility:** Handle the logic for the `commiat config` command.
    *   **Functions to move:** The action function currently defined inline for `program.command('config')`.
    *   **Dependencies:** `src/services/llm.js` (for `testLlmCompletion`), `src/utils/editor.js`, `src/config.js` (for `LOCAL_CONFIG_FILENAME`).

8.  **`src/commands/ollama.js`:**
    *   **Responsibility:** Handle the logic for the `commiat ollama` command.
    *   **Functions to move:** `configureOllama`.
    *   **Dependencies:** `inquirer`, `src/config/global.js`, `src/services/llm.js` (for `isOpenRouterConfigured`).

9.  **`src/cli.js` (Refactored):**
    *   **Responsibility:** Set up `commander`, define commands and options, and delegate execution to the respective command modules. Import necessary modules.
    *   **Content:** Primarily `require` statements, `program` definition, command/option setup, and `program.parse`.

**Refactoring Steps:**

1.  Create the new directory structure (`src/config`, `src/services`, `src/utils`, `src/commands`).
2.  Create the new files outlined above (`global.js`, `llm.js`, `logger.js`, `editor.js`, `lead_gen.js`, `commit.js`, `config.js`, `ollama.js`).
3.  Carefully move the identified functions, constants, and `require` statements from `src/cli.js` to their respective new modules.
4.  Update `require` paths within the moved code and in the files that depend on the moved code.
5.  Export the necessary functions/constants from each new module.
6.  Import the command handler functions into the refactored `src/cli.js`.
7.  Update the `.action()` calls in `src/cli.js` to use the imported command handlers.
8.  Remove the moved code from the original `src/cli.js`.
9.  Test thoroughly to ensure all commands (`commiat`, `commiat -a`, `commiat config`, `commiat config --test`, `commiat ollama`) still work as expected, including error handling, config loading/saving, and API calls.

**Verification:**

*   Confirm that `src/cli.js` is significantly smaller (ideally under 100 lines).
*   Confirm that each new module is under the 300-line limit and has a clear, single responsibility.
*   Run through various usage scenarios (first run, existing config, Ollama enabled/disabled, fallback scenarios, etc.).