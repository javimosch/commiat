#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');
const simpleGit = require('simple-git');
const axios = require('axios');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const localConfigManager = require('./config');
const variableProcessor = require('./variables');

const git = simpleGit();
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-flash-1.5';
const DEFAULT_CONVENTIONAL_FORMAT = '{type}: {msg}';
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.commiat');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'config');

function ensureGlobalConfigDirExists() {
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }
}

function ensureGlobalConfigFileExists() {
  ensureGlobalConfigDirExists();
  if (!fs.existsSync(GLOBAL_CONFIG_PATH)) {
    fs.writeFileSync(GLOBAL_CONFIG_PATH, '', 'utf8');
    console.log(`Created empty global config file at ${GLOBAL_CONFIG_PATH}`);
  }
}

function loadGlobalConfig() {
  ensureGlobalConfigFileExists();
  try {
    const fileContent = fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf8');
    return dotenv.parse(fileContent);
  } catch (error) {
    console.error(`Error reading global config file ${GLOBAL_CONFIG_PATH}:`, error);
    return {};
  }
}

function saveGlobalConfig(configObj) {
  ensureGlobalConfigDirExists();
  let fileContent = '';
  for (const key in configObj) {
    if (Object.hasOwnProperty.call(configObj, key)) {
      const value = configObj[key];
      const needsQuotes = /\s|#|"|'|=/.test(value);
      const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
      fileContent += `${key}=${formattedValue}\n`;
    }
  }
  try {
    fs.writeFileSync(GLOBAL_CONFIG_PATH, fileContent.trim(), 'utf8');
  } catch (error) {
    console.error(`Error writing global config file ${GLOBAL_CONFIG_PATH}:`, error);
  }
}

function updateGlobalConfig(key, value) {
  const currentConfig = loadGlobalConfig();
  currentConfig[key] = value;
  saveGlobalConfig(currentConfig);
}

async function promptForApiKey() {
  console.log('OpenRouter API key not found in environment or global config.');
  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Please enter your OpenRouter API key:',
      mask: '*',
      validate: (input) => input.trim().length > 0 ? true : 'API key cannot be empty.',
    },
  ]);
  const trimmedKey = apiKey.trim();
  updateGlobalConfig('COMMIAT_OPENROUTER_API_KEY', trimmedKey);
  console.log(`API Key saved to ${GLOBAL_CONFIG_PATH}`);
  return trimmedKey;
}

async function getApiKey() {
  const envApiKey = process.env.COMMIAT_OPENROUTER_API_KEY;
  if (envApiKey && envApiKey !== 'YOUR_API_KEY_HERE') {
    return envApiKey;
  }

  const globalConfig = loadGlobalConfig();
  const configApiKey = globalConfig.COMMIAT_OPENROUTER_API_KEY;
  if (configApiKey) {
    return configApiKey;
  }

  return await promptForApiKey();
}

