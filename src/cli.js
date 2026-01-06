#!/usr/bin/env node

require("dotenv").config();
const { program } = require("commander");
const simpleGit = require("simple-git");
const axios = require("axios");
const inquirer = require("inquirer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const dotenv = require("dotenv");

inquirer.registerPrompt("autocomplete", require("inquirer-autocomplete-prompt"));

const localConfigManager = require("./config");
const variableProcessor = require("./variables");

const git = simpleGit();
const gitUtils = require("./utils/git");

// --- Constants ---
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash-lite";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3";
const DEFAULT_CONVENTIONAL_FORMAT = "{type}: {msg}";
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".commiat");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config");
const GLOBAL_STATE_PATH = path.join(GLOBAL_CONFIG_DIR, "state"); // State file path
const LEAD_WEBHOOK_URL =
  "https://activepieces.coolify.intrane.fr/api/v1/webhooks/Uo0638ojR53Psjs2PFAgG";

// --- Config Keys ---
const CONFIG_KEY_API_KEY = "COMMIAT_OPENROUTER_API_KEY";
const CONFIG_KEY_OPENROUTER_MODEL = "COMMIAT_OPENROUTER_MODEL";
const CONFIG_KEY_USE_OLLAMA = "COMMIAT_USE_OLLAMA";
const CONFIG_KEY_OLLAMA_BASE_URL = "COMMIAT_OLLAMA_BASE_URL";
const CONFIG_KEY_OLLAMA_MODEL = "COMMIAT_OLLAMA_MODEL";
const CONFIG_KEY_OLLAMA_FALLBACK = "COMMIAT_OLLAMA_FALLBACK_TO_OPENROUTER";
const CONFIG_KEY_DEFAULT_MULTI = "COMMIAT_DEFAULT_MULTI";

// --- State Keys ---

const STATE_KEY_LEAD_PROMPTED = "LEAD_PROMPTED";
const STATE_KEY_LEAD_PROMPTED_AT = "LEAD_PROMPTED_AT";
const STATE_KEY_LEAD_PROMPTED_SUCCESS = "LEAD_PROMPTED_SUCCESS";

// --- Global Config/State Directory ---
function ensureGlobalConfigDirExists() {
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }
}

// --- Global Config Functions ---
function ensureGlobalConfigFileExists() {
  ensureGlobalConfigDirExists();
  if (!fs.existsSync(GLOBAL_CONFIG_PATH)) {
    fs.writeFileSync(GLOBAL_CONFIG_PATH, "", "utf8");
    console.log(`Created empty global config file at ${GLOBAL_CONFIG_PATH}`);
  }
}

function loadGlobalConfig() {
  ensureGlobalConfigFileExists();
  try {
    const fileContent = fs.readFileSync(GLOBAL_CONFIG_PATH, "utf8");
    return dotenv.parse(fileContent);
  } catch (error) {
    console.error(
      `Error reading global config file ${GLOBAL_CONFIG_PATH}:`,
      error,
    );
    return {};
  }
}

function saveGlobalConfig(configObj) {
  ensureGlobalConfigDirExists();
  let fileContent = "";
  for (const key in configObj) {
    if (Object.hasOwnProperty.call(configObj, key)) {
      const value = configObj[key];
      const formattedValue =
        typeof value === "boolean" && value === true
          ? "true"
          : typeof value === "boolean" && value === false
            ? "false"
            : /\s|#|"|'|=/.test(String(value))
              ? `"${String(value).replace(/"/g, '\\"')}"`
              : String(value);
      fileContent += `${key}=${formattedValue}\n`;
    }
  }
  try {
    fs.writeFileSync(GLOBAL_CONFIG_PATH, fileContent.trim(), "utf8");
  } catch (error) {
    console.error(
      `Error writing global config file ${GLOBAL_CONFIG_PATH}:`,
      error,
    );
  }
}

function updateGlobalConfig(key, value) {
  const currentConfig = loadGlobalConfig();
  currentConfig[key] = value;
  saveGlobalConfig(currentConfig);
}

// --- Global State Functions ---
function ensureGlobalStateFileExists() {
  ensureGlobalConfigDirExists(); // State file is in the same directory
  if (!fs.existsSync(GLOBAL_STATE_PATH)) {
    fs.writeFileSync(GLOBAL_STATE_PATH, "", "utf8");
    // No need to log creation of state file, it's internal
  }
}

