#!/usr/bin/env node

require('dotenv').config(); // Loads local .env file first
const { program } = require('commander');
const simpleGit = require('simple-git');
const axios = require('axios');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const dotenv = require('dotenv'); // Added for parsing global config

const git = simpleGit();
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-flash-1.5';

// --- Configuration File Logic ---
const CONFIG_DIR = path.join(os.homedir(), '.commiat');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config');

function ensureConfigDirExists() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function ensureConfigFileExists() {
  ensureConfigDirExists();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, '', 'utf8');
    console.log(`Created empty config file at ${CONFIG_PATH}`);
  }
}

// Loads the global config file and parses it into an object
function loadGlobalConfig() {
  ensureConfigFileExists(); // Ensure it exists before reading
  try {
    const fileContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    return dotenv.parse(fileContent); // Use dotenv to parse
  } catch (error) {
    console.error(`Error reading global config file ${CONFIG_PATH}:`, error);
    return {}; // Return empty object on error
  }
}

// Saves the entire config object back to the file in .env format
function saveGlobalConfig(configObj) {
  ensureConfigDirExists();
  let fileContent = '';
  for (const key in configObj) {
    if (Object.hasOwnProperty.call(configObj, key)) {
      // Basic escaping for values that might contain special chars (optional, adjust as needed)
      const value = configObj[key];
      const needsQuotes = /\s|#|"|'|=/.test(value);
      const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
      fileContent += `${key}=${formattedValue}\n`;
    }
  }
  try {
    fs.writeFileSync(CONFIG_PATH, fileContent.trim(), 'utf8');
  } catch (error) {
    console.error(`Error writing global config file ${CONFIG_PATH}:`, error);
  }
}

// Updates a specific key in the global config
function updateGlobalConfig(key, value) {
  const currentConfig = loadGlobalConfig();
  currentConfig[key] = value;
  saveGlobalConfig(currentConfig);
}

async function promptForApiKey() {
  console.log('OpenRouter API key not found.');
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
  // Save using the new method
  updateGlobalConfig('OPENROUTER_API_KEY', trimmedKey);
  console.log(`API Key saved to ${CONFIG_PATH}`);
  return trimmedKey;
}

async function getApiKey() {
  // 1. Check environment variable (from local .env or shell)
  // Prefix local env var check with COMMIAT_
  const envApiKey = process.env.COMMIAT_OPENROUTER_API_KEY;
  if (envApiKey && envApiKey !== 'YOUR_API_KEY_HERE') {
    return envApiKey;
  }

  // 2. Check global config file (remains unprefixed)
  const globalConfig = loadGlobalConfig();
  const configApiKey = globalConfig.COMMIAT_OPENROUTER_API_KEY;
  if (configApiKey) {
    return configApiKey;
  }

  // 3. Prompt user
  return await promptForApiKey();
}

function openConfigInEditor() {
  ensureConfigFileExists();
  const editor = process.env.EDITOR || 'nano';
  console.log(`Opening ${CONFIG_PATH} in ${editor}...`);
  try {
    const child = spawn(editor, [CONFIG_PATH], { stdio: 'inherit', detached: true });
    child.on('error', (err) => {
      console.error(`\n❌ Failed to start editor '${editor}': ${err.message}`);
      console.error(`Please ensure '${editor}' is installed and in your PATH, or set the EDITOR environment variable.`);
      process.exit(1);
    });
    child.on('exit', (code, signal) => {
      if (code === 0) {
        console.log(`\nEditor closed. Config file saved (hopefully 😉).`);
      } else {
        console.warn(`\nEditor exited with code ${code} (signal: ${signal}).`);
      }
    });
  } catch (error) {
    console.error(`\n❌ Error spawning editor: ${error.message}`);
    process.exit(1);
  }
}

async function getStagedDiff() {
  const diff = await git.diff(['--staged']);
  if (!diff) {
    console.log('No staged changes found. Stage files with `git add` first.');
    process.exit(0);
  }
  return diff;
}

