const fs = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".commiat");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config");
const GLOBAL_STATE_PATH = path.join(GLOBAL_CONFIG_DIR, "state");

function ensureGlobalConfigDirExists() {
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }
}

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
    console.error(`Error reading global config file ${GLOBAL_CONFIG_PATH}:`, error);
    return {};
  }
}

function saveGlobalConfig(configObj) {
  if (!configObj || typeof configObj !== "object" || Array.isArray(configObj)) {
    console.error("Invalid config object provided to saveGlobalConfig");
    return;
  }
  ensureGlobalConfigDirExists();
  let fileContent = "";
  for (const key in configObj) {
    if (Object.prototype.hasOwnProperty.call(configObj, key)) {
      const value = configObj[key];
      if (value == null) continue;
      const formattedValue =
        value === true
          ? "true"
          : value === false
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
    console.error(`Error writing global config file ${GLOBAL_CONFIG_PATH}:`, error);
  }
}

function updateGlobalConfig(key, value) {
  if (!key || typeof key !== "string") {
    console.error("Invalid key provided to updateGlobalConfig");
    return;
  }
  const currentConfig = loadGlobalConfig();
  currentConfig[key] = value;
  saveGlobalConfig(currentConfig);
}

function ensureGlobalStateFileExists() {
  ensureGlobalConfigDirExists();
  if (!fs.existsSync(GLOBAL_STATE_PATH)) {
    fs.writeFileSync(GLOBAL_STATE_PATH, "", "utf8");
  }
}

function loadState() {
  ensureGlobalStateFileExists();
  try {
    const fileContent = fs.readFileSync(GLOBAL_STATE_PATH, "utf8");
    return dotenv.parse(fileContent);
  } catch (error) {
    console.error(`Error reading global state file ${GLOBAL_STATE_PATH}:`, error);
    return {};
  }
}

function saveState(stateObj) {
  if (!stateObj || typeof stateObj !== "object" || Array.isArray(stateObj)) {
    console.error("Invalid state object provided to saveState");
    return;
  }
  ensureGlobalConfigDirExists();
  let fileContent = "";
  for (const key in stateObj) {
    if (Object.prototype.hasOwnProperty.call(stateObj, key)) {
      const value = stateObj[key];
      if (value == null) continue;
      fileContent += `${key}=${String(value)}\n`;
    }
  }
  try {
    fs.writeFileSync(GLOBAL_STATE_PATH, fileContent.trim(), "utf8");
  } catch (error) {
    console.error(`Error writing global state file ${GLOBAL_STATE_PATH}:`, error);
  }
}

function updateState(key, value) {
  if (!key || typeof key !== "string") {
    console.error("Invalid key provided to updateState");
    return;
  }
  const currentState = loadState();
  currentState[key] = value;
  saveState(currentState);
}

async function fsLogError(error) {
  try {
    const errorLogPath = path.join(GLOBAL_CONFIG_DIR, "error.log");
    ensureGlobalConfigDirExists();
    const stack = error.stack ? `\n${error.stack}` : "";
    const providerInfo = error.provider ? `\nProvider: ${error.provider}` : "";
    const requestUrlInfo = error.requestUrl ? `\nRequest URL: ${error.requestUrl}` : "";
    const responseStatusInfo = error.responseStatus ? `\nResponse Status: ${error.responseStatus}` : "";
    const responseDataInfo = error.responseData
      ? `\nResponse Data: ${JSON.stringify(error.responseData)}`
      : "";

    const logMessage = `[${new Date().toISOString()}] ${error.message}${providerInfo}${requestUrlInfo}${responseStatusInfo}${responseDataInfo}${stack}\n\n`;
    fs.writeFileSync(errorLogPath, logMessage, { flag: "a" });
  } catch {
    // Log failure must never propagate — it may mask the original error
    // that triggered the log. Silently discard.
  }
}

module.exports = {
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_STATE_PATH,
  ensureGlobalConfigDirExists,
  ensureGlobalConfigFileExists,
  loadGlobalConfig,
  saveGlobalConfig,
  updateGlobalConfig,
  loadState,
  saveState,
  updateState,
  fsLogError,
};
