const simpleGit = require("simple-git");

const git = simpleGit();

async function runGitOperation(description, operation) {
  try {
    return await operation();
  } catch (error) {
    const msg = error?.message ?? String(error);
    throw new Error(`${description}: ${msg}`);
  }
}

async function ensureStagedFiles(gitInstance) {
  const g =
    gitInstance && typeof gitInstance.diffSummary === "function" ? gitInstance : git;
  try {
    const diffSummary = await g.diffSummary(["--staged"]);
    const files = diffSummary?.files;
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("No staged changes found to commit.");
    }
    const diff = await g.diff(["--staged"]);
    if (typeof diff !== "string") {
      throw new Error("Failed to get staged diff: unexpected response from git.");
    }
    return diff;
  } catch (error) {
    if (error?.message === "No staged changes found to commit.") {
      throw error;
    }
    const msg = error?.message ?? String(error);
    throw new Error(`Failed to get staged diff: ${msg}`);
  }
}

module.exports = {
  ensureStagedFiles,
  runGitOperation,
};
