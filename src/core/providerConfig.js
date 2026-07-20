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

function isValidUrl(str) {
  if (!str || typeof str !== "string") return false;
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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
    const rawBaseUrl =
      process.env[CONFIG_KEY_OLLAMA_BASE_URL] ||
      globalConfig[CONFIG_KEY_OLLAMA_BASE_URL] ||
      DEFAULT_OLLAMA_BASE_URL;
    const baseUrl =
      typeof rawBaseUrl === "string" ? rawBaseUrl.replace(/\/+$/, "") : "";
    if (!isValidUrl(baseUrl)) {
      throw new Error(
        `Invalid Ollama base URL: "${baseUrl || rawBaseUrl}". Must be a valid http(s) URL.`,
      );
    }
    const rawModel =
      process.env[CONFIG_KEY_OLLAMA_MODEL] ||
      globalConfig[CONFIG_KEY_OLLAMA_MODEL] ||
      DEFAULT_OLLAMA_MODEL;
    const model = typeof rawModel === "string" ? rawModel.trim() : "";
    if (!model) {
      throw new Error("Ollama model must be a non-empty string.");
    }
    return {
      provider: "ollama",
      baseUrl,
      model,
      fallbackEnabled: configFallback,
    };
  }

  const rawModel =
    process.env[CONFIG_KEY_OPENROUTER_MODEL] ||
    globalConfig[CONFIG_KEY_OPENROUTER_MODEL] ||
    DEFAULT_OPENROUTER_MODEL;
  const model = typeof rawModel === "string" ? rawModel.trim() : "";
  if (!model) {
    throw new Error("OpenRouter model must be a non-empty string.");
  }
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
