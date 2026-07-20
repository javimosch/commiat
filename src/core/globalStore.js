const fs = require("fs");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");

/**
 * Return the global config directory, respecting the GLOBAL_CONFIG_DIR env var
 * so tests can isolate filesystem access.
 */
function getGlobalConfigDir() {
  return process.env.GLOBAL_CONFIG_DIR || path.join(os.homedir(), ".commiat");
}

function getGlobalConfigPath() {
  return path.join(getGlobalConfigDir(), "config");
}

function getGlobalStatePath() {
  return path.join(getGlobalConfigDir(), "state");
}

function ensureGlobalConfigDirExists() {
  const dir = getGlobalConfigDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    const msg = error?.message ?? String(error);
    throw new Error(`Failed to create global config directory "${dir}": ${msg}`);
  }
}

function ensureGlobalConfigFileExists() {
  const cfgPath = getGlobalConfigPath();
  ensureGlobalConfigDirExists();
  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(cfgPath, "", "utf8");
    console.log(`Created empty global config file at ${cfgPath}`);
  }
}

function loadGlobalConfig() {
  ensureGlobalConfigFileExists();
  const cfgPath = getGlobalConfigPath();
  try {
    const fileContent = fs.readFileSync(cfgPath, "utf8");
    return dotenv.parse(fileContent);
  } catch (error) {
    console.error(`Error reading global config file ${cfgPath}:`, error);
    return {};
  }
}

function saveGlobalConfig(configObj) {
  if (!configObj || typeof configObj !== "object" || Array.isArray(configObj)) {
    throw new Error("Invalid config object provided to saveGlobalConfig");
  }
  const cfgPath = getGlobalConfigPath();
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
    fs.writeFileSync(cfgPath, fileContent.trim(), "utf8");
  } catch (error) {
    const msg = error?.message ?? String(error);
    throw new Error(`Error writing global config file ${cfgPath}: ${msg}`);
  }
}

function updateGlobalConfig(key, value) {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    throw new Error("Invalid key provided to updateGlobalConfig");
  }
  const currentConfig = loadGlobalConfig();
  currentConfig[key] = value;
  saveGlobalConfig(currentConfig);
}

function ensureGlobalStateFileExists() {
  const statePath = getGlobalStatePath();
  ensureGlobalConfigDirExists();
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, "", "utf8");
  }
}

function loadState() {
  ensureGlobalStateFileExists();
  const statePath = getGlobalStatePath();
  try {
    const fileContent = fs.readFileSync(statePath, "utf8");
    return dotenv.parse(fileContent);
  } catch (error) {
    console.error(`Error reading global state file ${statePath}:`, error);
    return {};
  }
}

function saveState(stateObj) {
  if (!stateObj || typeof stateObj !== "object" || Array.isArray(stateObj)) {
    throw new Error("Invalid state object provided to saveState");
  }
  const statePath = getGlobalStatePath();
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
    fs.writeFileSync(statePath, fileContent.trim(), "utf8");
  } catch (error) {
    const msg = error?.message ?? String(error);
    throw new Error(`Error writing global state file ${statePath}: ${msg}`);
  }
}

function updateState(key, value) {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    throw new Error("Invalid key provided to updateState");
  }
  const currentState = loadState();
  currentState[key] = value;
  saveState(currentState);
}

async function fsLogError(error) {
  try {
    const errorLogPath = path.join(getGlobalConfigDir(), "error.log");
    ensureGlobalConfigDirExists();
    const normalized =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : String(error ?? "Unknown error"));
    const stack = normalized.stack ? `\n${normalized.stack}` : "";
    const providerInfo = normalized.provider ? `\nProvider: ${normalized.provider}` : "";
    const requestUrlInfo = normalized.requestUrl ? `\nRequest URL: ${normalized.requestUrl}` : "";
    const responseStatusInfo = normalized.responseStatus
      ? `\nResponse Status: ${normalized.responseStatus}`
      : "";
    const responseDataInfo = normalized.responseData
      ? `\nResponse Data: ${JSON.stringify(normalized.responseData)}`
      : "";

    const logMessage = `[${new Date().toISOString()}] ${normalized.message}${providerInfo}${requestUrlInfo}${responseStatusInfo}${responseDataInfo}${stack}\n\n`;
    fs.writeFileSync(errorLogPath, logMessage, { flag: "a" });
  } catch {
    // Log failure must never propagate — it may mask the original error
    // that triggered the log. Silently discard.
  }
}

// Backward-compatible lazy getter properties so existing consumers that
// destructure at module-load time get a snapshot of the real path in
// production, while functions called later respect GLOBAL_CONFIG_DIR.
const GLOBAL_CONFIG_DIR = process.env.GLOBAL_CONFIG_DIR || path.join(os.homedir(), ".commiat");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config");
const GLOBAL_STATE_PATH = path.join(GLOBAL_CONFIG_DIR, "state");

module.exports = {
  getGlobalConfigDir,
  getGlobalConfigPath,
  getGlobalStatePath,
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
