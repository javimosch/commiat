const { getLlmProviderConfig } = require("../core/providerConfig");
const { callOllamaApi, callOpenRouterApi, formatOpenRouterErrorForCli } = require("../core/llm");
const { fsLogError } = require("../core/globalStore");
const { isOpenRouterConfigured } = require("../core/apiKey");
const {
  CONFIG_KEY_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} = require("../core/constants");
const { loadGlobalConfig } = require("../core/globalStore");

async function testLlmCompletion() {
  console.log("🧪 Testing LLM completion...");
  const llmConfig = getLlmProviderConfig();
  const testPrompt = "Say HI";
  console.log(`\nUsing provider: ${llmConfig.provider}`);
  console.log(`Input:`);
  console.log(`- Prompt: "${testPrompt}"`);
  console.log(`- Model: ${llmConfig.model}`);
  if (llmConfig.provider === "ollama") {
    console.log(`- Base URL: ${llmConfig.baseUrl}`);
    console.log(`- Fallback Enabled: ${llmConfig.fallbackEnabled}`);
  }

  try {
    let output;
    if (llmConfig.provider === "ollama") {
      try {
        output = await callOllamaApi(testPrompt, llmConfig);
        console.log("\n✅ Ollama test successful!");
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
            `⚠️ Ollama test failed (Status: ${ollamaError.responseStatus || "N/A"}, Message: ${ollamaError.message}). Attempting fallback test with OpenRouter...`,
          );
          await fsLogError(ollamaError);
          const globalConfig = loadGlobalConfig();
          const openRouterModel =
            process.env[CONFIG_KEY_OPENROUTER_MODEL] ||
            globalConfig[CONFIG_KEY_OPENROUTER_MODEL] ||
            DEFAULT_OPENROUTER_MODEL;
          const openRouterConfig = { provider: "openrouter", model: openRouterModel };
          output = await callOpenRouterApi(testPrompt, openRouterConfig);
          console.log("\n✅ OpenRouter fallback test successful!");
        } else {
          throw ollamaError;
        }
      }
    } else {
      output = await callOpenRouterApi(testPrompt, llmConfig);
      console.log("\n✅ OpenRouter test successful!");
    }
    console.log(`\nOutput:`);
    console.log(`- Response: "${output}"`);
  } catch (error) {
    await fsLogError(error);
    console.error(`\n❌ Test failed for ${error.provider || "configured provider"}.`);
    if (error.provider === "ollama") {
      console.error(
        `Ensure Ollama is running at ${error.requestUrl?.replace("/api/chat", "")} and the model is available.`,
      );
      if (llmConfig.fallbackEnabled && !isOpenRouterConfigured()) {
        console.error(
          `Fallback to OpenRouter is enabled, but OpenRouter API key is not configured.`,
        );
      }
    } else if (error.provider === "openrouter") {
      if (error.isAuthenticationError) {
        console.error("OpenRouter authentication failed. Check your API key.");
      } else if (error.isRateLimitError) {
        console.error(formatOpenRouterErrorForCli(error));
        console.error("Rate limit reached. Retry in a moment or switch model.");
      } else if (error.isModelNotFoundError) {
        console.error(formatOpenRouterErrorForCli(error));
        console.error("Configured model may be unavailable. Run 'commiat model-select' to pick another.");
      } else if (error.isContextLimitError) {
        console.error(formatOpenRouterErrorForCli(error));
        console.error("Prompt exceeded model context limits after retries.");
      } else if (error.isNetworkError) {
        console.error(formatOpenRouterErrorForCli(error));
      } else {
        console.error(formatOpenRouterErrorForCli(error));
      }
    }
    process.exit(1);
  }
}

module.exports = {
  testLlmCompletion,
};
