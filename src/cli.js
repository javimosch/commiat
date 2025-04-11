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

// --- Constants ---
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'google/gemini-flash-1.5';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3'; // A common default Ollama model
const DEFAULT_CONVENTIONAL_FORMAT = '{type}: {msg}';
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.commiat');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'config');

// --- Config Keys ---
const CONFIG_KEY_API_KEY = 'COMMIAT_OPENROUTER_API_KEY';
const CONFIG_KEY_OPENROUTER_MODEL = 'COMMIAT_OPENROUTER_MODEL';
const CONFIG_KEY_USE_OLLAMA = 'COMMIAT_USE_OLLAMA';
const CONFIG_KEY_OLLAMA_BASE_URL = 'COMMIAT_OLLAMA_BASE_URL';
const CONFIG_KEY_OLLAMA_MODEL = 'COMMIAT_OLLAMA_MODEL';

// --- Global Config Functions ---
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
      // Handle boolean true explicitly, otherwise treat as string
      const formattedValue = typeof value === 'boolean' && value === true
        ? 'true'
        : typeof value === 'boolean' && value === false
        ? 'false'
        : /\s|#|"|'|=/.test(value) // Check if string value needs quotes
        ? `"${value.replace(/"/g, '\\"')}"`
        : value;
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

// --- API Key / Provider Specific Config ---

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
  updateGlobalConfig(CONFIG_KEY_API_KEY, trimmedKey);
  console.log(`API Key saved to ${GLOBAL_CONFIG_PATH}`);
  return trimmedKey;
}

async function getApiKey() { // Only needed for OpenRouter
  const envApiKey = process.env[CONFIG_KEY_API_KEY];
  if (envApiKey && envApiKey !== 'YOUR_API_KEY_HERE') {
    return envApiKey;
  }

  const globalConfig = loadGlobalConfig();
  const configApiKey = globalConfig[CONFIG_KEY_API_KEY];
  if (configApiKey) {
    return configApiKey;
  }

  return await promptForApiKey();
}

function getLlmProviderConfig() {
    const envUseOllama = process.env[CONFIG_KEY_USE_OLLAMA];
    const globalConfig = loadGlobalConfig();
    const configUseOllama = globalConfig[CONFIG_KEY_USE_OLLAMA];

    // Env var takes precedence, then global config. Default to false (use OpenRouter).
    const useOllama = envUseOllama === '1' || envUseOllama === 'true' || (!envUseOllama && configUseOllama === 'true');

    if (useOllama) {
        const baseUrl = process.env[CONFIG_KEY_OLLAMA_BASE_URL] || globalConfig[CONFIG_KEY_OLLAMA_BASE_URL] || DEFAULT_OLLAMA_BASE_URL;
        const model = process.env[CONFIG_KEY_OLLAMA_MODEL] || globalConfig[CONFIG_KEY_OLLAMA_MODEL] || DEFAULT_OLLAMA_MODEL;
        return { provider: 'ollama', baseUrl, model };
    } else {
        const model = process.env[CONFIG_KEY_OPENROUTER_MODEL] || globalConfig[CONFIG_KEY_OPENROUTER_MODEL] || DEFAULT_OPENROUTER_MODEL;
        // API key will be fetched separately if needed by generateCommitMessage/testLlmCompletion
        return { provider: 'openrouter', model };
    }
}

// --- Editor Function ---
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

// --- Git Functions ---
async function ensureStagedFiles() {
    const diffSummary = await git.diffSummary(['--staged']);
    if (diffSummary.files.length === 0) {
        console.log('No staged changes found to commit.');
        process.exit(0);
    }
    return await git.diff(['--staged']);
}

// --- Error Logging ---
async function fsLogError(error) {
  const errorLogPath = path.join(GLOBAL_CONFIG_DIR, 'error.log');
  ensureGlobalConfigDirExists();
  const stack = error.stack ? `\n${error.stack}` : '';
  fs.writeFileSync(errorLogPath, `[${new Date().toISOString()}] ${error.message}${stack}\n\n`, { flag: 'a' });
}