function loadState() {
  ensureGlobalStateFileExists();
  try {
    const fileContent = fs.readFileSync(GLOBAL_STATE_PATH, "utf8");
    return dotenv.parse(fileContent);
  } catch (error) {
    console.error(
      `Error reading global state file ${GLOBAL_STATE_PATH}:`,
      error,
    );
    return {}; // Return empty object on error
  }
}

function saveState(stateObj) {
  ensureGlobalConfigDirExists();
  let fileContent = "";
  for (const key in stateObj) {
    if (Object.hasOwnProperty.call(stateObj, key)) {
      const value = stateObj[key];
      // Simple key=value format for state
      fileContent += `${key}=${value}\n`;
    }
  }
  try {
    fs.writeFileSync(GLOBAL_STATE_PATH, fileContent.trim(), "utf8");
  } catch (error) {
    console.error(
      `Error writing global state file ${GLOBAL_STATE_PATH}:`,
      error,
    );
  }
}

function updateState(key, value) {
  const currentState = loadState();
  currentState[key] = value;
  saveState(currentState);
}

// --- API Key / Provider Specific Config ---

async function promptForApiKey() {
  console.log("OpenRouter API key not found in environment or global config.");
  const { apiKey } = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: "Please enter your OpenRouter API key:",
      mask: "*",
      validate: (input) =>
        input.trim().length > 0 ? true : "API key cannot be empty.",
    },
  ]);
  const trimmedKey = apiKey.trim();
  updateGlobalConfig(CONFIG_KEY_API_KEY, trimmedKey);
  console.log(`API Key saved to ${GLOBAL_CONFIG_PATH}`);
  return trimmedKey;
}

function isOpenRouterConfigured() {
  const envApiKey = process.env[CONFIG_KEY_API_KEY];
  if (envApiKey && envApiKey !== "YOUR_API_KEY_HERE") {
    return true;
  }
  const globalConfig = loadGlobalConfig();
  const configApiKey = globalConfig[CONFIG_KEY_API_KEY];
  return !!configApiKey;
}

async function getApiKey(promptIfNeeded = true) {
  const envApiKey = process.env[CONFIG_KEY_API_KEY];
  if (envApiKey && envApiKey !== "YOUR_API_KEY_HERE") {
    return envApiKey;
  }

  const globalConfig = loadGlobalConfig();
  const configApiKey = globalConfig[CONFIG_KEY_API_KEY];
  if (configApiKey) {
    return configApiKey;
  }

  if (promptIfNeeded) {
    return await promptForApiKey();
  } else {
    return null;
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
  } else {
    const model =
      process.env[CONFIG_KEY_OPENROUTER_MODEL] ||
      globalConfig[CONFIG_KEY_OPENROUTER_MODEL] ||
      DEFAULT_OPENROUTER_MODEL;
    return { provider: "openrouter", model, fallbackEnabled: false };
  }
}

function getDefaultMultiConfig() {
  const globalConfig = loadGlobalConfig();
  return globalConfig[CONFIG_KEY_DEFAULT_MULTI] === "true";
}

// --- Editor Function ---
function openConfigInEditor() {
  ensureGlobalConfigFileExists();
  const editor = process.env.EDITOR || "nano";
  console.log(`Opening global config ${GLOBAL_CONFIG_PATH} in ${editor}...`);
  try {
    const child = spawn(editor, [GLOBAL_CONFIG_PATH], {
      stdio: "inherit",
      detached: true,
    });
    child.on("error", (err) => {
      console.error(`\n❌ Failed to start editor '${editor}': ${err.message}`);
      console.error(
        `Please ensure '${editor}' is installed and in your PATH, or set the EDITOR environment variable.`,
      );
      process.exit(1);
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        console.log(
          `\nEditor closed. Global config file saved (hopefully 😉).`,
        );
      } else {
        console.warn(`\nEditor exited with code ${code} (signal: ${signal}).`);
      }
    });
  } catch (error) {
    console.error(`\n❌ Error spawning editor: ${error.message}`);
    process.exit(1);
  }
}

// --- Git Functions ---
async function ensureStagedFiles() {
  const diffSummary = await git.diffSummary(["--staged"]);
  if (diffSummary.files.length === 0) {
    console.log("No staged changes found to commit.");
    process.exit(0);
  }
  return await git.diff(["--staged"]);
}

