#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');
const simpleGit = require('simple-git');
const axios = require('axios');
const inquirer = require('inquirer');

const git = simpleGit();
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function getStagedDiff() {
  const diff = await git.diff(['--staged']);
  if (!diff) {
    console.log('No staged changes found. Stage files with `git add` first.');
    process.exit(0);
  }
  return diff;
}

async function generateCommitMessage(diff) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    throw new Error('OpenRouter API key not found or not set. Please set OPENROUTER_API_KEY in your .env file.');
  }

  const model = process.env.OPENROUTER_MODEL || 'google/gemini-flash-1.5'; // Default model

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
          // Recommended headers by OpenRouter
          'HTTP-Referer': 'http://localhost', // Replace with your app URL if deployed
          'X-Title': 'Commiat CLI', // Replace with your app name
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
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('API Error Status:', error.response.status);
      console.error('API Error Data:', error.response.data);
      throw new Error(`OpenRouter API request failed: ${error.response.status} ${error.response.data?.error?.message || ''}`);
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error('No response received from OpenRouter API.');
    } else {
      // Something happened in setting up the request that triggered an Error
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
          type: 'editor', // Opens default editor for easier multi-line editing
          name: 'adjustedMessage',
          message: 'Adjust the commit message:',
          default: currentMessage,
          validate: (input) => input.trim().length > 0 ? true : 'Commit message cannot be empty.',
        },
      ]);
      currentMessage = adjustedMessage.trim();
    } else { // action === 'cancel'
      return null;
    }
  }
}

async function main(options) { // Accept options object
  console.log('Commiat CLI - Generating commit message...');
  try {
    // Check if -a flag is used
    if (options.addAll) {
      console.log('Staging all changes (`git add .`)...');
      await git.add('.');
      console.log('Changes staged.');
    }

    const diff = await getStagedDiff();
    // console.log('\n--- Staged Diff ---');
    // console.log(diff); // Keep this commented out unless debugging
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
    // Add more detailed error logging if needed, e.g., for API errors caught in generateCommitMessage
    if (error.response && error.response.data) {
        console.error('API Error Details:', error.response.data);
    }
    process.exit(1);
  }
}

program
  .version('1.0.0')
  .description('Auto-generate commit messages for staged changes')
  .option('-a, --add-all', 'Stage all changes (`git add .`) before committing') // Add the option
  .action(main); // Pass program options to main

program.parse(process.argv);