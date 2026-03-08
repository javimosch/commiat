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
  updateGlobalConfig,
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

  const { useOllama } = await inquirer.prompt([
    {
      type: "confirm",
      name: "useOllama",
      message: "Enable Ollama for commit message generation?",
      default: currentUseOllama,
    },
  ]);

  if (useOllama) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "baseUrl",
        message: `Enter Ollama base URL (leave blank for default: ${DEFAULT_OLLAMA_BASE_URL}):`,
        default: currentBaseUrl,
      },
      {
        type: "input",
        name: "model",
        message: `Enter Ollama model name (leave blank for default: ${DEFAULT_OLLAMA_MODEL}):`,
        default: currentModel,
      },
      {
        type: "confirm",
        name: "fallback",
        message: "Enable fallback to OpenRouter if Ollama fails (requires OpenRouter API key)?",
        default: currentFallback,
      },
    ]);

    const finalBaseUrl = answers.baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL;
    const finalModel = answers.model.trim() || DEFAULT_OLLAMA_MODEL;
    const finalFallback = answers.fallback;

    updateGlobalConfig(CONFIG_KEY_USE_OLLAMA, "true");
    updateGlobalConfig(CONFIG_KEY_OLLAMA_BASE_URL, finalBaseUrl);
    updateGlobalConfig(CONFIG_KEY_OLLAMA_MODEL, finalModel);
    updateGlobalConfig(CONFIG_KEY_OLLAMA_FALLBACK, finalFallback ? "true" : "false");

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

  updateGlobalConfig(CONFIG_KEY_USE_OLLAMA, "false");
  updateGlobalConfig(CONFIG_KEY_OLLAMA_FALLBACK, "false");
  console.log(`⚪ Ollama disabled. Commiat will use OpenRouter (if configured).`);
  console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
}

module.exports = {
  configureOllama,
};
