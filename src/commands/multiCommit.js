const simpleGit = require("simple-git");
const inquirer = require("inquirer");

const localConfigManager = require("../config");
const variableProcessor = require("../variables");
const gitUtils = require("../utils/git");
const multiCommitUtils = require("../utils/multiCommit");

const { DEFAULT_CONVENTIONAL_FORMAT } = require("../core/constants");
const { promptUser } = require("../core/userPrompts");
const { promptForLead } = require("../core/leadPrompt");
const {
  applyPrefixAffixToMessage,
  generateCommitMessage,
} = require("../core/commitMessage");

const { generateLlmText, isLikelyContextLimitError } = require("../core/llm");
const { getLlmProviderConfig } = require("../core/providerConfig");

const git = simpleGit();

function buildGroupingPrompt(diff) {
  return `You are an expert software engineer analyzing Git changes.

Your job is to group changes into logical commits based on the following staged diff.

IMPORTANT:
- You MUST separate unrelated changes into different groups.
- Do NOT group changes together just because they appear in the same diff.
- Each group should represent a cohesive unit of work.

Staged diff:
\n\`\`\`diff
${diff}
\`\`\`\n
Return a JSON array of objects with:
- "group": short name for the group
- "files": array of file paths belonging to this group
- "description": brief description of changes in this group

If there are multiple unrelated changes, return multiple groups. Prefer more groups over fewer.
Return ONLY JSON (no markdown, no explanation).`;
}