// --- Error Logging ---
async function fsLogError(error) {
  const errorLogPath = path.join(GLOBAL_CONFIG_DIR, "error.log");
  ensureGlobalConfigDirExists();
  const stack = error.stack ? `\n${error.stack}` : "";
  const providerInfo = error.provider ? `\nProvider: ${error.provider}` : "";
  const requestUrlInfo = error.requestUrl
    ? `\nRequest URL: ${error.requestUrl}`
    : "";
  const responseStatusInfo = error.responseStatus
    ? `\nResponse Status: ${error.responseStatus}`
    : "";
  const responseDataInfo = error.responseData
    ? `\nResponse Data: ${JSON.stringify(error.responseData)}`
    : "";

  const logMessage = `[${new Date().toISOString()}] ${error.message}${providerInfo}${requestUrlInfo}${responseStatusInfo}${responseDataInfo}${stack}\n\n`;
  fs.writeFileSync(errorLogPath, logMessage, { flag: "a" });
}

// --- API Call Helpers ---
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
    if (
      response.data &&
      response.data.message &&
      response.data.message.content
    ) {
      let message = response.data.message.content.trim();
      message = message
        .replace(/^```(?:git|commit|text)?\s*/, "")
        .replace(/```\s*$/, "");
      message = message.replace(/^["']|["']$/g, "");
      return message.trim();
    } else {
      throw new Error("Invalid Ollama API response structure.");
    }
  } catch (error) {
    const enhancedError = new Error(
      error.message || "Ollama API request failed",
    );
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
    if (
      response.data &&
      response.data.choices &&
      response.data.choices.length > 0
    ) {
      let message = response.data.choices[0].message.content.trim();
      message = message
        .replace(/^```(?:git|commit|text)?\s*/, "")
        .replace(/```\s*$/, "");
      message = message.replace(/^["']|["']$/g, "");
      return message.trim();
    } else {
      throw new Error("Invalid OpenRouter API response structure.");
    }
  } catch (error) {
    const enhancedError = new Error(
      error.message || "OpenRouter API request failed",
    );
    enhancedError.stack = error.stack;
    enhancedError.provider = "openrouter";
    enhancedError.requestUrl = OPENROUTER_API_URL;
    enhancedError.responseStatus = error.response?.status;
    enhancedError.responseData = error.response?.data;
    enhancedError.isAuthenticationError = error.response?.status === 401;
    throw enhancedError;
  }
}

// --- Commit Message Generation (Main Logic) ---
async function generateCommitMessage(diff, localConfig, systemVarValues) {
  const llmConfig = getLlmProviderConfig();
  console.log(
    `Using provider: ${llmConfig.provider}, Model: ${llmConfig.model}${llmConfig.fallbackEnabled ? ", Fallback Enabled" : ""}`,
  );

  let prompt = `Generate a Git commit message based on the following diff.\n\nIMPORTANT INSTRUCTIONS ON HOW TO INTERPRET THE DIFF:\n1. A file is DELETED if its diff header contains "deleted file mode". The content of a deleted file, prefixed with '-', represents what was removed. Your commit message should reflect this deletion.\n2. A file is ADDED if its diff header contains "new file mode".\n3. A file is MODIFIED if its header does not contain "deleted file mode" or "new file mode".\n4. IGNORE PURELY FORMATTING CHANGES. Changes like whitespace, indentation, newlines, or adding/removing semicolons are not important. Focus on the semantic and logical changes to understand the real purpose of the commit.\n5. BE SPECIFIC. A good commit message provides context. Instead of a generic message like "Update file", be specific about what was changed. For example, "refactor: Simplify logic in user authentication". If a version is being updated in a file like package.json, mention the change in detail (e.g., "chore: Bump version from 1.0.0 to 1.1.0"). If a dependency is updated, mention the dependency name and the version change.\n6. ONLY reference files and changes that appear in the provided diff. Do NOT mention or imply changes to files that are not present in the diff, even if they seem related.\n\nAnalyze the following diff using these instructions and generate a concise, accurate commit message.\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;
  const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
  prompt += `The desired commit message format is: "${format}"\n`;
  if (localConfig && Object.keys(localConfig.variables).length > 0) {
    prompt +=
      "Variable descriptions (use these to fill the format placeholders):\n";
    for (const variable in localConfig.variables) {
      if (format.includes(`{${variable}}`)) {
        prompt += `- {${variable}}: ${localConfig.variables[variable]}\n`;
      }
    }
  }
  const variablesInFormat = variableProcessor.detectVariables(format);
  const relevantSystemVars = {};
  variablesInFormat.forEach((v) => {
    if (systemVarValues[v] !== undefined)
      relevantSystemVars[v] = systemVarValues[v];
  });
  if (Object.keys(relevantSystemVars).length > 0) {
    prompt += "System variable values (use these directly):\n";
    for (const variable in relevantSystemVars) {
      prompt += `- {${variable}}: ${relevantSystemVars[variable] || "N/A"}\n`;
    }
  }
  prompt +=
    "\nGenerate ONLY the commit message string, adhering strictly to the specified format and variable descriptions.";

  try {
    if (llmConfig.provider === "ollama") {
      try {
        return await callOllamaApi(prompt, llmConfig);
      } catch (ollamaError) {
        const canFallback =
          llmConfig.fallbackEnabled && isOpenRouterConfigured();
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
          const openRouterConfig = {
            provider: "openrouter",
            model: openRouterModel,
          };
          return await callOpenRouterApi(prompt, openRouterConfig);
        } else {
          throw ollamaError;
        }
      }
    } else {
      return await callOpenRouterApi(prompt, llmConfig);
    }
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
          `Fallback to OpenRouter is enabled, but OpenRouter API key is not configured.`,
        );
      }
    } else if (error.provider === "openrouter") {
      if (error.isAuthenticationError) {
        console.error("OpenRouter authentication failed. Check your API key.");
      } else {
        console.error(
          `OpenRouter request failed (Status: ${error.responseStatus || "N/A"}). Check OpenRouter status or your network.`,
        );
      }
    }
    throw new Error(`Commit message generation failed: ${error.message}`);
  }
}

// --- User Interaction ---
async function promptUser(initialMessage) {
  let currentMessage = initialMessage;
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: `Suggested Commit Message:\n"${currentMessage}"\n\nWhat would you like to do?`,
        choices: [
          { name: "✅ Confirm and Commit", value: "confirm" },
          { name: "📝 Adjust Message", value: "adjust" },
          { name: "❌ Cancel", value: "cancel" },
        ],
      },
    ]);
    if (action === "confirm") {
      return currentMessage;
    } else if (action === "adjust") {
      const { adjustedMessage } = await inquirer.prompt([
        {
          type: "editor",
          name: "adjustedMessage",
          message: "Adjust the commit message:",
          default: currentMessage,
          validate: (input) =>
            input.trim().length > 0 ? true : "Commit message cannot be empty.",
        },
      ]);
      currentMessage = adjustedMessage.trim();
    } else {
      return null;
    }
  }
}

// --- Lead Generation Prompt ---
async function promptForLead() {
  const currentState = loadState();

  // If lead was successfully captured, never prompt again
  if (currentState[STATE_KEY_LEAD_PROMPTED_SUCCESS] === "1") {
    return;
  }

  const lastPromptedAt = currentState[STATE_KEY_LEAD_PROMPTED_AT];
  const oneWeek = 7 * 24 * 60 * 60 * 1000; // One week in milliseconds

  // If the user has been prompted with the new system, check if a week has passed
  if (lastPromptedAt) {
    const lastPromptDate = new Date(parseInt(lastPromptedAt, 10));
    const now = new Date();
    if (now - lastPromptDate < oneWeek) {
      return; // Not enough time has passed, so don't prompt
    }
  }

  // For backward compatibility, if the old key exists and the new one doesn't,
  // it's treated as if a week has expired, so we proceed to prompt.

  console.log("\n---\n"); // Separator

  try {
    const { interested } = await inquirer.prompt([
      {
        type: "confirm",
        name: "interested",
        message:
          "💡 Commiat Cloud is coming — your AI assistant that understands your commits, searches your history, and answers code questions. ⚡ Get early access free in exchange for feedback — interested?",
        default: true, // Default to yes
      },
    ]);

    if (interested) {
      const { email } = await inquirer.prompt([
        {
          type: "input",
          name: "email",
          message:
            "Great! Please enter your email to receive the early access link when available",
          validate: (input) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(input)
              ? true
              : "Please enter a valid email address.";
          },
        },
      ]);

      if (email) {
        const webhookUrlWithEmail = `${LEAD_WEBHOOK_URL}?email=${encodeURIComponent(
          email,
        )}`;
        console.log("Sending your interest...");
        try {
          await axios.get(webhookUrlWithEmail, { timeout: 5000 });
          console.log("Thanks! We'll be in touch.");
          // On successful email submission, mark as success
          updateState(STATE_KEY_LEAD_PROMPTED_SUCCESS, "1");
        } catch (webhookError) {
          console.warn(
            "Could not send email interest automatically, but we appreciate your interest!",
          );
          await fsLogError(
            new Error(`Webhook failed: ${webhookError.message}`),
          );
        }
      } else {
        console.log("No email provided. Thanks for your interest anyway!");
      }
    } else {
      console.log("Okay, no problem!");
    }
  } catch (promptError) {
    console.warn("Could not display the interest prompt.");
    await fsLogError(new Error(`Lead prompt failed: ${promptError.message}`));
  } finally {
    // Always update the timestamp and clean up the old key
    const newState = { ...currentState };
    newState[STATE_KEY_LEAD_PROMPTED_AT] = Date.now().toString();
    if (newState[STATE_KEY_LEAD_PROMPTED]) {
      delete newState[STATE_KEY_LEAD_PROMPTED];
    }
    saveState(newState);
    console.log("\n---\n");
  }
}

// --- Main Action ---
async function mainAction(options) {
  // Apply default multi config if not explicitly set
  if (!options.multi && getDefaultMultiConfig()) {
    options.multi = true;
  }

  console.log("Commiat CLI - Generating commit message...");
  try {
    let localConfig = await localConfigManager.loadConfig();
    const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
    if (!localConfig) {
      console.log(`Using default format: "${format}"`);
    }

    if (options.addAll) {
      console.log("Staging all changes (`git add .`)...");
      await git.add(".");
      console.log("Changes staged.");
    } else {
      const stagedSummary = await git.diffSummary(["--staged"]);
      if (stagedSummary.files.length === 0) {
        const { shouldStageAll } = await inquirer.prompt([
          {
            type: "confirm",
            name: "shouldStageAll",
            message: "No changes staged. Stage all changes now? (git add .)",
            default: true,
          },
        ]);
        if (shouldStageAll) {
          console.log("Staging all changes (`git add .`)...");
          await git.add(".");
          console.log("Changes staged.");
        } else {
          console.log("No changes staged. Aborting.");
          process.exit(0);
        }
      } else {
        console.log(`${stagedSummary.files.length} file(s) already staged.`);
      }
    }

    // Handle multi-commit mode
    if (options.multi) {
      console.log("Multi-commit mode enabled...");
      await handleMultiCommit(options);
      return;
    }

    const diff = await ensureStagedFiles();

    const variablesInFormat = variableProcessor.detectVariables(format);
    if (localConfig && variablesInFormat.length > 0) {
      const configWasUpdated =
        await variableProcessor.promptForMissingVariableDescriptions(
          variablesInFormat,
          localConfig,
        );
      if (configWasUpdated) {
        localConfig = await localConfigManager.loadConfig();
        if (!localConfig) {
          throw new Error(
            `Failed to reload ${localConfigManager.LOCAL_CONFIG_FILENAME} after updating variable descriptions.`,
          );
        }
      }
    }

    const systemVarValues = await variableProcessor.getSystemVariableValues();
    const initialCommitMessage = await generateCommitMessage(
      diff,
      localConfig,
      systemVarValues,
    );

    // Apply prefix and/or affix if provided
    let messageToPrompt = initialCommitMessage.trim();
    if (options.prefix || options.affix) {
      const lines = messageToPrompt.split("\n");
      let firstLine = lines[0] || "";

      // Apply prefix to first line
      if (options.prefix) {
        firstLine = `${options.prefix}${options.prefix.endsWith(" ") ? "" : " "}${firstLine}`;
      }

      // Apply affix to first line only
      if (options.affix) {
        firstLine = `${firstLine}${options.affix.startsWith(" ") ? "" : " "}${options.affix}`;
      }

      // Reconstruct the message with modified first line
      lines[0] = firstLine;
      messageToPrompt = lines.join("\n");
    }

    const finalCommitMessage = await promptUser(messageToPrompt);

    if (finalCommitMessage) {
      const commitOptions = {};
      if (options.verify === false) {
        commitOptions["--no-verify"] = null;
        console.log("Committing with --no-verify flag...");
      } else {
        console.log("Committing...");
      }

      await git.commit(finalCommitMessage, undefined, commitOptions);
      console.log("\n✅ Commit successful!");

      // --- Add Lead Prompt Here ---
      await promptForLead();
      // --------------------------
    } else {
      console.log("\n❌ Commit cancelled.");
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    // Don't log again if it was already logged in generateCommitMessage
    if (!error.provider) {
      // Log only if it's not an API provider error already logged
      await fsLogError(error);
    }
    process.exit(1);
  }
}

// --- Multi-commit handling ---
async function handleMultiCommit(options) {
  try {
    // Get staged and potentially untracked files to process
    const relevantFiles = await gitUtils.getRelevantFiles(options);
    if (relevantFiles.length === 0) {
      console.log("No files to commit.");
      return;
    }

    // Get unified diff for all changes
    const diff = await git.diff(["--staged"]);
    
    // If there are untracked files, add them for analysis
    if (options.untracked) {
      const untracked = await gitUtils.getUntrackedFiles();
      if (untracked.length > 0) {
        console.log(`Staging ${untracked.length} untracked files...`);
        await git.add(untracked);
      }
    }
    
    console.log("\nAnalyzing changes to group them logically...");
    
    // Ask the LLM to analyze the diff and suggest logical groupings
    const prompt = `
You are an expert software engineer analyzing Git changes. Your job is to group changes into logical commits based on the following diff.

IMPORTANT: You MUST separate unrelated changes into different groups. Do NOT group changes together just because they appear in the same diff. Each group should represent a cohesive unit of work.

The changes include:
${diff}
    
Your task:
1. Carefully analyze each file and its changes to determine logical groupings
2. SEPARATE unrelated changes (e.g., documentation updates should NOT be grouped with feature implementations)
3. For each group, describe the nature of the changes (type: feature, fix, chore, docs, etc)
4. Return a JSON array of objects describing logical groups with:
   - "group": Name of the group (e.g., "frontend UI enhancements")
   - "files": Array of file paths belonging to this group
   - "description": Brief description of the changes included in this group
   
If there are multiple unrelated changes, return multiple groups. Prefer more groups over fewer groups.
    
Return only the JSON response without any explanation or markdown formatting.
`;

    let groupAnalysis;
    try {
      const llmConfig = getLlmProviderConfig();
      groupAnalysis = await generateCommitMessage(prompt, null, {});
      
      // Clean up potential markdown formatting from LLM
      let cleanResponse = groupAnalysis.trim();
      if (cleanResponse.startsWith("```json")) {
        cleanResponse = cleanResponse.slice(7);
      }
      if (cleanResponse.startsWith("`")) {
        cleanResponse = cleanResponse.slice(1);
      }
      if (cleanResponse.endsWith("```")) {
        cleanResponse = cleanResponse.slice(0, -3);
      }
      if (cleanResponse.endsWith("`")) {
        cleanResponse = cleanResponse.slice(0, -1);
      }
      
      // Also handle cases where LLM response includes text before JSON
      const jsonMatch = cleanResponse.match(/\[\s*{.*}\s*\]/s);
      if (jsonMatch) {
        cleanResponse = jsonMatch[0];
      }
      
      // Parse the JSON response from LLM
      const parsedGroups = JSON.parse(cleanResponse);
      console.log("Successfully parsed group results.");
      
      // If groupAnalysis is not an array, wrap it in array
      const groups = Array.isArray(parsedGroups) ? parsedGroups : [parsedGroups];
      
      // Track if all commits were successful
      let allSuccessful = true;
      
      // Process each group
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        console.log(`\nProcessing group ${i+1}: ${group.group}`);
        console.log(`Files: ${group.files ? group.files.join(', ') : 'None'}`);
        console.log(`Description: ${group.description || 'None'}`);
        
        if (group.files && group.files.length > 0) {
          // Unstage everything to isolate this group's changes
          await gitUtils.unstageAll();

          // Only consider files that are actually part of the current change set
          const filesInGroup = group.files.filter((f) => relevantFiles.includes(f));

          if (filesInGroup.length === 0) {
            console.log("No matching files from this group are part of the current changes. Skipping.");
            continue;
          }

          // Stage only files in this group
          await git.add(filesInGroup);
          
          // Debug: show which files are currently staged for this group
          try {
            const stagedNow = await gitUtils.getStagedFiles();
            console.log(`Staged for this group: ${stagedNow.join(', ')}`);
          } catch {}
          
          // Generate commit message for this group
          const groupDiff = await git.diff(["--staged"]); 
          
          const localConfig = await localConfigManager.loadConfig();
          const systemVarValues = await variableProcessor.getSystemVariableValues();
          
          const groupCommitMessage = await generateCommitMessage(
            groupDiff,
            localConfig,
            systemVarValues
          );
          
          // Apply prefix and/or affix if provided
          let messageToPrompt = groupCommitMessage.trim();
          if (options.prefix || options.affix) {
            const lines = messageToPrompt.split("\n");
            let firstLine = lines[0] || "";
            
            // Apply prefix to first line
            if (options.prefix) {
              firstLine = `${options.prefix}${options.prefix.endsWith(" ") ? "" : " "}${firstLine}`;
            }
            
            // Apply affix to first line only
            if (options.affix) {
              firstLine = `${firstLine}${options.affix.startsWith(" ") ? "" : " "}${options.affix}`;
            }
            
            // Reconstruct the message with modified first line
            lines[0] = firstLine;
            messageToPrompt = lines.join("\n");
          }
          
          const finalCommitMessage = await promptUser(messageToPrompt);
          
          if (finalCommitMessage) {
            const commitOptions = {};
            if (options.verify === false) {
              commitOptions["--no-verify"] = null;
              console.log("Committing with --no-verify flag...");
            } else {
              console.log("Committing...");
            }
            
            await git.commit(finalCommitMessage, undefined, commitOptions);
            console.log(`✅ Group commit successful!\n`);
          } else {
            console.log(`\n❌ Group ${i+1} commit cancelled.`);
            allSuccessful = false;
            break;
          }
          
        } else {
          console.log(`No files found in this group. Skipping.`);
        }
      }
      
      if (allSuccessful) {
        console.log(`\n🎉 Multi-commit process completed successfully.`);
      }
    } catch (parseError) {
      console.warn(`\n⚠️ Failed to parse LLM response as JSON. Falling back to single commit mode.`);
      console.warn(`LLM Response: ${groupAnalysis}`);
      console.warn(`Error: ${parseError.message}`);
      
      // Fall back to regular commit mode
      console.log("Committing all changes in one commit...\n");
      
      const localConfig = await localConfigManager.loadConfig();
      const systemVarValues = await variableProcessor.getSystemVariableValues();
      
      const initialCommitMessage = await generateCommitMessage(
        diff,
        localConfig,
        systemVarValues,
      );
      
      // Apply prefix and/or affix if provided
      let messageToPrompt = initialCommitMessage.trim();
      if (options.prefix || options.affix) {
        const lines = messageToPrompt.split("\n");
        let firstLine = lines[0] || "";
        
        // Apply prefix to first line
        if (options.prefix) {
          firstLine = `${options.prefix}${options.prefix.endsWith(" ") ? "" : " "}${firstLine}`;
        }
        
        // Apply affix to first line only
        if (options.affix) {
          firstLine = `${firstLine}${options.affix.startsWith(" ") ? "" : " "}${options.affix}`;
        }
        
        // Reconstruct the message with modified first line
        lines[0] = firstLine;
        messageToPrompt = lines.join("\n");
      }
      
      const finalCommitMessage = await promptUser(messageToPrompt);
      
      if (finalCommitMessage) {
        const commitOptions = {};
        if (options.verify === false) {
          commitOptions["--no-verify"] = null;
          console.log("Committing with --no-verify flag...");
        } else {
          console.log("Committing...");
        }
        
        await git.commit(finalCommitMessage, undefined, commitOptions);
        console.log("\n✅ Commit successful!");
        
        // --- Add Lead Prompt Here ---
        await promptForLead();
        // --------------------------
      } else {
        console.log("\n❌ Commit cancelled.");
      }
    }
  } catch (error) {
    console.error(`\n❌ Error in multi-commit handling: ${error.message}`);
    await fsLogError(error);
    process.exit(1);
  }
}

