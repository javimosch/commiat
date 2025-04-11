const inquirer = require('inquirer');
const { getGitBranch } = require('./utils/git');
const { saveConfig } = require('./config'); // To save updated descriptions

const SYSTEM_VARIABLE_HANDLERS = {
  gitBranch: getGitBranch,
  // 'type' is handled implicitly by the LLM prompt based on diff
};

const VARIABLE_REGEX = /\{([a-zA-Z0-9_]+)\}/g; // Matches {variableName}

/**
 * Extracts all variable names (e.g., "type", "context") from a format string.
 * @param {string} format - The format string (e.g., "{type} ({context})").
 * @returns {string[]} An array of unique variable names found.
 */
function detectVariables(format) {
  const matches = format.matchAll(VARIABLE_REGEX);
  const variables = new Set();
  for (const match of matches) {
    variables.add(match[1]); // match[1] is the captured group
  }
  // 'msg' is implicitly handled by the LLM, not treated as a standard variable here
  variables.delete('msg');
  return Array.from(variables);
}

/**
 * Gets the values for system variables (like gitBranch).
 * @returns {Promise&lt;object&gt;} An object mapping system variable names to their values.
 */
async function getSystemVariableValues() {
    const values = {};
    for (const varName in SYSTEM_VARIABLE_HANDLERS) {
        try {
            values[varName] = await SYSTEM_VARIABLE_HANDLERS[varName]();
        } catch (error) {
            console.warn(`⚠️ Could not retrieve value for system variable {${varName}}: ${error.message}`);
            values[varName] = ''; // Provide empty string as fallback
        }
    }
    return values;
}

/**
 * Prompts the user for descriptions of custom variables if they are missing from the config.
 * Updates the config object in place and saves it.
 * @param {string[]} variables - Array of all variable names detected in the format.
 * @param {object} config - The current configuration object (will be mutated).
 * @returns {Promise&lt;boolean&gt;} True if the config was updated, false otherwise.
 */
async function promptForMissingVariableDescriptions(variables, config) {
  let configUpdated = false;
  const customVariables = variables.filter(v => !SYSTEM_VARIABLE_HANDLERS[v] && v !== 'type' && v !== 'msg');

  const questions = [];
  for (const variable of customVariables) {
    if (!config.variables[variable]) {
      questions.push({
        type: 'input',
        name: variable,
        message: `Describe the expected content for the custom variable {${variable}}:`,
        validate: input => input.trim().length > 0 ? true : 'Description cannot be empty.'
      });
    }
  }

  if (questions.length > 0) {
    console.log('\nSome custom variables need descriptions:');
    const answers = await inquirer.prompt(questions);
    for (const variable in answers) {
      config.variables[variable] = answers[variable].trim();
      configUpdated = true;
    }
    if (configUpdated) {
        try {
            await saveConfig(config);
            console.log(`✅ Updated variable descriptions saved to ${config.LOCAL_CONFIG_FILENAME || '.commiat'}`);
        } catch (error) {
            console.error(`❌ Failed to save updated variable descriptions: ${error.message}`);
            // Continue execution, but the descriptions won't be persisted
        }
    }
  }

  return configUpdated;
}

module.exports = {
  detectVariables,
  getSystemVariableValues,
  promptForMissingVariableDescriptions,
  SYSTEM_VARIABLE_HANDLERS, // Exporting for potential checks elsewhere
};