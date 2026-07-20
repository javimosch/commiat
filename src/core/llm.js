const axios = require("axios");

const { OPENROUTER_API_URL } = require("./constants");
const { getApiKey, isOpenRouterConfigured } = require("./apiKey");
const { loadGlobalConfig, fsLogError } = require("./globalStore");
const {
  CONFIG_KEY_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} = require("./constants");

const {
  getMaxPromptChars,
  isLikelyContextLimitError,
  middleOutCompress,
} = require("./promptSizing");

function isValidUrl(str) {
  if (!str || typeof str !== "string") return false;
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeErrorText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function extractOpenRouterProviderMessage(error) {
  const data = error?.response?.data;

  const fromErrorsArray = Array.isArray(data?.errors)
    ? data.errors
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            return item.message || item.detail || item.title || "";
          }
          return "";
        })
        .filter(Boolean)
        .join("; ")
    : "";

  const candidates = [
    data?.error?.message,
    data?.error?.detail,
    data?.message,
    data?.detail,
    fromErrorsArray,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeErrorText(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function extractOpenRouterRequestId(error) {
  const headers = error?.response?.headers || {};
  const data = error?.response?.data;
  return (
    headers["x-request-id"] ||
    headers["x-openrouter-request-id"] ||
    data?.request_id ||
    data?.id ||
    null
  );
}

function formatOpenRouterErrorForCli(error) {
  const statusPart = error?.responseStatus ? ` (Status: ${error.responseStatus})` : "";
  const detail = normalizeErrorText(error?.providerMessage || error?.message);
  const requestIdPart = error?.requestId ? ` [request_id: ${error.requestId}]` : "";

  if (detail) {
    return `OpenRouter request failed${statusPart}: ${detail}${requestIdPart}`;
  }

  return `OpenRouter request failed${statusPart}${requestIdPart}`;
}

function createProviderError(provider, message, extras = {}) {
  const err = new Error(message);
  err.provider = provider;
  for (const [key, value] of Object.entries(extras)) {
    err[key] = value;
  }
  return err;
}

async function callOllamaApi(prompt, llmConfig) {
  if (!llmConfig || typeof llmConfig !== "object") {
    throw createProviderError("ollama", "Invalid Ollama configuration: llmConfig is required.");
  }
  if (!llmConfig.baseUrl || typeof llmConfig.baseUrl !== "string") {
    throw createProviderError(
      "ollama",
      "Invalid Ollama configuration: baseUrl must be a non-empty string.",
    );
  }
  const baseUrl = llmConfig.baseUrl.replace(/\/+$/, "");
  if (!isValidUrl(baseUrl)) {
    throw createProviderError(
      "ollama",
      `Invalid Ollama base URL: "${baseUrl}". Must be a valid http(s) URL.`,
    );
  }
  const ollamaUrl = `${baseUrl}/api/chat`;
  console.log(`Sending request to Ollama: ${ollamaUrl}`);
  try {
    const response = await axios.post(
      ollamaUrl,
      {
        model: llmConfig.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      },
      { headers: { "Content-Type": "application/json" } },
    );
    if (response.data && response.data.message && response.data.message.content) {
      let message = response.data.message.content.trim();
      message = message.replace(/^```(?:git|commit|text)?\s*/, "").replace(/```\s*$/, "");
      message = message.replace(/^["']|["']$/g, "");
      return message.trim();
    }
    throw new Error("Invalid Ollama API response structure.");
  } catch (error) {
    const fallbackMessage =
      (error && typeof error === "object" && error.message) ||
      (typeof error === "string" ? error : "") ||
      "Ollama API request failed";
    const enhancedError = new Error(fallbackMessage);
    if (error && typeof error === "object" && error.stack) {
      enhancedError.stack = error.stack;
    }
    enhancedError.provider = "ollama";
    enhancedError.requestUrl = ollamaUrl;
    enhancedError.responseStatus = error?.response?.status;
    enhancedError.responseData = error?.response?.data;
    enhancedError.isNetworkError = !!error?.request && !error?.response;
    throw enhancedError;
  }
}

async function callOpenRouterApi(prompt, llmConfig, nonInteractive = false) {
  if (!llmConfig || typeof llmConfig !== "object") {
    throw createProviderError("openrouter", "Invalid OpenRouter configuration: llmConfig is required.");
  }
  if (!llmConfig.model || typeof llmConfig.model !== "string") {
    throw createProviderError(
      "openrouter",
      "Invalid OpenRouter configuration: model must be a non-empty string.",
    );
  }
  const apiKey = await getApiKey(true, nonInteractive);
  if (!apiKey) {
    throw createProviderError("openrouter", "Could not obtain OpenRouter API key.");
  }
  console.log(`Sending request to OpenRouter: ${OPENROUTER_API_URL}`);
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      { model: llmConfig.model, messages: [{ role: "user", content: prompt }] },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost",
          "X-Title": "Commiat CLI",
        },
      },
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      let message = response.data.choices[0].message.content.trim();
      message = message.replace(/^```(?:git|commit|text)?\s*/, "").replace(/```\s*$/, "");
      message = message.replace(/^["']|["']$/g, "");
      return message.trim();
    }
    throw new Error("Invalid OpenRouter API response structure.");
  } catch (error) {
    const responseStatus = error?.response?.status ?? error?.responseStatus;
    const responseData = error?.response?.data ?? error?.responseData;
    const providerMessage = extractOpenRouterProviderMessage(error);
    const fallbackMessage =
      normalizeErrorText(error?.message) || "OpenRouter API request failed";

    const enhancedError = new Error(providerMessage || fallbackMessage);
    if (error && typeof error === "object" && error.stack) {
      enhancedError.stack = error.stack;
    }
    enhancedError.provider = "openrouter";
    enhancedError.requestUrl = OPENROUTER_API_URL;
    enhancedError.responseStatus = responseStatus;
    enhancedError.responseData = responseData;
    enhancedError.providerMessage = providerMessage || null;
    enhancedError.providerCode =
      responseData?.error?.code || responseData?.error?.type || responseData?.code || null;
    enhancedError.requestId = extractOpenRouterRequestId(error);
    enhancedError.isAuthenticationError = responseStatus === 401 || responseStatus === 403;
    enhancedError.isRateLimitError = responseStatus === 429;
    enhancedError.isModelNotFoundError =
      responseStatus === 404 && /model|not found/i.test(providerMessage || fallbackMessage);
    enhancedError.isNetworkError = !!error?.request && !error?.response;
    enhancedError.isContextLimitError = isLikelyContextLimitError(enhancedError);
    throw enhancedError;
  }
}

async function callOpenRouterWithPromptSizing(prompt, llmConfig, nonInteractive = false) {
  const maxPromptChars = getMaxPromptChars();
  const tierBudgets = [
    maxPromptChars,
    Math.floor(maxPromptChars * 0.8),
    Math.floor(maxPromptChars * 0.6),
    Math.floor(maxPromptChars * 0.45),
    Math.floor(maxPromptChars * 0.3),
  ].filter((n) => n > 0);

  let lastErr;
  for (let i = 0; i < tierBudgets.length; i++) {
    const budget = tierBudgets[i];
    const sizedPrompt = middleOutCompress(prompt, budget);
    try {
      if (i > 0) {
        console.warn(
          `⚠️ Retrying OpenRouter request with reduced prompt (tier ${i + 1}/${tierBudgets.length}, ~${budget} chars)...`,
        );
      }
      return await callOpenRouterApi(sizedPrompt, llmConfig, nonInteractive);
    } catch (err) {
      lastErr = err;
      if (!isLikelyContextLimitError(err)) {
        throw err;
      }
    }
  }

  throw lastErr;
}

async function generateLlmText(prompt, llmConfig, allowPromptSizing = false, nonInteractive = false) {
  if (!llmConfig || typeof llmConfig !== "object") {
    throw new Error("Invalid LLM configuration: llmConfig is required.");
  }
  if (typeof prompt !== "string") {
    throw new Error("Invalid prompt: prompt must be a string.");
  }
  console.log(
    `Using provider: ${llmConfig.provider}, Model: ${llmConfig.model}${llmConfig.fallbackEnabled ? ", Fallback Enabled" : ""}`,
  );

  try {
    if (llmConfig.provider === "ollama") {
      try {
        return await callOllamaApi(prompt, llmConfig);
      } catch (ollamaError) {
        const canFallback = llmConfig.fallbackEnabled && isOpenRouterConfigured();
        const shouldAttemptFallback =
          ollamaError.isNetworkError ||
          (ollamaError.responseStatus &&
            ollamaError.responseStatus >= 400 &&
            ollamaError.responseStatus !== 401 &&
            ollamaError.responseStatus !== 403);

        if (canFallback && shouldAttemptFallback) {
          console.warn(
            `⚠️ Ollama request failed (Status: ${ollamaError.responseStatus || "N/A"}, Message: ${ollamaError.message}). Attempting fallback to OpenRouter...`,
          );
          await fsLogError(ollamaError);
          const globalConfig = loadGlobalConfig();
          const openRouterModel =
            process.env[CONFIG_KEY_OPENROUTER_MODEL] ||
            globalConfig[CONFIG_KEY_OPENROUTER_MODEL] ||
            DEFAULT_OPENROUTER_MODEL;
          const openRouterConfig = { provider: "openrouter", model: openRouterModel };

          if (allowPromptSizing) {
            return await callOpenRouterWithPromptSizing(prompt, openRouterConfig, nonInteractive);
          }
          return await callOpenRouterApi(prompt, openRouterConfig, nonInteractive);
        }

        throw ollamaError;
      }
    }

    if (allowPromptSizing) {
      return await callOpenRouterWithPromptSizing(prompt, llmConfig, nonInteractive);
    }

    return await callOpenRouterApi(prompt, llmConfig, nonInteractive);
  } catch (error) {
    await fsLogError(error);
    throw error;
  }
}

module.exports = {
  callOllamaApi,
  callOpenRouterApi,
  callOpenRouterWithPromptSizing,
  formatOpenRouterErrorForCli,
  generateLlmText,
  isLikelyContextLimitError,
};
