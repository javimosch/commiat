const inquirer = require('inquirer');
const { getGitBranch, getGitBranchNumber } = require('./utils/git');
const { saveConfig, LOCAL_CONFIG_FILENAME } = require('./config');

const SYSTEM_VARIABLE_HANDLERS = {
  gitBranch: getGitBranch,
  gitBranchNumber: getGitBranchNumber,
  // 'type' is handled implicitly by the LLM prompt based on diff,
  // but we need to ensure it's not treated as a custom variable below.
};

const VARIABLE_REGEX = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Extracts all variable names (e.g., "type", "context") from a format string.
 * @param {string} format - The format string (e.g., "{type} ({context})").
 * @returns {string[]} An array of unique variable names found.
 */
function detectVariables(format) {
  const matches = format.matchAll(VARIABLE_REGEX);
  const variables = new Set();
  for (const match of matches) {
    variables.add(match[1]);
  }
  variables.delete('msg'); // 'msg' is always handled implicitly by the LLM
  return Array.from(variables);
}

/**
 * Gets the values for system variables (like gitBranch, gitBranchNumber).
 * @returns {Promise<object>} An object mapping system variable names to their values.
 */
async function getSystemVariableValues() {
  const values = {};
  const promises = Object.entries(SYSTEM_VARIABLE_HANDLERS).map(async ([varName, handler]) => {
    try {
      const value = await handler();
      values[varName] = value;
    } catch (error) {
      console.warn(`⚠️ Could not retrieve value for system variable {${varName}}: ${error.message}`);
      values[varName] = '';
    }
  });
  await Promise.all(promises);
  return values;
}

/**
 * Prompts the user for descriptions of custom variables if they are missing from the config.
 * Updates the config object in place and saves it.
 * @param {string[]} variables - Array of all variable names detected in the format.
 * @param {object} config - The current configuration object (will be mutated).
 * @returns {Promise<boolean>} True if the config was updated, false otherwise.
 */
async function promptForMissingVariableDescriptions(variables, config) {
  let configUpdated = false;
  // Filter out system variables AND 'type' AND 'msg' to find truly custom ones
  const customVariables = variables.filter(v =>
    !SYSTEM_VARIABLE_HANDLERS[v] && v !== 'type' && v !== 'msg'
  );

  const questions = [];
  for (const variable of customVariables) {
    // Check if the variable exists and has a non-empty description in the config
    if (!config.variables[variable] || String(config.variables[variable]).trim() === '') {
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
        console.log(`✅ Updated variable descriptions saved to ${LOCAL_CONFIG_FILENAME}`);
      } catch (error) {
        console.error(`❌ Failed to save updated variable descriptions: ${error.message}`);
      }
    }
  }

  return configUpdated;
}

module.exports = {
  detectVariables,
  getSystemVariableValues,
  promptForMissingVariableDescriptions,
  SYSTEM_VARIABLE_HANDLERS,
};