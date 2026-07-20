const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');

const LOCAL_CONFIG_FILENAME = '.commiat';
function getLocalConfigPath() {
  return path.join(process.cwd(), LOCAL_CONFIG_FILENAME);
}

const DEFAULT_FORMAT = '{type}: {msg}'; // A simpler default if none is provided

/**
 * Loads the local .commiat configuration file.
 * If it doesn't exist, prompts the user to create one (unless in non-interactive mode).
 * @param {boolean} nonInteractive - If true, skip all prompts and return null when config is missing.
 * @returns {Promise&lt;object | null&gt;} The loaded config object or null if creation is cancelled or in non-interactive mode.
 */
async function loadConfig(nonInteractive = false) {
  const configPath = getLocalConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      console.log(`Local config file (${LOCAL_CONFIG_FILENAME}) not found.`);

      if (nonInteractive) {
        console.log('Non-interactive mode: using default format.');
        return null;
      }

      let shouldCreate;
      try {
        ({ shouldCreate } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldCreate',
            message: `No ${LOCAL_CONFIG_FILENAME} found. Would you like to create one now?`,
            default: true,
          },
        ]));
      } catch {
        console.warn('\n⚠️ Config creation prompt interrupted. Proceeding without local format.');
        return null;
      }

      if (!shouldCreate) {
        console.log('Proceeding without a local format configuration.');
        return null;
      }

      let format;
      try {
        ({ format } = await inquirer.prompt([
          {
            type: 'input',
            name: 'format',
            message: 'Enter your desired commit message format (Core variables: {type}, {msg}, {gitBranch}. You can add custom variables):',
            default: DEFAULT_FORMAT,
            validate: (input) => (input.trim().length > 0 ? true : 'Format cannot be empty.'),
          },
        ]));
      } catch {
        console.warn('\n⚠️ Format prompt interrupted. Proceeding without local format.');
        return null;
      }
      if (typeof format !== 'string' || format.trim().length === 0) {
        console.warn('Invalid format input. Proceeding without local format.');
        return null;
      }

      const initialConfig = {
        format: format.trim(),
        variables: {},
      };

      try {
        await saveConfig(initialConfig);
        console.log(`✅ Initial configuration saved to ${LOCAL_CONFIG_FILENAME}`);
        return initialConfig;
      } catch (error) {
        console.error(`❌ Failed to save initial config:`, error.message);
        return null;
      }
    }

    const content = fs.readFileSync(configPath, 'utf8');
    if (!content || content.trim().length === 0) {
      console.error(`❌ ${LOCAL_CONFIG_FILENAME} is empty.`);
      return null;
    }
    const config = JSON.parse(content);
    if (!validateConfig(config)) {
      console.error(`❌ Invalid config in ${LOCAL_CONFIG_FILENAME}. Expected { "format": "non-empty string", "variables": {...} }.`);
      return null;
    }
    console.log(`Loaded format from ${LOCAL_CONFIG_FILENAME}`);
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`❌ Invalid JSON in ${LOCAL_CONFIG_FILENAME}:`, error.message);
    } else if (error.code === 'ENOENT') {
      console.error(`❌ Could not read ${LOCAL_CONFIG_FILENAME}:`, error.message);
    } else {
      console.error(`❌ Error reading or parsing ${LOCAL_CONFIG_FILENAME}:`, error.message);
    }
    return null;
  }
}

/**
 * Saves the configuration object to the local .commiat file.
 * @param {object} config - The configuration object to save.
 * @returns {Promise&lt;void&gt;}
 */
async function saveConfig(config) {
  if (!validateConfig(config)) {
    throw new Error(
      `Invalid config object: expected { "format": "non-empty string", "variables": {...} }.`
    );
  }
  const configPath = getLocalConfigPath();
  try {
    const content = JSON.stringify(config, null, 2); // Pretty print JSON
    fs.writeFileSync(configPath, content, 'utf8');
  } catch (error) {
    console.error(`❌ Error writing ${LOCAL_CONFIG_FILENAME}:`, error.message);
    throw error; // Re-throw to indicate failure
  }
}

/**
 * Validates the structure of a configuration object.
 * (Currently basic, can be expanded with schema validation if needed)
 * @param {object} config - The configuration object.
 * @returns {boolean} True if valid, false otherwise.
 */
function validateConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    if (typeof config.format !== 'string' || config.format.trim() === '') return false;
    if (typeof config.variables !== 'object' || config.variables === null || Array.isArray(config.variables)) return false;
    for (const key in config.variables) {
        if (!Object.prototype.hasOwnProperty.call(config.variables, key)) continue;
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
        if (typeof config.variables[key] !== 'string' || config.variables[key].trim() === '') return false;
    }
    return true;
}


module.exports = {
  loadConfig,
  saveConfig,
  validateConfig,
  LOCAL_CONFIG_FILENAME,
  getLocalConfigPath,
};