// --- Test LLM Completion ---
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
        const canFallback =
          llmConfig.fallbackEnabled && isOpenRouterConfigured();
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
          const openRouterConfig = {
            provider: "openrouter",
            model: openRouterModel,
          };
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
    console.error(
      `\n❌ Test failed for ${error.provider || "configured provider"}.`,
    );
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
      } else {
        console.error(
          `OpenRouter request failed (Status: ${error.responseStatus || "N/A"}). Check OpenRouter status or your network.`,
        );
      }
    }
    process.exit(1);
  }
}

// --- Ollama Configuration Command ---
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
        message:
          "Enable fallback to OpenRouter if Ollama fails (requires OpenRouter API key)?",
        default: currentFallback,
      },
    ]);
    const finalBaseUrl = answers.baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL;
    const finalModel = answers.model.trim() || DEFAULT_OLLAMA_MODEL;
    const finalFallback = answers.fallback;
    updateGlobalConfig(CONFIG_KEY_USE_OLLAMA, "true");
    updateGlobalConfig(CONFIG_KEY_OLLAMA_BASE_URL, finalBaseUrl);
    updateGlobalConfig(CONFIG_KEY_OLLAMA_MODEL, finalModel);
    updateGlobalConfig(
      CONFIG_KEY_OLLAMA_FALLBACK,
      finalFallback ? "true" : "false",
    );
    console.log(
      `✅ Ollama enabled. Base URL: ${finalBaseUrl}, Model: ${finalModel}, Fallback: ${finalFallback}.`,
    );
    if (finalFallback && !isOpenRouterConfigured()) {
      console.warn(
        `⚠️ Fallback enabled, but OpenRouter API key is not configured. Fallback will not work until an API key is set (via env or 'commiat config').`,
      );
    }
    console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
  } else {
    updateGlobalConfig(CONFIG_KEY_USE_OLLAMA, "false");
    updateGlobalConfig(CONFIG_KEY_OLLAMA_FALLBACK, "false");
    console.log(
      `⚪ Ollama disabled. Commiat will use OpenRouter (if configured).`,
    );
    console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
  }
}

