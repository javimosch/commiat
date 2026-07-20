const inquirer = require("inquirer");

const {
  CONFIG_KEY_API_KEY,
} = require("./constants");

const {
  loadGlobalConfig,
  updateGlobalConfig,
  GLOBAL_CONFIG_PATH,
} = require("./globalStore");

async function promptForApiKey() {
  console.log("OpenRouter API key not found in environment or global config.");
  let apiKey;
  try {
    ({ apiKey } = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: "Please enter your OpenRouter API key:",
        mask: "*",
        validate: (input) =>
          typeof input === "string" && input.trim().length > 0
            ? true
            : "API key cannot be empty.",
      },
    ]));
  } catch (error) {
    console.error("\n⚠️ API key prompt interrupted or failed.");
    return null;
  }
  if (typeof apiKey !== "string") {
    console.error("Invalid API key input received.");
    return null;
  }
  const trimmedKey = apiKey.trim();
  if (trimmedKey.length === 0) {
    console.error("API key cannot be empty.");
    return null;
  }
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

async function getApiKey(promptIfNeeded = true, nonInteractive = false) {
  const envApiKey = process.env[CONFIG_KEY_API_KEY];
  if (envApiKey && envApiKey !== "YOUR_API_KEY_HERE") {
    const trimmed = envApiKey.trim();
    if (trimmed.length > 0) return trimmed;
  }

  const globalConfig = loadGlobalConfig();
  const configApiKey = globalConfig[CONFIG_KEY_API_KEY];
  if (configApiKey != null && typeof configApiKey !== "string") {
    console.warn("⚠️ Ignoring invalid API key in global config (expected a string).");
  } else if (typeof configApiKey === "string") {
    const trimmed = configApiKey.trim();
    if (trimmed.length > 0) return trimmed;
  }

  if (promptIfNeeded && !nonInteractive && process.stdout.isTTY) {
    return await promptForApiKey();
  }
  return null;
}

module.exports = {
  getApiKey,
  isOpenRouterConfigured,
};
