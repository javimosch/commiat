const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');

const LOCAL_CONFIG_FILENAME = '.commiat';
const LOCAL_CONFIG_PATH = path.join(process.cwd(), LOCAL_CONFIG_FILENAME);

const DEFAULT_FORMAT = '{type}: {msg}'; // A simpler default if none is provided

/**
 * Loads the local .commiat configuration file.
 * If it doesn't exist, prompts the user to create one.
 * @returns {Promise&lt;object | null&gt;} The loaded config object or null if creation is cancelled.
 */
async function loadConfig() {
  if (fs.existsSync(LOCAL_CONFIG_PATH)) {
    try {
      const content = fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8');
      const config = JSON.parse(content);
      // Basic validation (can be expanded)
      if (typeof config.format !== 'string' || typeof config.variables !== 'object') {
        console.error(`❌ Invalid format in ${LOCAL_CONFIG_FILENAME}. Expected { "format": "...", "variables": {...} }.`);
        // Optionally: Offer to reset or fix
        return null; // Or throw an error
      }
      console.log(`Loaded format from ${LOCAL_CONFIG_FILENAME}`);
      return config;
    } catch (error) {
      console.error(`❌ Error reading or parsing ${LOCAL_CONFIG_FILENAME}:`, error.message);
      return null; // Indicate error
    }
  } else {
    console.log(`Local config file (${LOCAL_CONFIG_FILENAME}) not found.`);
    const { shouldCreate } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'shouldCreate',
            message: `No ${LOCAL_CONFIG_FILENAME} found. Would you like to create one now?`,
            default: true,
        }
    ]);

    if (!shouldCreate) {
        console.log('Proceeding without a local format configuration.');
        return null; // User chose not to create
    }

    // Prompt for initial format (variables will be handled later)
    const { format } = await inquirer.prompt([
        {
            type: 'input',
            name: 'format',
            message: 'Enter your desired commit message format (Core variables: {type}, {msg}, {gitBranch}. You can add custom variables):',
            default: DEFAULT_FORMAT,
            validate: input => input.trim().length > 0 ? true : 'Format cannot be empty.'
        }
    ]);

    const initialConfig = {
        format: format.trim(),
        variables: {} // Variable descriptions will be prompted for on first use
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
}

/**
 * Saves the configuration object to the local .commiat file.
 * @param {object} config - The configuration object to save.
 * @returns {Promise&lt;void&gt;}
 */
async function saveConfig(config) {
  try {
    const content = JSON.stringify(config, null, 2); // Pretty print JSON
    fs.writeFileSync(LOCAL_CONFIG_PATH, content, 'utf8');
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
    if (!config || typeof config !== 'object') return false;
    if (typeof config.format !== 'string' || config.format.trim() === '') return false;
    if (typeof config.variables !== 'object' || config.variables === null) return false;
    // Could add more checks here, e.g., variable name format
    return true;
}


module.exports = {
  loadConfig,
  saveConfig,
  validateConfig,
  LOCAL_CONFIG_FILENAME,
  LOCAL_CONFIG_PATH,
};