async function selectModel() {
  console.log("Fetching OpenRouter models...");
  try {
    const { data } = await axios.get("https://openrouter.ai/api/v1/models");
    let models = data.data
      .map(m => ({
        name: `${m.name} - ${m.id}`,
        value: m.id
      }))
      .filter(m => m.name && m.value); // ensure valid

    if (models.length === 0) {
      console.log("No models available.");
      return;
    }

    const { selected } = await inquirer.prompt([
      {
        type: "autocomplete",
        name: "selected",
        message: "Search and select a model (type to filter):",
        source: (answers, input) => {
          input = input || "";
          return models
            .filter(m => 
              m.name.toLowerCase().includes(input.toLowerCase()) ||
              m.value.toLowerCase().includes(input.toLowerCase())
            )
            .slice(0, 20); // limit results
        },
        pageSize: 7,
      }
    ]);

    if (selected) {
      updateGlobalConfig(CONFIG_KEY_OPENROUTER_MODEL, selected);
      console.log(`\n✅ Set OpenRouter model to: ${selected}`);
      console.log(`It will be used next time you run 'commiat'. You can also edit ${GLOBAL_CONFIG_PATH} manually.`);
    }
  } catch (error) {
    console.error(`Failed to fetch models or select: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
    }
  }
}

// --- Program Definition ---
program
  .version("1.4.0") // Bump version for lead prompt
  .description(
    "Auto-generate commit messages using AI (OpenRouter or Ollama with optional fallback). Uses staged changes by default.",
  );

program
  .option("-a, --add-all", "Stage all changes (`git add .`) before committing")
  .option("-n, --no-verify", "Bypass git commit hooks")
  .option(
    "--prefix <string>",
    'Prepend a string to the beginning of the generated commit message (e.g., --prefix "[WIP]")',
  )
  .option(
    "--affix <string>",
    'Append a string to the end of the generated commit message (e.g., --affix "(#45789)")',
  )
  .option("--multi", "Enable multi-commit mode: group changes into logical commits using AI")
  .option("--untracked", "Include untracked files in multi-commit grouping (they will be staged per group)")
  .action(mainAction);

program
  .command("config")
  .description(
    "Manage GLOBAL OpenRouter configuration (~/.commiat/config). Opens editor by default.",
  )
  .option(
    "-t, --test",
    "Test the configured LLM API connection and model (OpenRouter OR Ollama w/ fallback)",
  )
  .option(
    "-m, --multi",
    "Set --multi as default mode",
  )
  .action(async (options) => {
    if (options.multi) {
      const { setMultiDefault } = await inquirer.prompt([
        {
          type: "confirm",
          name: "setMultiDefault",
          message: "Set --multi as the default mode for commiat?",
          default: true,
        },
      ]);
      if (setMultiDefault) {
        updateGlobalConfig(CONFIG_KEY_DEFAULT_MULTI, "true");
        console.log(`✅ --multi is now enabled as default.`);
        console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
      } else {
        updateGlobalConfig(CONFIG_KEY_DEFAULT_MULTI, "false");
        console.log(`⚪ --multi is now disabled as default.`);
        console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
      }
    } else if (options.test) {
      await testLlmCompletion();
    } else {
      console.log("Note: This command edits the GLOBAL configuration file.");
      console.log(
        `Use 'commiat ollama' to configure Ollama settings (including fallback).`,
      );
      console.log(
        `For project-specific format, create a ${localConfigManager.LOCAL_CONFIG_FILENAME} file in your project root.`,
      );
      openConfigInEditor();
    }
  });

program
  .command("ollama")
  .description(
    "Configure Ollama settings (enable/disable, base URL, model, fallback) in the GLOBAL config.",
  )
  .action(configureOllama);

program
  .command("model select")
  .description("Select an OpenRouter model using autocomplete search. Recommended: google/gemini-2.5-flash-lite")
  .action(selectModel);

program.parse(process.argv);
