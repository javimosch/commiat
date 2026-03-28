#!/usr/bin/env node

require("dotenv").config();
const { program } = require("commander");
const inquirer = require("inquirer");

inquirer.registerPrompt("autocomplete", require("inquirer-autocomplete-prompt"));

const packageJson = require("../package.json");

const { mainAction } = require("./commands/mainAction");
const { testLlmCompletion } = require("./commands/testLlm");
const { configureOllama } = require("./commands/ollamaConfig");
const { selectModel } = require("./commands/modelSelect");
const { openConfigInEditor } = require("./core/editor");
const { updateGlobalConfig, GLOBAL_CONFIG_PATH } = require("./core/globalStore");
const { CONFIG_KEY_DEFAULT_MULTI } = require("./core/constants");
const localConfigManager = require("./config");

program
  .version(packageJson.version)
  .description(
    "Auto-generate commit messages using AI (OpenRouter or Ollama with optional fallback). Uses staged changes by default.",
  );

program
  .option("-a, --add-all", "Stage all changes (`git add .`) before committing")
  .option("-n, --no-verify", "Bypass git commit hooks")
  .option(
    "-p, --prefix <string>",
    'Prepend a string to the beginning of the generated commit message (e.g., --prefix "[WIP]")',
  )
  .option(
    "-f, --affix <string>",
    'Append a string to the end of the generated commit message (e.g., --affix "(#45789)")',
  )
  .option("-m, --multi", "Enable multi-commit mode: group changes into logical commits using AI")
  .option(
    "-u, --untracked",
    "Include untracked files in multi-commit grouping (they will be staged per group)",
  )
  .option("--non-interactive", "Disable all prompts and auto-accept generated commit messages")
  .action(async (options) => {
    if (!process.stdout.isTTY) {
      options.nonInteractive = true;
    }
    try {
      await mainAction(options);
    } catch {
      process.exit(1);
    }
  });

program
  .command("config")
  .description(
    "Manage GLOBAL OpenRouter configuration (~/.commiat/config). Opens editor by default.",
  )
  .option(
    "-t, --test",
    "Test the configured LLM API connection and model (OpenRouter OR Ollama w/ fallback)",
  )
  .option("-m, --multi", "Set --multi as default mode")
  .action(async (options) => {
    if (options.multi) {
      const { setMultiDefault } = await inquirer.prompt([
        {
          type: "confirm",
          name: "setMultiDefault",
          message: "Set --multi as the default mode for commiat?",
          default: true,
        },
      ]);
      if (setMultiDefault) {
        updateGlobalConfig(CONFIG_KEY_DEFAULT_MULTI, "true");
        console.log(`✅ --multi is now enabled as default.`);
        console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
      } else {
        updateGlobalConfig(CONFIG_KEY_DEFAULT_MULTI, "false");
        console.log(`⚪ --multi is now disabled as default.`);
        console.log(`Settings saved to ${GLOBAL_CONFIG_PATH}`);
      }
    } else if (options.test) {
      await testLlmCompletion();
    } else {
      console.log("Note: This command edits the GLOBAL configuration file.");
      console.log(
        `Use 'commiat ollama' to configure Ollama settings (including fallback).`,
      );
      console.log(
        `For project-specific format, create a ${localConfigManager.LOCAL_CONFIG_FILENAME} file in your project root.`,
      );
      openConfigInEditor();
    }
  });

program
  .command("ollama")
  .description(
    "Configure Ollama settings (enable/disable, base URL, model, fallback) in the GLOBAL config.",
  )
  .action(configureOllama);

program
  .command("model select")
  .description(
    "Select an OpenRouter model using autocomplete search. Recommended: xiaomi/mimo-v2-flash",
  )
  .action(selectModel);

program.parse(process.argv);