async function generateCommitMessage(diff) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Could not obtain OpenRouter API key.');
  }

  // Determine model precedence: local .env (prefixed) > global config > default
  const globalConfig = loadGlobalConfig();
  // Prefix local env var check with COMMIAT_
  const model = process.env.COMMIAT_OPENROUTER_MODEL || globalConfig.COMMIAT_OPENROUTER_MODEL || DEFAULT_MODEL;
  console.log(`Using model: ${model}`); // Log the model being used

  const prompt = `Generate a concise Git commit message based on the following diff. Follow conventional commit format (e.g., feat: ..., fix: ..., chore: ...). Describe the change, not just the files changed.\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;

  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      { model: model, messages: [{ role: 'user', content: prompt }] },
      { headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'Commiat CLI',
        }
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      let message = response.data.choices[0].message.content.trim();
      message = message.replace(/^```(?:diff|git|bash|sh)?\s*/, '').replace(/```\s*$/, '');
      return message.trim();
    } else {
      throw new Error('Failed to generate commit message from API response.');
    }
  } catch (error) {
    if (error.response) {
      console.error('API Error Status:', error.response.status);
      console.error('API Error Data:', error.response.data);
      if (error.response.status === 401) {
        console.error('\n❌ Authentication failed. Your API key might be invalid.');
        // Consider clearing the key if auth fails?
        // updateGlobalConfig('OPENROUTER_API_KEY', '');
        // console.log(`Cleared potentially invalid key from ${CONFIG_PATH}. Please run again.`);
      }
      throw new Error(`OpenRouter API request failed: ${error.response.status} ${error.response.data?.error?.message || ''}`);
    } else if (error.request) {
      throw new Error('No response received from OpenRouter API.');
    } else {
      //console.error('Error setting up OpenRouter API request:', error.message);
      
      
      try{
        const errorLogPath = path.join(CONFIG_DIR, 'error.log');
        ensureConfigDirExists();
        fs.writeFileSync(errorLogPath, `[${new Date().toISOString()}] ${error.message}\n${error.stack}\n\n`, { flag: 'a' });
      }catch(e){
        console.error(`Failed to write error to ${path.join(CONFIG_DIR, 'error.log')}:`, {
          error: e.message,
          errorStack: e.stack,
          originalError: error.message,
          originalErrorStack: error.stack,
          timestamp: new Date().toISOString()
        });
      }

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
    } else {
      return null;
    }
  }
}

async function mainAction(options) {
  console.log('Commiat CLI - Generating commit message...');
  try {
    if (options.addAll) {
      console.log('Staging all changes (`git add .`)...');
      await git.add('.');
      console.log('Changes staged.');
    }

    const diff = await getStagedDiff();
    const initialCommitMessage = await generateCommitMessage(diff);

    const finalCommitMessage = await promptUser(initialCommitMessage);

    if (finalCommitMessage) {
      await git.commit(finalCommitMessage);
      console.log('\n✅ Commit successful!');
    } else {
      console.log('\n❌ Commit cancelled.');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response && error.response.data) {
      console.error('API Error Details:', error.response.data);
    }
    process.exit(1);
  }
}

async function testLlmCompletion() {
  console.log('🧪 Testing LLM completion...');
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error('❌ Could not obtain OpenRouter API key. Configure it first using `commiat` or `commiat config`.');
    process.exit(1);
  }

  // Determine model precedence: local .env (prefixed) > global config > default
  const globalConfig = loadGlobalConfig();
  // Prefix local env var check with COMMIAT_
  const model = process.env.COMMIAT_OPENROUTER_MODEL || globalConfig.COMMIAT_OPENROUTER_MODEL || DEFAULT_MODEL;
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
          'HTTP-Referer': 'http://localhost', // Required by OpenRouter
          'X-Title': 'Commiat CLI Test', // Optional
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
    console.error('\n❌ Test failed: API request error.');
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Data:', error.response.data);
      if (error.response.status === 401) {
        console.error('\nHint: Authentication failed. Check your API key.');
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
  .version('1.0.0')
  .description('Auto-generate commit messages for staged changes');

program
  .option('-a, --add-all', 'Stage all changes (`git add .`) before committing')
  .action(mainAction);

program
  .command('config')
  .description('Manage configuration. Opens editor by default, use --test to check API.')
  .option('-t, --test', 'Test the configured LLM API connection and model')
  .action(async (options) => {
    if (options.test) {
      await testLlmCompletion();
    } else {
      openConfigInEditor();
    }
  });

program.parse(process.argv);