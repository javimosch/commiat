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

async function callOllamaApi(prompt, llmConfig) {
  const ollamaUrl = `${llmConfig.baseUrl}/api/chat`;
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
    const enhancedError = new Error(error.message || "Ollama API request failed");
    enhancedError.stack = error.stack;
    enhancedError.provider = "ollama";
    enhancedError.requestUrl = ollamaUrl;
    enhancedError.responseStatus = error.response?.status;
    enhancedError.responseData = error.response?.data;
    enhancedError.isNetworkError = !!error.request && !error.response;
    throw enhancedError;
  }
}

async function callOpenRouterApi(prompt, llmConfig) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Could not obtain OpenRouter API key.");
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
    const enhancedError = new Error(error.message || "OpenRouter API request failed");
    enhancedError.stack = error.stack;
    enhancedError.provider = "openrouter";
    enhancedError.requestUrl = OPENROUTER_API_URL;
    enhancedError.responseStatus = error.response?.status;
    enhancedError.responseData = error.response?.data;
    enhancedError.isAuthenticationError = error.response?.status === 401;
    throw enhancedError;
  }
}

async function callOpenRouterWithPromptSizing(prompt, llmConfig) {
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
      return await callOpenRouterApi(sizedPrompt, llmConfig);
    } catch (err) {
      lastErr = err;
      if (!isLikelyContextLimitError(err)) {
        throw err;
      }
    }
  }

  throw lastErr;
}

async function generateLlmText(prompt, llmConfig, allowPromptSizing = false) {
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
            return await callOpenRouterWithPromptSizing(prompt, openRouterConfig);
          }
          return await callOpenRouterApi(prompt, openRouterConfig);
        }

        throw ollamaError;
      }
    }

    if (allowPromptSizing) {
      return await callOpenRouterWithPromptSizing(prompt, llmConfig);
    }

    return await callOpenRouterApi(prompt, llmConfig);
  } catch (error) {
    await fsLogError(error);
    throw error;
  }
}

module.exports = {
  callOllamaApi,
  callOpenRouterApi,
  callOpenRouterWithPromptSizing,
  generateLlmText,
  isLikelyContextLimitError,
};
