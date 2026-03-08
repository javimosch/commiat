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
  const { apiKey } = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: "Please enter your OpenRouter API key:",
      mask: "*",
      validate: (input) => (input.trim().length > 0 ? true : "API key cannot be empty."),
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
  }
  return null;
}

module.exports = {
  getApiKey,
  isOpenRouterConfigured,
};