// --- Commit Message Generation ---
async function generateCommitMessage(diff, localConfig, systemVarValues) {
    const llmConfig = getLlmProviderConfig();
    console.log(`Using provider: ${llmConfig.provider}, Model: ${llmConfig.model}`);

    let prompt = `Generate a Git commit message based on the following diff.\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;
    const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
    prompt += `The desired commit message format is: "${format}"\n`;

    if (localConfig && Object.keys(localConfig.variables).length > 0) {
        prompt += "Variable descriptions (use these to fill the format placeholders):\n";
        for (const variable in localConfig.variables) {
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
        let response;
        if (llmConfig.provider === 'ollama') {
            const ollamaUrl = `${llmConfig.baseUrl}/api/chat`;
            console.log(`Sending request to Ollama: ${ollamaUrl}`);
            response = await axios.post(
                ollamaUrl,
                {
                    model: llmConfig.model,
                    messages: [{ role: 'user', content: prompt }],
                    stream: false // Ensure we get the full response
                },
                { headers: { 'Content-Type': 'application/json' } }
            );
            // Ollama response structure
            if (response.data && response.data.message && response.data.message.content) {
                let message = response.data.message.content.trim();
                message = message.replace(/^```(?:git|commit|text)?\s*/, '').replace(/```\s*$/, '');
                message = message.replace(/^["']|["']$/g, '');
                return message.trim();
            } else {
                throw new Error('Invalid Ollama API response structure.');
            }

        } else { // Default to OpenRouter
            const apiKey = await getApiKey(); // Get API key only if needed
            if (!apiKey) {
                throw new Error('Could not obtain OpenRouter API key.');
            }
            console.log(`Sending request to OpenRouter: ${OPENROUTER_API_URL}`);
            response = await axios.post(
                OPENROUTER_API_URL,
                { model: llmConfig.model, messages: [{ role: 'user', content: prompt }] },
                { headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost',
                    'X-Title': 'Commiat CLI',
                  }
                }
            );
            // OpenRouter response structure
            if (response.data && response.data.choices && response.data.choices.length > 0) {
                let message = response.data.choices[0].message.content.trim();
                message = message.replace(/^```(?:git|commit|text)?\s*/, '').replace(/```\s*$/, '');
                message = message.replace(/^["']|["']$/g, '');
                return message.trim();
            } else {
                throw new Error('Invalid OpenRouter API response structure.');
            }
        }

    } catch (error) {
        const logError = new Error(error.message || `Unknown API error for ${llmConfig.provider}`);
        logError.stack = error.stack;
        logError.provider = llmConfig.provider;
        logError.requestUrl = llmConfig.provider === 'ollama' ? `${llmConfig.baseUrl}/api/chat` : OPENROUTER_API_URL;
        logError.responseStatus = error.response?.status;
        logError.responseData = error.response?.data;
        await fsLogError(logError);

        if (error.response) {
            console.error(`API Error (${llmConfig.provider}) Status:`, error.response.status);
            console.error(`API Error (${llmConfig.provider}) Data:`, error.response.data);
            if (llmConfig.provider === 'openrouter' && error.response.status === 401) {
                console.error('\n❌ OpenRouter authentication failed. Your API key might be invalid or expired.');
            } else if (llmConfig.provider === 'ollama') {
                 console.error(`\n❌ Ollama request failed. Ensure Ollama is running at ${llmConfig.baseUrl} and the model '${llmConfig.model}' is available.`);
            }
            throw new Error(`${llmConfig.provider} API request failed: ${error.response.status} ${error.response.data?.error?.message || JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            throw new Error(`No response received from ${llmConfig.provider} API. Check network connection or ${llmConfig.provider} status.`);
        } else {
            throw new Error(`Error setting up ${llmConfig.provider} API request: ${error.message}`);
        }
    }
}

// --- User Interaction ---
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

