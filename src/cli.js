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
const DEFAULT_OLLAMA_MODEL = 'llama3';
const DEFAULT_CONVENTIONAL_FORMAT = '{type}: {msg}';
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.commiat');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'config');

// --- Config Keys ---
const CONFIG_KEY_API_KEY = 'COMMIAT_OPENROUTER_API_KEY';
const CONFIG_KEY_OPENROUTER_MODEL = 'COMMIAT_OPENROUTER_MODEL';
const CONFIG_KEY_USE_OLLAMA = 'COMMIAT_USE_OLLAMA';
const CONFIG_KEY_OLLAMA_BASE_URL = 'COMMIAT_OLLAMA_BASE_URL';
const CONFIG_KEY_OLLAMA_MODEL = 'COMMIAT_OLLAMA_MODEL';
const CONFIG_KEY_OLLAMA_FALLBACK = 'COMMIAT_OLLAMA_FALLBACK_TO_OPENROUTER';

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
      const formattedValue = typeof value === 'boolean' && value === true
        ? 'true'
        : typeof value === 'boolean' && value === false
        ? 'false'
        : /\s|#|"|'|=/.test(String(value))
        ? `"${String(value).replace(/"/g, '\\"')}`
        : String(value);
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

function isOpenRouterConfigured() {
    const envApiKey = process.env[CONFIG_KEY_API_KEY];
    if (envApiKey && envApiKey !== 'YOUR_API_KEY_HERE') {
        return true;
    }
    const globalConfig = loadGlobalConfig();
    const configApiKey = globalConfig[CONFIG_KEY_API_KEY];
    return !!configApiKey;
}

async function getApiKey(promptIfNeeded = true) {
  const envApiKey = process.env[CONFIG_KEY_API_KEY];
  if (envApiKey && envApiKey !== 'YOUR_API_KEY_HERE') {
    return envApiKey;
  }

  const globalConfig = loadGlobalConfig();
  const configApiKey = globalConfig[CONFIG_KEY_API_KEY];
  if (configApiKey) {
    return configApiKey;
  }

  if (promptIfNeeded) {
      return await promptForApiKey();
  } else {
      return null;
  }
}

