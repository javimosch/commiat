# Commiat 🤖✍️

Tired of writing git commit messages? Let AI do it for you! ✨

`commiat` is a simple CLI tool that:
1.  Optionally stages all changes (`git add .`) if you use the `-a` flag.
2.  Analyzes your staged git changes (`git diff --staged`).
3.  Generates a conventional commit message using the OpenRouter API (defaults to Google Gemini Flash 1.5 ⚡).
4.  Prompts you to confirm ✅, adjust 📝, or cancel ❌ the commit.

## 🚀 Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/commiat.git # Replace with actual URL if hosted
    cd commiat
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Link the CLI:**
    This makes the `commiat` command available globally.
    ```bash
    npm link
    ```

## ⚙️ Configuration

`commiat` needs configuration like your OpenRouter API key and optionally a preferred model. It looks for settings in the following order:

1.  **Local `.env` File:** Settings in a `.env` file in your current project directory take the highest precedence.
    ```dotenv
    # .env in your project
    OPENROUTER_API_KEY=YOUR_PROJECT_SPECIFIC_KEY
    OPENROUTER_MODEL=anthropic/claude-3-sonnet
    ```
2.  **Global Config File (`~/.commiat/config`):** If not found locally, settings are read from this file. It uses the standard `.env` format (KEY=VALUE).
    ```dotenv
    # ~/.commiat/config
    OPENROUTER_API_KEY=YOUR_GLOBAL_API_KEY
    OPENROUTER_MODEL=google/gemini-pro-1.5
    ```
3.  **Prompt/Defaults:**
    *   If `OPENROUTER_API_KEY` is not found anywhere, `commiat` will prompt you to enter it securely. The entered key will then be saved to the *global* config file (`~/.commiat/config`).
    *   If `OPENROUTER_MODEL` is not found anywhere, it defaults to `google/gemini-flash-1.5`.

**Managing Configuration:**

*   **Initial Setup:** The first time you run `commiat` (without the key set), it will prompt for the API key and save it globally.
*   **Editing Global Config:** You can manually edit the global config file using:
    ```bash
    commiat config
    ```
    This opens `~/.commiat/config` in your default editor. You can set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` here.
*   **Project-Specific Settings:** Use a local `.env` file in your project for settings you only want to apply to that project.

## ▶️ Usage

1.  **Option A: Stage changes manually**
    ```bash
    git add <your-files...>
    commiat
    ```
2.  **Option B: Stage all changes automatically**
    Use the `-a` or `--add-all` flag:
    ```bash
    commiat -a
    ```
3.  **Follow the prompts:**
    Confirm, adjust, or cancel the suggested commit message.

**Other Commands:**

*   **Edit Global Configuration:**
    ```bash
    commiat config
    ```

Happy committing! 🎉
