const inquirer = require("inquirer");

const {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  CONFIG_KEY_USE_OLLAMA,
  CONFIG_KEY_OLLAMA_BASE_URL,
  CONFIG_KEY_OLLAMA_MODEL,
  CONFIG_KEY_OLLAMA_FALLBACK,
} = require("../core/constants");

const {
  loadGlobalConfig,
  saveGlobalConfig,
  GLOBAL_CONFIG_PATH,
} = require("../core/globalStore");

const { isOpenRouterConfigured } = require("../core/apiKey");

async function configureOllama() {
  const currentConfig = loadGlobalConfig();
  const currentUseOllama = currentConfig[CONFIG_KEY_USE_OLLAMA] === "true";
  const currentBaseUrl =
    currentConfig[CONFIG_KEY_OLLAMA_BASE_URL] || DEFAULT_OLLAMA_BASE_URL;
  const currentModel =
    currentConfig[CONFIG_KEY_OLLAMA_MODEL] || DEFAULT_OLLAMA_MODEL;
  const currentFallback = currentConfig[CONFIG_KEY_OLLAMA_FALLBACK] === "true";

  console.log(`\n--- Ollama Configuration ---`);
  console.log(
    `Current setting: ${currentUseOllama ? `Enabled (URL: ${currentBaseUrl}, Model: ${currentModel}, Fallback: ${currentFallback})` : "Disabled"}`,
  );

  let useOllama;
  try {
    ({ useOllama } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useOllama",
        message: "Enable Ollama for commit message generation?",
        default: currentUseOllama,
      },
    ]));
  } catch {
    console.warn("\n⚠️ Ollama configuration prompt interrupted. No changes saved.");
    return;
  }

  if (useOllama) {
    let answers;
    try {
      answers = await inquirer.prompt([
        {
          type: "input",
          name: "baseUrl",
          message: `Enter Ollama base URL (leave blank for default: ${DEFAULT_OLLAMA_BASE_URL}):`,
          default: currentBaseUrl,
          validate: (input) => {
            if (!input || input.trim() === "") return true;
            try {
              const url = new URL(input.trim());
              return url.protocol === "http:" || url.protocol === "https:"
                ? true
                : "URL must use http or https protocol.";
            } catch {
              return "Please enter a valid URL (e.g., http://localhost:11434).";
            }
          },
        },
        {
          type: "input",
          name: "model",
          message: `Enter Ollama model name (leave blank for default: ${DEFAULT_OLLAMA_MODEL}):`,
          default: currentModel,
          validate: (input) => {
            if (!input || input.trim() === "") return true;
            return typeof input === "string" && input.trim().length > 0
              ? true
              : "Model name cannot be empty.";
          },
        },
        {
          type: "confirm",
          name: "fallback",
          message: "Enable fallback to OpenRouter if Ollama fails (requires OpenRouter API key)?",
          default: currentFallback,
        },
      ]);
    } catch {
      console.warn("\n⚠️ Ollama settings prompt interrupted. No changes saved.");
      return;
    }

    const baseUrlInput = typeof answers.baseUrl === "string" ? answers.baseUrl.trim() : "";
    const modelInput = typeof answers.model === "string" ? answers.model.trim() : "";
    const finalBaseUrl = baseUrlInput || DEFAULT_OLLAMA_BASE_URL;
    const finalModel = modelInput || DEFAULT_OLLAMA_MODEL;
    const finalFallback = answers.fallback;

    const nextConfig = { ...loadGlobalConfig() };
    nextConfig[CONFIG_KEY_USE_OLLAMA] = "true";
    nextConfig[CONFIG_KEY_OLLAMA_BASE_URL] = finalBaseUrl;
    nextConfig[CONFIG_KEY_OLLAMA_MODEL] = finalModel;
    nextConfig[CONFIG_KEY_OLLAMA_FALLBACK] = finalFallback ? "true" : "false";
    saveGlobalConfig(nextConfig);

    console.log(
      `✅ Ollama enabled. Base URL: ${finalBaseUrl}, Model: ${finalModel}, Fallback: ${finalFallback}.`,
    );
    if (finalFallback && !isOpenRouterConfigured()) {
      console.warn(
        `⚠️ Fallback enabled, but OpenRouter API key is not configured. Fallback will not work until an API key is set (via env or 'commiat config').`,
      );
    }
    console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
    return;
  }

  const nextConfig = { ...loadGlobalConfig() };
  nextConfig[CONFIG_KEY_USE_OLLAMA] = "false";
  nextConfig[CONFIG_KEY_OLLAMA_FALLBACK] = "false";
  saveGlobalConfig(nextConfig);
  console.log(`⚪ Ollama disabled. Commiat will use OpenRouter (if configured).`);
  console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
}

module.exports = {
  configureOllama,
};
