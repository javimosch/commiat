#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');
const simpleGit = require('simple-git');
const axios = require('axios');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const git = simpleGit();
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// --- Configuration File Logic ---
const CONFIG_DIR = path.join(os.homedir(), '.commiat');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config');

function ensureConfigDirExists() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function saveApiKeyToConfig(apiKey) {
  ensureConfigDirExists();
  fs.writeFileSync(CONFIG_PATH, apiKey, 'utf8');
  console.log(`API Key saved to ${CONFIG_PATH}`);
}

function loadApiKeyFromConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return fs.readFileSync(CONFIG_PATH, 'utf8').trim();
  }
  return null;
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
  saveApiKeyToConfig(trimmedKey);
  return trimmedKey;
}

async function getApiKey() {
  const envApiKey = process.env.OPENROUTER_API_KEY;
  if (envApiKey && envApiKey !== 'YOUR_API_KEY_HERE') {
    return envApiKey;
  }

  const configApiKey = loadApiKeyFromConfig();
  if (configApiKey) {
    return configApiKey;
  }

  return await promptForApiKey();
}
// --- End Configuration File Logic ---


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

  const model = process.env.OPENROUTER_MODEL || 'google/gemini-flash-1.5';

  const prompt = `Generate a concise Git commit message based on the following diff. Follow conventional commit format (e.g., feat: ..., fix: ..., chore: ...). Describe the change, not just the files changed.\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\``;

  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: model,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'Commiat CLI',
        },
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
      }
      throw new Error(`OpenRouter API request failed: ${error.response.status} ${error.response.data?.error?.message || ''}`);
    } else if (error.request) {
      throw new Error('No response received from OpenRouter API.');
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
    } else {
      return null;
    }
  }
}

async function main(options) {
  console.log('Commiat CLI - Generating commit message...');
  try {
    if (options.addAll) {
      console.log('Staging all changes (`git add .`)...');
      await git.add('.');
      console.log('Changes staged.');
    }

    const diff = await getStagedDiff();
    // console.log('\n--- Staged Diff ---');
    // console.log(diff);
    // console.log('--- End Diff ---\n');

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

program
  .version('1.0.0')
  .description('Auto-generate commit messages for staged changes')
  .option('-a, --add-all', 'Stage all changes (`git add .`) before committing')
  .action(main);

program.parse(process.argv);