function getLlmProviderConfig() {
    const envUseOllama = process.env[CONFIG_KEY_USE_OLLAMA];
    const globalConfig = loadGlobalConfig();
    const configUseOllama = globalConfig[CONFIG_KEY_USE_OLLAMA];
    const configFallback = globalConfig[CONFIG_KEY_OLLAMA_FALLBACK] === 'true';

    const useOllama = envUseOllama === '1' || envUseOllama === 'true' || (!envUseOllama && configUseOllama === 'true');

    if (useOllama) {
        const baseUrl = process.env[CONFIG_KEY_OLLAMA_BASE_URL] || globalConfig[CONFIG_KEY_OLLAMA_BASE_URL] || DEFAULT_OLLAMA_BASE_URL;
        const model = process.env[CONFIG_KEY_OLLAMA_MODEL] || globalConfig[CONFIG_KEY_OLLAMA_MODEL] || DEFAULT_OLLAMA_MODEL;
        return { provider: 'ollama', baseUrl, model, fallbackEnabled: configFallback };
    } else {
        const model = process.env[CONFIG_KEY_OPENROUTER_MODEL] || globalConfig[CONFIG_KEY_OPENROUTER_MODEL] || DEFAULT_OPENROUTER_MODEL;
        return { provider: 'openrouter', model, fallbackEnabled: false };
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
  const providerInfo = error.provider ? `\nProvider: ${error.provider}` : '';
  const requestUrlInfo = error.requestUrl ? `\nRequest URL: ${error.requestUrl}` : '';
  const responseStatusInfo = error.responseStatus ? `\nResponse Status: ${error.responseStatus}` : '';
  const responseDataInfo = error.responseData ? `\nResponse Data: ${JSON.stringify(error.responseData)}` : '';

  const logMessage = `[${new Date().toISOString()}] ${error.message}${providerInfo}${requestUrlInfo}${responseStatusInfo}${responseDataInfo}${stack}\n\n`;
  fs.writeFileSync(errorLogPath, logMessage, { flag: 'a' });
}

// --- API Call Helpers ---

/**
 * Makes API call to Ollama.
 * @param {string} prompt The full prompt content.
 * @param {object} llmConfig The Ollama configuration object.
 * @returns {Promise<string>} The generated commit message.
 * @throws {Error} If the API call fails or returns invalid data.
 */
async function callOllamaApi(prompt, llmConfig) {
    const ollamaUrl = `${llmConfig.baseUrl}/api/chat`;
    console.log(`Sending request to Ollama: ${ollamaUrl}`);
    try {
        const response = await axios.post(
            ollamaUrl,
            {
                model: llmConfig.model,
                messages: [{ role: 'user', content: prompt }],
                stream: false
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        if (response.data && response.data.message && response.data.message.content) {
            let message = response.data.message.content.trim();
            message = message.replace(/^```(?:git|commit|text)?\s*/, '').replace(/```\s*$/, '');
            message = message.replace(/^["']|["']$/g, '');
            return message.trim();
        } else {
            throw new Error('Invalid Ollama API response structure.');
        }
    } catch (error) {
        const enhancedError = new Error(error.message || 'Ollama API request failed');
        enhancedError.stack = error.stack;
        enhancedError.provider = 'ollama';
        enhancedError.requestUrl = ollamaUrl;
        enhancedError.responseStatus = error.response?.status;
        enhancedError.responseData = error.response?.data;
        enhancedError.isNetworkError = !!error.request && !error.response;
        throw enhancedError;
    }
}

/**
 * Makes API call to OpenRouter.
 * @param {string} prompt The full prompt content.
 * @param {object} llmConfig The OpenRouter configuration object.
 * @returns {Promise<string>} The generated commit message.
 * @throws {Error} If the API call fails, API key is missing, or returns invalid data.
 */
async function callOpenRouterApi(prompt, llmConfig) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error('Could not obtain OpenRouter API key.');
    }
    console.log(`Sending request to OpenRouter: ${OPENROUTER_API_URL}`);
    try {
        const response = await axios.post(
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

        if (response.data && response.data.choices && response.data.choices.length > 0) {
            let message = response.data.choices[0].message.content.trim();
            message = message.replace(/^```(?:git|commit|text)?\s*/, '').replace(/```\s*$/, '');
            message = message.replace(/^["']|["']$/g, '');
            return message.trim();
        } else {
            throw new Error('Invalid OpenRouter API response structure.');
        }
    } catch (error) {
        const enhancedError = new Error(error.message || 'OpenRouter API request failed');
        enhancedError.stack = error.stack;
        enhancedError.provider = 'openrouter';
        enhancedError.requestUrl = OPENROUTER_API_URL;
        enhancedError.responseStatus = error.response?.status;
        enhancedError.responseData = error.response?.data;
        enhancedError.isAuthenticationError = error.response?.status === 401;
        throw enhancedError;
    }
}

// --- Commit Message Generation (Main Logic) ---
async function generateCommitMessage(diff, localConfig, systemVarValues) {
    const llmConfig = getLlmProviderConfig();
    console.log(`Using provider: ${llmConfig.provider}, Model: ${llmConfig.model}${llmConfig.fallbackEnabled ? ', Fallback Enabled' : ''}`);

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
    variablesInFormat.forEach(v => { if (systemVarValues[v] !== undefined) relevantSystemVars[v] = systemVarValues[v]; });
    if (Object.keys(relevantSystemVars).length > 0) {
        prompt += "System variable values (use these directly):\n";
        for (const variable in relevantSystemVars) { prompt += `- {${variable}}: ${relevantSystemVars[variable] || 'N/A'}\n`; }
    }
    prompt += "\nGenerate ONLY the commit message string, adhering strictly to the specified format and variable descriptions.";

    try {
        if (llmConfig.provider === 'ollama') {
            try {
                return await callOllamaApi(prompt, llmConfig);
            } catch (ollamaError) {
                const canFallback = llmConfig.fallbackEnabled && isOpenRouterConfigured();
                const shouldAttemptFallback = ollamaError.isNetworkError || (ollamaError.responseStatus && ollamaError.responseStatus >= 400 && ollamaError.responseStatus !== 401 && ollamaError.responseStatus !== 403);

                if (canFallback && shouldAttemptFallback) {
                    console.warn(`⚠️ Ollama request failed (Status: ${ollamaError.responseStatus || 'N/A'}, Message: ${ollamaError.message}). Attempting fallback to OpenRouter...`);
                    await fsLogError(ollamaError);

                    const globalConfig = loadGlobalConfig();
                    const openRouterModel = process.env[CONFIG_KEY_OPENROUTER_MODEL] || globalConfig[CONFIG_KEY_OPENROUTER_MODEL] || DEFAULT_OPENROUTER_MODEL;
                    const openRouterConfig = { provider: 'openrouter', model: openRouterModel };

                    return await callOpenRouterApi(prompt, openRouterConfig);
                } else {
                    throw ollamaError;
                }
            }
        } else {
            return await callOpenRouterApi(prompt, llmConfig);
        }
    } catch (error) {
        await fsLogError(error);
        console.error(`\n❌ Failed to generate commit message using ${error.provider || 'configured provider'}.`);
        if (error.provider === 'ollama') {
            console.error(`Ensure Ollama is running at ${error.requestUrl?.replace('/api/chat','')} and the model is available.`);
            if (llmConfig.fallbackEnabled && !isOpenRouterConfigured()) {
                console.error(`Fallback to OpenRouter is enabled, but OpenRouter API key is not configured.`);
            }
        } else if (error.provider === 'openrouter') {
            if (error.isAuthenticationError) {
                console.error('OpenRouter authentication failed. Check your API key.');
            } else {
                console.error(`OpenRouter request failed (Status: ${error.responseStatus || 'N/A'}). Check OpenRouter status or your network.`);
            }
        }
        throw new Error(`Commit message generation failed: ${error.message}`);
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
    } else {
      return null;
    }
  }
}

// --- Main Action ---
async function mainAction(options) {
  console.log('Commiat CLI - Generating commit message...');
  try {
    let localConfig = await localConfigManager.loadConfig();
    const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
    if (!localConfig) {
      console.log(`Using default format: "${format}"`);
    }

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

    const diff = await ensureStagedFiles();

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

    const systemVarValues = await variableProcessor.getSystemVariableValues();

    const initialCommitMessage = await generateCommitMessage(diff, localConfig, systemVarValues);

    const finalCommitMessage = await promptUser(initialCommitMessage);

    if (finalCommitMessage) {
      const commitOptions = {};
      if (options.verify === false) {
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
        console.log(`- Fallback Enabled: ${llmConfig.fallbackEnabled}`);
    }

    try {
        let output;
        if (llmConfig.provider === 'ollama') {
            try {
                output = await callOllamaApi(testPrompt, llmConfig);
                console.log('\n✅ Ollama test successful!');
            } catch (ollamaError) {
                const canFallback = llmConfig.fallbackEnabled && isOpenRouterConfigured();
                const shouldAttemptFallback = ollamaError.isNetworkError || (ollamaError.responseStatus && ollamaError.responseStatus >= 400 && ollamaError.responseStatus !== 401 && ollamaError.responseStatus !== 403);

                if (canFallback && shouldAttemptFallback) {
                    console.warn(`⚠️ Ollama test failed (Status: ${ollamaError.responseStatus || 'N/A'}, Message: ${ollamaError.message}). Attempting fallback test with OpenRouter...`);
                    await fsLogError(ollamaError);

                    const globalConfig = loadGlobalConfig();
                    const openRouterModel = process.env[CONFIG_KEY_OPENROUTER_MODEL] || globalConfig[CONFIG_KEY_OPENROUTER_MODEL] || DEFAULT_OPENROUTER_MODEL;
                    const openRouterConfig = { provider: 'openrouter', model: openRouterModel };

                    output = await callOpenRouterApi(testPrompt, openRouterConfig);
                    console.log('\n✅ OpenRouter fallback test successful!');
                } else {
                    throw ollamaError;
                }
            }
        } else {
            output = await callOpenRouterApi(testPrompt, llmConfig);
            console.log('\n✅ OpenRouter test successful!');
        }

        console.log(`\nOutput:`);
        console.log(`- Response: "${output}"`);
    } catch (error) {
        await fsLogError(error);
        console.error(`\n❌ Test failed for ${error.provider || 'configured provider'}.`);
        if (error.provider === 'ollama') {
            console.error(`Ensure Ollama is running at ${error.requestUrl?.replace('/api/chat','')} and the model is available.`);
            if (llmConfig.fallbackEnabled && !isOpenRouterConfigured()) {
                console.error(`Fallback to OpenRouter is enabled, but OpenRouter API key is not configured.`);
            }
        } else if (error.provider === 'openrouter') {
            if (error.isAuthenticationError) {
                console.error('OpenRouter authentication failed. Check your API key.');
            } else {
                console.error(`OpenRouter request failed (Status: ${error.responseStatus || 'N/A'}). Check OpenRouter status or your network.`);
            }
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
    const currentFallback = currentConfig[CONFIG_KEY_OLLAMA_FALLBACK] === 'true';

    console.log(`\n--- Ollama Configuration ---`);
    console.log(`Current setting: ${currentUseOllama ? `Enabled (URL: ${currentBaseUrl}, Model: ${currentModel}, Fallback: ${currentFallback})` : 'Disabled'}`);

    const { useOllama } = await inquirer.prompt([
        { type: 'confirm', name: 'useOllama', message: 'Enable Ollama for commit message generation?', default: currentUseOllama }
    ]);

    if (useOllama) {
        const answers = await inquirer.prompt([
            { type: 'input', name: 'baseUrl', message: `Enter Ollama base URL (leave blank for default: ${DEFAULT_OLLAMA_BASE_URL}):`, default: currentBaseUrl },
            { type: 'input', name: 'model', message: `Enter Ollama model name (leave blank for default: ${DEFAULT_OLLAMA_MODEL}):`, default: currentModel },
            { type: 'confirm', name: 'fallback', message: 'Enable fallback to OpenRouter if Ollama fails (requires OpenRouter API key)?', default: currentFallback }
        ]);

        const finalBaseUrl = answers.baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL;
        const finalModel = answers.model.trim() || DEFAULT_OLLAMA_MODEL;
        const finalFallback = answers.fallback;

        updateGlobalConfig(CONFIG_KEY_USE_OLLAMA, 'true');
        updateGlobalConfig(CONFIG_KEY_OLLAMA_BASE_URL, finalBaseUrl);
        updateGlobalConfig(CONFIG_KEY_OLLAMA_MODEL, finalModel);
        updateGlobalConfig(CONFIG_KEY_OLLAMA_FALLBACK, finalFallback ? 'true' : 'false');

        console.log(`✅ Ollama enabled. Base URL: ${finalBaseUrl}, Model: ${finalModel}, Fallback: ${finalFallback}.`);
        if (finalFallback && !isOpenRouterConfigured()) {
            console.warn(`⚠️ Fallback enabled, but OpenRouter API key is not configured. Fallback will not work until an API key is set (via env or 'commiat config').`);
        }
        console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
    } else {
        updateGlobalConfig(CONFIG_KEY_USE_OLLAMA, 'false');
        updateGlobalConfig(CONFIG_KEY_OLLAMA_FALLBACK, 'false');
        console.log(`⚪ Ollama disabled. Commiat will use OpenRouter (if configured).`);
        console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
    }
}

// --- Program Definition ---
program
  .version('1.3.0')
  .description('Auto-generate commit messages using AI (OpenRouter or Ollama with optional fallback). Uses staged changes by default.');

program
  .option('-a, --add-all', 'Stage all changes (`git add .`) before committing')
  .option('-n, --no-verify', 'Bypass git commit hooks')
  .action(mainAction);

program
  .command('config')
  .description('Manage GLOBAL OpenRouter configuration (~/.commiat/config). Opens editor by default.')
  .option('-t, --test', 'Test the configured LLM API connection and model (OpenRouter OR Ollama w/ fallback)')
  .action(async (options) => {
    if (options.test) {
      await testLlmCompletion();
    } else {
      console.log('Note: This command edits the GLOBAL configuration file.');
      console.log(`Use 'commiat ollama' to configure Ollama settings (including fallback).`);
      console.log(`For project-specific format, create a ${localConfigManager.LOCAL_CONFIG_FILENAME} file in your project root.`);
      openConfigInEditor();
    }
  });

program
    .command('ollama')
    .description('Configure Ollama settings (enable/disable, base URL, model, fallback) in the GLOBAL config.')
    .action(configureOllama);

program.parse(process.argv);