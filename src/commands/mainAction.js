const simpleGit = require("simple-git");
const inquirer = require("inquirer");

const localConfigManager = require("../config");
const variableProcessor = require("../variables");

const { DEFAULT_CONVENTIONAL_FORMAT } = require("../core/constants");
const { getDefaultMultiConfig } = require("../core/providerConfig");
const { ensureStagedFiles } = require("../core/gitHelpers");
const { promptUser } = require("../core/userPrompts");
const { promptForLead } = require("../core/leadPrompt");
const {
  applyPrefixAffixToMessage,
  generateCommitMessage,
} = require("../core/commitMessage");

const { handleMultiCommit } = require("./multiCommit");

const git = simpleGit();

async function mainAction(options) {
  if (!options.multi && getDefaultMultiConfig()) {
    options.multi = true;
  }

  console.log("Commiat CLI - Generating commit message...");
  try {
    let localConfig = await localConfigManager.loadConfig(options.nonInteractive);
    const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
    if (!localConfig) {
      console.log(`Using default format: "${format}"`);
    }

    if (options.addAll) {
      console.log("Staging all changes (`git add .`)...");
      await git.add(".");
      console.log("Changes staged.");
    } else {
      const stagedSummary = await git.diffSummary(["--staged"]);
      if (stagedSummary.files.length === 0) {
        if (options.nonInteractive) {
          console.log("No changes staged. Auto-staging all changes...");
          await git.add(".");
          console.log("Changes staged.");
        } else {
          const { shouldStageAll } = await inquirer.prompt([
            {
              type: "confirm",
              name: "shouldStageAll",
              message: "No changes staged. Stage all changes now? (git add .)",
              default: true,
            },
          ]);
          if (shouldStageAll) {
            console.log("Staging all changes (`git add .`)...");
            await git.add(".");
            console.log("Changes staged.");
          } else {
            console.log("No changes staged. Aborting.");
            process.exit(0);
          }
        }
      } else {
        console.log(`${stagedSummary.files.length} file(s) already staged.`);
      }
    }

    if (options.multi) {
      console.log("Multi-commit mode enabled...");
      await handleMultiCommit(options);
      return;
    }

    const diff = await ensureStagedFiles();

    const variablesInFormat = variableProcessor.detectVariables(format);
    if (localConfig && variablesInFormat.length > 0) {
      const configWasUpdated = await variableProcessor.promptForMissingVariableDescriptions(
        variablesInFormat,
        localConfig,
      );
      if (configWasUpdated) {
        localConfig = await localConfigManager.loadConfig(options.nonInteractive);
        if (!localConfig) {
          throw new Error(
            `Failed to reload ${localConfigManager.LOCAL_CONFIG_FILENAME} after updating variable descriptions.`,
          );
        }
      }
    }

    const systemVarValues = await variableProcessor.getSystemVariableValues();
    const initialCommitMessage = await generateCommitMessage(
      diff,
      localConfig,
      systemVarValues,
    );

    const messageToPrompt = applyPrefixAffixToMessage(initialCommitMessage, options);
    const finalCommitMessage = await promptUser(messageToPrompt, options.nonInteractive);

    if (finalCommitMessage) {
      const commitOptions = {};
      if (options.verify === false) {
        commitOptions["--no-verify"] = null;
        console.log("Committing with --no-verify flag...");
      } else {
        console.log("Committing...");
      }

      await git.commit(finalCommitMessage, undefined, commitOptions);
      console.log("\n✅ Commit successful!");
      await promptForLead(options.nonInteractive);
    } else {
      console.log("\n❌ Commit cancelled.");
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    throw error;
  }
}

module.exports = {
  mainAction,
};