// --- Main Action ---
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
      const stagedSummary = await git.diffSummary(['--staged']);
      if (stagedSummary.files.length === 0) {
        const { shouldStageAll } = await inquirer.prompt([
          { type: 'confirm', name: 'shouldStageAll', message: 'No changes staged. Stage all changes now? (git add .)', default: true }
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
    const diff = await ensureStagedFiles();

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
      const commitOptions = {};
      if (options.verify === false) { // Correct check for --no-verify
        commitOptions['--no-verify'] = null;
        console.log('Committing with --no-verify flag...');
      } else {
        console.log('Committing...');
      }
      await git.commit(finalCommitMessage, undefined, commitOptions);
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

// --- Test LLM Completion ---
async function testLlmCompletion() {
    console.log('🧪 Testing LLM completion...');
    const llmConfig = getLlmProviderConfig();
    const testPrompt = "Say HI";

    console.log(`\nUsing provider: ${llmConfig.provider}`);
    console.log(`Input:`);
    console.log(`- Prompt: "${testPrompt}"`);
    console.log(`- Model: ${llmConfig.model}`);
    if (llmConfig.provider === 'ollama') {
        console.log(`- Base URL: ${llmConfig.baseUrl}`);
    }

    try {
        let response;
        if (llmConfig.provider === 'ollama') {
            const ollamaUrl = `${llmConfig.baseUrl}/api/chat`;
            response = await axios.post(
                ollamaUrl,
                { model: llmConfig.model, messages: [{ role: 'user', content: testPrompt }], stream: false },
                { headers: { 'Content-Type': 'application/json' } }
            );
            if (response.data && response.data.message && response.data.message.content) {
                const output = response.data.message.content.trim();
                console.log(`\nOutput:`);
                console.log(`- Response: "${output}"`);
                console.log('\n✅ Ollama test successful!');
            } else {
                throw new Error('Invalid Ollama API response structure during test.');
            }
        } else { // OpenRouter
            const apiKey = await getApiKey();
            if (!apiKey) {
                console.error('❌ Could not obtain OpenRouter API key. Configure it first using `commiat config`.');
                process.exit(1);
            }
            response = await axios.post(
                OPENROUTER_API_URL,
                { model: llmConfig.model, messages: [{ role: 'user', content: testPrompt }] },
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
                console.log('\n✅ OpenRouter test successful!');
            } else {
                throw new Error('Invalid OpenRouter API response structure during test.');
            }
        }
    } catch (error) {
        const logError = new Error(error.message || `Unknown API error during ${llmConfig.provider} test`);
        logError.stack = error.stack;
        logError.provider = llmConfig.provider;
        logError.responseStatus = error.response?.status;
        logError.responseData = error.response?.data;
        await fsLogError(logError);

        console.error(`\n❌ Test failed: API request error for ${llmConfig.provider}.`);
        if (error.response) {
            console.error('- Status:', error.response.status);
            console.error('- Data:', error.response.data);
            if (llmConfig.provider === 'openrouter' && error.response.status === 401) {
                console.error('\nHint: OpenRouter authentication failed. Check your API key.');
            } else if (llmConfig.provider === 'ollama') {
                console.error(`\nHint: Ensure Ollama is running at ${llmConfig.baseUrl} and the model '${llmConfig.model}' is available.`);
            }
        } else if (error.request) {
            console.error(`- Error: No response received from ${llmConfig.provider} API.`);
        } else {
            console.error('- Error:', error.message);
        }
        process.exit(1);
    }
}

// --- Ollama Configuration Command ---
async function configureOllama() {
    const currentConfig = loadGlobalConfig();
    const currentUseOllama = currentConfig[CONFIG_KEY_USE_OLLAMA] === 'true';
    const currentBaseUrl = currentConfig[CONFIG_KEY_OLLAMA_BASE_URL] || DEFAULT_OLLAMA_BASE_URL;
    const currentModel = currentConfig[CONFIG_KEY_OLLAMA_MODEL] || DEFAULT_OLLAMA_MODEL;

    console.log(`\n--- Ollama Configuration ---`);
    console.log(`Current setting: ${currentUseOllama ? `Enabled (URL: ${currentBaseUrl}, Model: ${currentModel})` : 'Disabled'}`);

    const { useOllama } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'useOllama',
            message: 'Enable Ollama for commit message generation?',
            default: currentUseOllama,
        }
    ]);

    if (useOllama) {
        const { baseUrl } = await inquirer.prompt([
            {
                type: 'input',
                name: 'baseUrl',
                message: `Enter Ollama base URL (leave blank for default: ${DEFAULT_OLLAMA_BASE_URL}):`,
                default: currentBaseUrl,
            }
        ]);
        const finalBaseUrl = baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL;

        const { model } = await inquirer.prompt([
             {
                type: 'input',
                name: 'model',
                message: `Enter Ollama model name (leave blank for default: ${DEFAULT_OLLAMA_MODEL}):`,
                default: currentModel,
            }
        ]);
        const finalModel = model.trim() || DEFAULT_OLLAMA_MODEL;


        updateGlobalConfig(CONFIG_KEY_USE_OLLAMA, 'true');
        updateGlobalConfig(CONFIG_KEY_OLLAMA_BASE_URL, finalBaseUrl);
        updateGlobalConfig(CONFIG_KEY_OLLAMA_MODEL, finalModel);
        console.log(`✅ Ollama enabled. Base URL set to ${finalBaseUrl}, Model set to ${finalModel}.`);
        console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
    } else {
        updateGlobalConfig(CONFIG_KEY_USE_OLLAMA, 'false'); // Explicitly set to false
        // Optionally remove URL/Model or leave them
        // updateGlobalConfig(CONFIG_KEY_OLLAMA_BASE_URL, '');
        // updateGlobalConfig(CONFIG_KEY_OLLAMA_MODEL, '');
        console.log(`⚪ Ollama disabled. Commiat will use OpenRouter (if configured).`);
        console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
    }
}

// --- Program Definition ---
program
  .version('1.2.0') // Bump version for Ollama support
  .description('Auto-generate commit messages using AI (OpenRouter or Ollama). Uses staged changes by default.');

program
  .option('-a, --add-all', 'Stage all changes (`git add .`) before committing')
  .option('-n, --no-verify', 'Bypass git commit hooks')
  .action(mainAction);

program
  .command('config')
  .description('Manage GLOBAL OpenRouter configuration (~/.commiat/config). Opens editor by default.')
  .option('-t, --test', 'Test the configured LLM API connection and model (OpenRouter OR Ollama)')
  .action(async (options) => {
    if (options.test) {
      await testLlmCompletion();
    } else {
      console.log('Note: This command edits the GLOBAL configuration file.');
      console.log(`Use 'commiat ollama' to configure Ollama settings.`);
      console.log(`For project-specific format, create a ${localConfigManager.LOCAL_CONFIG_FILENAME} file in your project root.`);
      openConfigInEditor();
    }
  });

program
    .command('ollama')
    .description('Configure Ollama settings (enable/disable, base URL, model) in the GLOBAL config.')
    .action(configureOllama);

program.parse(process.argv);