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

`commiat` needs your OpenRouter API key to function. It looks for the key in the following order:

1.  **Environment Variable:** `OPENROUTER_API_KEY` (set in your shell or a local `.env` file).
2.  **Global Config File:** Reads the key from `~/.commiat/config`.
3.  **Prompt:** If the key is not found in the above locations, `commiat` will prompt you to enter it securely. The entered key will then be saved to `~/.commiat/config` for future use.

**Steps:**

1.  **Get an OpenRouter API Key:**
    Sign up at [OpenRouter.ai](https://openrouter.ai/) and get your API key.
2.  **Run `commiat`:**
    The first time you run it (without the key set in `.env`), it will prompt you for the key and save it globally.
    *Alternatively*, you can create a `.env` file in the project directory and add the key there:
    ```
    OPENROUTER_API_KEY=YOUR_API_KEY_HERE
    ```
    This `.env` file takes precedence over the global config.

**(Optional) Specify a different model:**
You can choose any chat model available on OpenRouter by adding this line to your `.env` file (this setting is *not* stored globally):
```
# OPENROUTER_MODEL=anthropic/claude-3-haiku
```
If not specified, it defaults to `google/gemini-flash-1.5`.

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

Happy committing! 🎉
