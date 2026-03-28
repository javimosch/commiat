const {
  DEFAULT_CONVENTIONAL_FORMAT,
  DEFAULT_OPENROUTER_MODEL,
  CONFIG_KEY_OPENROUTER_MODEL,
} = require("./constants");

const { loadGlobalConfig, fsLogError } = require("./globalStore");
const { getLlmProviderConfig } = require("./providerConfig");
const { isOpenRouterConfigured } = require("./apiKey");
const {
  callOllamaApi,
  callOpenRouterApi,
  callOpenRouterWithPromptSizing,
  formatOpenRouterErrorForCli,
} = require("./llm");

function applyPrefixAffixToMessage(message, options) {
  let messageToPrompt = String(message || "").trim();
  if (!messageToPrompt) return messageToPrompt;
  if (!options?.prefix && !options?.affix) return messageToPrompt;

  const lines = messageToPrompt.split("\n");
  let firstLine = lines[0] || "";

  if (options.prefix) {
    firstLine = `${options.prefix}${options.prefix.endsWith(" ") ? "" : " "}${firstLine}`;
  }
  if (options.affix) {
    firstLine = `${firstLine}${options.affix.startsWith(" ") ? "" : " "}${options.affix}`;
  }

  lines[0] = firstLine;
  return lines.join("\n");
}

function substituteVariablesInMessage(message, systemVarValues) {
  let result = String(message || "").trim();

  for (const varName in systemVarValues) {
    const varValue = systemVarValues[varName];
    const placeholder = `{${varName}}`;
    const regex = new RegExp(`\\${placeholder}`, "g");
    if (result.includes(placeholder)) {
      result = result.replace(regex, varValue);
    }
  }

  return result;
}

function buildCommitPrompt(diff, localConfig, systemVarValues) {
  let prompt = `Generate a Git commit message based on the following diff.\n\nIMPORTANT INSTRUCTIONS ON HOW TO INTERPRET THE DIFF:\n1. A file is DELETED if its diff header contains "deleted file mode". The content of a deleted file, prefixed with '-', represents what was removed. Your commit message should reflect this deletion.\n2. A file is ADDED if its diff header contains "new file mode".\n3. A file is MODIFIED if its header does not contain "deleted file mode" or "new file mode".\n4. IGNORE PURELY FORMATTING CHANGES. Changes like whitespace, indentation, newlines, or adding/removing semicolons are not important. Focus on the semantic and logical changes to understand the real purpose of the commit.\n5. BE SPECIFIC. A good commit message provides context. Instead of a generic message like "Update file", be specific about what was changed. For example, "refactor: Simplify logic in user authentication". If a version is being updated in a file like package.json, mention the change in detail (e.g., "chore: Bump version from 1.0.0 to 1.1.0"). If a dependency is updated, mention the dependency name and the version change.\n6. ONLY reference files and changes that appear in the provided diff. Do NOT mention or imply changes to files that are not present in the diff, even if they seem related.\n\nAnalyze the following diff using these instructions and generate a concise, accurate commit message.\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;

  const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
  prompt += `The desired commit message format is: "${format}"\n`;

  if (localConfig && Object.keys(localConfig.variables).length > 0) {
    prompt += "Variable descriptions (use these to fill the format placeholders):\n";
    for (const variable in localConfig.variables) {
      if (format.includes(`{${variable}}`)) {
        prompt += `- {${variable}}: ${localConfig.variables[variable]}\n`;
      }
    }
  }

  const variablesInFormat = require("../variables").detectVariables(format);
  const relevantSystemVars = {};
  variablesInFormat.forEach((v) => {
    if (systemVarValues[v] !== undefined) relevantSystemVars[v] = systemVarValues[v];
  });

  if (Object.keys(relevantSystemVars).length > 0) {
    prompt += "System variable values (use these directly):\n";
    for (const variable in relevantSystemVars) {
      prompt += `- {${variable}}: ${relevantSystemVars[variable] || "N/A"}\n`;
    }
  }

  prompt +=
    "\nGenerate ONLY the commit message string, adhering strictly to the specified format and variable descriptions";

  return prompt;
}

async function generateCommitMessage(diff, localConfig, systemVarValues) {
  const llmConfig = getLlmProviderConfig();
  console.log(
    `Using provider: ${llmConfig.provider}, Model: ${llmConfig.model}${llmConfig.fallbackEnabled ? ", Fallback Enabled" : ""}`,
  );

  const prompt = buildCommitPrompt(diff, localConfig, systemVarValues);

  try {
    if (llmConfig.provider === "ollama") {
      try {
        let message = await callOllamaApi(prompt, llmConfig);
        message = substituteVariablesInMessage(message, systemVarValues);
        return message;
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

          let message = await callOpenRouterWithPromptSizing(prompt, openRouterConfig);
          message = substituteVariablesInMessage(message, systemVarValues);
          return message;
        }

        throw ollamaError;
      }
    }

    let message = await callOpenRouterWithPromptSizing(prompt, llmConfig);
    message = substituteVariablesInMessage(message, systemVarValues);
    return message;
  } catch (error) {
    await fsLogError(error);
    console.error(
      `\n❌ Failed to generate commit message using ${error.provider || "configured provider"}.`,
    );

    if (error.provider === "ollama") {
      console.error(
        `Ensure Ollama is running at ${error.requestUrl?.replace("/api/chat", "")} and the model is available.`,
      );
      if (llmConfig.fallbackEnabled && !isOpenRouterConfigured()) {
        console.error(
          "Fallback to OpenRouter is enabled, but OpenRouter API key is not configured.",
        );
      }
    } else if (error.provider === "openrouter") {
      if (error.isAuthenticationError) {
        console.error("OpenRouter authentication failed. Check your API key.");
      } else if (error.isRateLimitError) {
        console.error(formatOpenRouterErrorForCli(error));
        console.error("Rate limit reached. Retry in a moment or use a different model.");
      } else if (error.isModelNotFoundError) {
        console.error(formatOpenRouterErrorForCli(error));
        console.error("Configured model may be unavailable. Run 'commiat model-select' to pick another.");
      } else if (error.isContextLimitError) {
        console.error(formatOpenRouterErrorForCli(error));
        console.error("Prompt exceeded model context limits after retries. Try reducing staged diff size.");
      } else if (error.isNetworkError) {
        console.error(formatOpenRouterErrorForCli(error));
      } else {
        console.error(formatOpenRouterErrorForCli(error));
      }
    }

    throw new Error(`Commit message generation failed: ${error.message}`);
  }
}

module.exports = {
  applyPrefixAffixToMessage,
  substituteVariablesInMessage,
  generateCommitMessage,
};