async function handleMultiCommit(options) {
  try {
    if (options.untracked) {
      const untracked = await gitUtils.getUntrackedFiles();
      if (untracked.length > 0) {
        console.log(`Staging ${untracked.length} untracked files for multi-commit...`);
        await git.add(untracked);
      }
    }

    const relevantFiles = await gitUtils.getStagedFiles();
    if (relevantFiles.length === 0) {
      console.log("No files to commit.");
      return;
    }

    const diff = await git.diff(["--staged"]);
    console.log("\nAnalyzing changes to group them logically...");

    const llmConfig = getLlmProviderConfig();

    let groupAnalysis;
    let normalizedGroups;

    try {
      const groupingPrompt = buildGroupingPrompt(diff);
      groupAnalysis = await generateLlmText(groupingPrompt, llmConfig, true);
      const parsedGroups = multiCommitUtils.parseGroupsFromLlmResponse(groupAnalysis);
      const { groups, warnings } = multiCommitUtils.normalizeMultiCommitGroups(
        parsedGroups,
        relevantFiles,
      );

      warnings.forEach((w) => console.warn(`⚠️ ${w}`));

      if (groups.length === 0) {
        throw new Error("No valid groups returned by the model.");
      }

      normalizedGroups = groups;
    } catch (err) {
      const contextLimit = isLikelyContextLimitError(err);
      if (contextLimit) {
        console.warn(
          "\n⚠️ LLM request exceeded context length while grouping. Falling back to single-group plan.",
        );
        normalizedGroups = [
          {
            group: "(All staged)",
            description: "All staged files (context limit fallback).",
            files: relevantFiles,
          },
        ];
      } else {
        console.warn(
          `\n⚠️ Failed to parse LLM response as JSON. Falling back to single commit mode.`,
        );
        if (groupAnalysis) {
          console.warn(`LLM Response: ${groupAnalysis}`);
        }
        console.warn(`Error: ${err.message}`);
        throw err;
      }
    }

    let localConfig = await localConfigManager.loadConfig(options.nonInteractive);
    const format = localConfig?.format || DEFAULT_CONVENTIONAL_FORMAT;
    const variablesInFormat = variableProcessor.detectVariables(format);
    if (localConfig && variablesInFormat.length > 0 && !options.nonInteractive) {
      const configWasUpdated = await variableProcessor.promptForMissingVariableDescriptions(
        variablesInFormat,
        localConfig,
      );
      if (configWasUpdated) {
        localConfig = await localConfigManager.loadConfig(options.nonInteractive);
      }
    }
    const systemVarValues = await variableProcessor.getSystemVariableValues();

    console.log(
      `\nGenerating suggested commit messages for ${normalizedGroups.length} group(s)...`,
    );
    for (const g of normalizedGroups) {
      const groupDiff = await git.diff(["--staged", "--", ...g.files]);
      const msg = await generateCommitMessage(groupDiff, localConfig, systemVarValues);
      g.suggestedMessage = applyPrefixAffixToMessage(msg, options);
    }

    const printPreview = (groups) => {
      console.log("\n--- Planned commits ---");
      groups.forEach((g, idx) => {
        console.log(`\n#${idx + 1} ${g.group}${g.description ? ` — ${g.description}` : ""}`);
        console.log(`Suggested message:\n${g.suggestedMessage}`);
        console.log("Files:");
        g.files.forEach((f) => console.log(`- ${f}`));
      });
      console.log("\n----------------------\n");
    };

    const selectGroups = async (groups) => {
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to do?",
          choices: [
            { name: "✅ Commit all planned groups", value: "all" },
            { name: "🧩 Select groups to commit", value: "select" },
            { name: "🚪 Leave (discard plan; unstage remaining changes)", value: "leave" },
          ],
          default: "select",
        },
      ]);

      if (action === "leave") return { selectedIndexes: [], leave: true };
      if (action === "all") {
        return { selectedIndexes: groups.map((_, i) => i), leave: false };
      }

      const { selectedIndexes } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selectedIndexes",
          message: "Select which groups to commit now:",
          choices: groups.map((g, i) => ({
            name: `#${i + 1} ${g.group} (${g.files.length} files)`,
            value: i,
            checked: true,
          })),
        },
      ]);

      return { selectedIndexes: selectedIndexes || [], leave: false };
    };

    const commitOptions = {};
    if (options.verify === false) {
      commitOptions["--no-verify"] = null;
    }

    let remaining = normalizedGroups.slice();
    let allSuccessful = true;

    while (remaining.length > 0) {
      if (options.nonInteractive) {
        for (let i = 0; i < remaining.length; i++) {
          const g = remaining[i];
          await gitUtils.unstageAll();
          await git.add(g.files);
          const finalCommitMessage = await promptUser(g.suggestedMessage, true);
          await git.commit(finalCommitMessage, undefined, commitOptions);
        }
        remaining = [];
        break;
      }

      printPreview(remaining);
      const { selectedIndexes, leave } = await selectGroups(remaining);
      if (leave || selectedIndexes.length === 0) {
        console.log("Leaving multi-commit session. Unstaging remaining changes...");
        await gitUtils.unstageAll();
        return;
      }

      const selected = selectedIndexes
        .slice()
        .sort((a, b) => a - b)
        .map((i) => remaining[i])
        .filter(Boolean);

      for (const g of selected) {
        console.log(`\nCommitting group: ${g.group}`);
        await gitUtils.unstageAll();
        await git.add(g.files);

        const finalCommitMessage = await promptUser(g.suggestedMessage, false);
        if (!finalCommitMessage) {
          console.log("\n❌ Commit cancelled. Unstaging remaining changes...");
          allSuccessful = false;
          await gitUtils.unstageAll();
          break;
        }

        if (options.verify === false) {
          console.log("Committing with --no-verify flag...");
        } else {
          console.log("Committing...");
        }
        await git.commit(finalCommitMessage, undefined, commitOptions);
        console.log("✅ Group commit successful!");

        remaining = remaining.filter((x) => x !== g);
      }

      if (!allSuccessful) return;
    }

    console.log(`\n🎉 Multi-commit process completed successfully.`);
  } catch (error) {
    console.error(`\n❌ Error in multi-commit handling: ${error.message}`);
    throw error;
  }

  await promptForLead(options.nonInteractive);
}

module.exports = {
  handleMultiCommit,
};
