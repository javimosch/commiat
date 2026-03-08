const {
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  CONFIG_KEY_OPENROUTER_MODEL,
  CONFIG_KEY_USE_OLLAMA,
  CONFIG_KEY_OLLAMA_BASE_URL,
  CONFIG_KEY_OLLAMA_MODEL,
  CONFIG_KEY_OLLAMA_FALLBACK,
  CONFIG_KEY_DEFAULT_MULTI,
} = require("./constants");

const { loadGlobalConfig } = require("./globalStore");

function getLlmProviderConfig() {
  const envUseOllama = process.env[CONFIG_KEY_USE_OLLAMA];
  const globalConfig = loadGlobalConfig();
  const configUseOllama = globalConfig[CONFIG_KEY_USE_OLLAMA];
  const configFallback = globalConfig[CONFIG_KEY_OLLAMA_FALLBACK] === "true";

  const useOllama =
    envUseOllama === "1" ||
    envUseOllama === "true" ||
    (!envUseOllama && configUseOllama === "true");

  if (useOllama) {
    const baseUrl =
      process.env[CONFIG_KEY_OLLAMA_BASE_URL] ||
      globalConfig[CONFIG_KEY_OLLAMA_BASE_URL] ||
      DEFAULT_OLLAMA_BASE_URL;
    const model =
      process.env[CONFIG_KEY_OLLAMA_MODEL] ||
      globalConfig[CONFIG_KEY_OLLAMA_MODEL] ||
      DEFAULT_OLLAMA_MODEL;
    return {
      provider: "ollama",
      baseUrl,
      model,
      fallbackEnabled: configFallback,
    };
  }

  const model =
    process.env[CONFIG_KEY_OPENROUTER_MODEL] ||
    globalConfig[CONFIG_KEY_OPENROUTER_MODEL] ||
    DEFAULT_OPENROUTER_MODEL;
  return { provider: "openrouter", model, fallbackEnabled: false };
}

function getDefaultMultiConfig() {
  const globalConfig = loadGlobalConfig();
  return globalConfig[CONFIG_KEY_DEFAULT_MULTI] === "true";
}

module.exports = {
  getLlmProviderConfig,
  getDefaultMultiConfig,
};