function openConfigInEditor() {
  ensureGlobalConfigFileExists();
  const editor = process.env.EDITOR || 'nano';
  console.log(`Opening global config ${GLOBAL_CONFIG_PATH} in ${editor}...`);
  try {
    const child = spawn(editor, [GLOBAL_CONFIG_PATH], { stdio: 'inherit', detached: true });
    child.on('error', (err) => {
      console.error(`\n❌ Failed to start editor '${editor}': ${err.message}`);
      console.error(`Please ensure '${editor}' is installed and in your PATH, or set the EDITOR environment variable.`);
      process.exit(1);
    });
    child.on('exit', (code, signal) => {
      if (code === 0) {
        console.log(`\nEditor closed. Global config file saved (hopefully 😉).`);
      } else {
        console.warn(`\nEditor exited with code ${code} (signal: ${signal}).`);
      }
    });
  } catch (error) {
    console.error(`\n❌ Error spawning editor: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Checks for staged files and exits if none are found.
 * Used after potential staging steps.
 */
async function ensureStagedFiles() {
    const diffSummary = await git.diffSummary(['--staged']);
    if (diffSummary.files.length === 0) {
        console.log('No staged changes found to commit.');
        process.exit(0);
    }
    // Return the detailed diff for message generation
    return await git.diff(['--staged']);
}

async function fsLogError(error) {
  const errorLogPath = path.join(GLOBAL_CONFIG_DIR, 'error.log');
  ensureGlobalConfigDirExists();
  // Ensure error.stack is included if available
  const stack = error.stack ? `\n${error.stack}` : '';
  fs.writeFileSync(errorLogPath, `[${new Date().toISOString()}] ${error.message}${stack}\n\n`, { flag: 'a' });
}

async function generateCommitMessage(diff, localConfig, systemVarValues) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Could not obtain OpenRouter API key.');
  }

  const globalConfigData = loadGlobalConfig();
  const model = process.env.COMMIAT_OPENROUTER_MODEL || globalConfigData.COMMIAT_OPENROUTER_MODEL || DEFAULT_MODEL;
  console.log(`Using model: ${model}`);

  let prompt = `Generate a Git commit message based on the following diff.\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;

  const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
  prompt += `The desired commit message format is: "${format}"\n`;

  if (localConfig && Object.keys(localConfig.variables).length > 0) {
    prompt += "Variable descriptions (use these to fill the format placeholders):\n";
    for (const variable in localConfig.variables) {
      // Only include descriptions for variables actually present in the format
      if (format.includes(`{${variable}}`)) {
          prompt += `- {${variable}}: ${localConfig.variables[variable]}\n`;
      }
    }
  }

  const variablesInFormat = variableProcessor.detectVariables(format);
  const relevantSystemVars = {};
  variablesInFormat.forEach(v => {
    if (systemVarValues[v] !== undefined) {
      relevantSystemVars[v] = systemVarValues[v];
    }
  });

  if (Object.keys(relevantSystemVars).length > 0) {
    prompt += "System variable values (use these directly):\n";
    for (const variable in relevantSystemVars) {
      prompt += `- {${variable}}: ${relevantSystemVars[variable] || 'N/A'}\n`;
    }
  }

  prompt += "\nGenerate ONLY the commit message string, adhering strictly to the specified format and variable descriptions.";

  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      { model: model, messages: [{ role: 'user', content: prompt }] },
      { headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost', // Required by some models
          'X-Title': 'Commiat CLI', // Optional
        }
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      let message = response.data.choices[0].message.content.trim();
      message = message.replace(/^```(?:git|commit|text)?\s*/, '').replace(/```\s*$/, '');
      message = message.replace(/^["']|["']$/g, '');
      return message.trim();
    } else {
      const errorData = {
        message: 'Failed to generate commit message from API response.',
        stack: { response: response.data } // Use stack for context object
      };
      await fsLogError(errorData);
      throw new Error(errorData.message);
    }
  } catch (error) {
    // Ensure the error object passed to fsLogError has a message
    const logError = new Error(error.message || 'Unknown API error');
    logError.stack = error.stack; // Preserve original stack if available
    logError.responseStatus = error.response?.status;
    logError.responseData = error.response?.data;
    await fsLogError(logError);

    if (error.response) {
      console.error('API Error Status:', error.response.status);
      console.error('API Error Data:', error.response.data);
      if (error.response.status === 401) {
        console.error('\n❌ Authentication failed. Your API key might be invalid or expired.');
      }
      throw new Error(`OpenRouter API request failed: ${error.response.status} ${error.response.data?.error?.message || JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error('No response received from OpenRouter API. Check network connection or OpenRouter status.');
    } else {
      throw new Error(`Error setting up OpenRouter API request: ${error.message}`);
    }
  }
}

async function promptUser(initialMessage) {
  let currentMessage = initialMessage;
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `Suggested Commit Message:\n"${currentMessage}"\n\nWhat would you like to do?`,
        choices: [
          { name: '✅ Confirm and Commit', value: 'confirm' },
          { name: '📝 Adjust Message', value: 'adjust' },
          { name: '❌ Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'confirm') {
      return currentMessage;
    } else if (action === 'adjust') {
      const { adjustedMessage } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'adjustedMessage',
          message: 'Adjust the commit message:',
          default: currentMessage,
          validate: (input) => input.trim().length > 0 ? true : 'Commit message cannot be empty.',
        },
      ]);
      currentMessage = adjustedMessage.trim();
    } else { // cancel
      return null;
    }
  }
}

async function mainAction(options) {
  console.log('Commiat CLI - Generating commit message...');
  try {
    // 1. Load Local Config
    let localConfig = await localConfigManager.loadConfig();
    const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
    if (!localConfig) {
      console.log(`Using default format: "${format}"`);
    }

    // 2. Handle Staging
    if (options.addAll) {
      console.log('Staging all changes (`git add .`)...');
      await git.add('.');
      console.log('Changes staged.');
    } else {
      // Check if files are already staged if -a wasn't used
      const stagedSummary = await git.diffSummary(['--staged']);
      if (stagedSummary.files.length === 0) {
        // No files staged and -a not used, prompt the user
        const { shouldStageAll } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldStageAll',
            message: 'No changes staged. Stage all changes now? (git add .)',
            default: true,
          }
        ]);
        if (shouldStageAll) {
          console.log('Staging all changes (`git add .`)...');
          await git.add('.');
          console.log('Changes staged.');
        } else {
          console.log('No changes staged. Aborting.');
          process.exit(0);
        }
      } else {
          console.log(`${stagedSummary.files.length} file(s) already staged.`);
      }
    }

    // 3. Ensure Staged Files Exist and Get Diff
    const diff = await ensureStagedFiles(); // Exits if still no staged files

    // 4. Detect Variables and Prompt for Descriptions (if needed)
    const variablesInFormat = variableProcessor.detectVariables(format);
    if (localConfig && variablesInFormat.length > 0) {
      const configWasUpdated = await variableProcessor.promptForMissingVariableDescriptions(variablesInFormat, localConfig);
      if (configWasUpdated) {
          localConfig = await localConfigManager.loadConfig();
          if (!localConfig) {
              throw new Error(`Failed to reload ${localConfigManager.LOCAL_CONFIG_FILENAME} after updating variable descriptions.`);
          }
      }
    }

    // 5. Get System Variable Values
    const systemVarValues = await variableProcessor.getSystemVariableValues();

    // 6. Generate Initial Commit Message
    const initialCommitMessage = await generateCommitMessage(diff, localConfig, systemVarValues);

    // 7. Prompt User for Confirmation/Adjustment
    const finalCommitMessage = await promptUser(initialCommitMessage);

    // 8. Commit or Cancel
    if (finalCommitMessage) {
      // Prepare commit options
      const commitOptions = {};
      // Check if the --no-verify flag was passed (commander sets options.verify to false)
      if (options.verify === false) {
        commitOptions['--no-verify'] = null; // Add the flag if requested
        console.log('Committing with --no-verify flag...');
      } else {
        console.log('Committing...');
      }

      // Removed DEBUG log for commit options

      await git.commit(finalCommitMessage, undefined, commitOptions); // Pass options here
      console.log('\n✅ Commit successful!');
    } else {
      console.log('\n❌ Commit cancelled.');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await fsLogError(error);
    process.exit(1);
  }
}

async function testLlmCompletion() {
  console.log('🧪 Testing LLM completion (using global config)...');
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error('❌ Could not obtain OpenRouter API key. Configure it first using `commiat config`.');
    process.exit(1);
  }

  const globalConfigData = loadGlobalConfig();
  const model = process.env.COMMIAT_OPENROUTER_MODEL || globalConfigData.COMMIAT_OPENROUTER_MODEL || DEFAULT_MODEL;
  const testPrompt = "Say HI";

  console.log(`\nInput:`);
  console.log(`- Prompt: "${testPrompt}"`);
  console.log(`- Model: ${model}`);

  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      { model: model, messages: [{ role: 'user', content: testPrompt }] },
      { headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'Commiat CLI Test',
        }
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const output = response.data.choices[0].message.content.trim();
      console.log(`\nOutput:`);
      console.log(`- Response: "${output}"`);
      console.log('\n✅ Test successful!');
    } else {
      console.error('\n❌ Test failed: No valid response received from API.');
      console.error('API Response Data:', response.data);
      process.exit(1);
    }
  } catch (error) {
    // Ensure the error object passed to fsLogError has a message
    const logError = new Error(error.message || 'Unknown API error during test');
    logError.stack = error.stack; // Preserve original stack if available
    logError.responseStatus = error.response?.status;
    logError.responseData = error.response?.data;
    await fsLogError(logError);

    console.error('\n❌ Test failed: API request error.');
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', error.response.data);
      if (error.response.status === 401) {
        console.error('\nHint: Authentication failed. Check your API key in global config or environment variables.');
      }
    } else if (error.request) {
      console.error('- Error: No response received from API.');
    } else {
      console.error('- Error:', error.message);
    }
    process.exit(1);
  }
}

program
  .version('1.1.0')
  .description('Auto-generate commit messages for staged changes, optionally using a custom format defined in .commiat');

program
  .option('-a, --add-all', 'Stage all changes (`git add .`) before committing')
  .option('-n, --no-verify', 'Bypass git commit hooks') // Commander handles --no- prefix, creates options.verify = false
  .action(mainAction);

program
  .command('config')
  .description('Manage GLOBAL configuration (~/.commiat/config). Opens editor by default.')
  .option('-t, --test', 'Test the configured LLM API connection and model (using global config)')
  .action(async (options) => {
    if (options.test) {
      await testLlmCompletion();
    } else {
      console.log('Note: This command edits the GLOBAL configuration file.');
      console.log(`For project-specific format, create a ${localConfigManager.LOCAL_CONFIG_FILENAME} file in your project root.`);
      openConfigInEditor();
    }
  });

program.parse(process.argv);