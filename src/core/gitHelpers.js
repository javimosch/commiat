const simpleGit = require("simple-git");

const git = simpleGit();

async function ensureStagedFiles() {
  try {
    const diffSummary = await git.diffSummary(["--staged"]);
    if (diffSummary.files.length === 0) {
      throw new Error("No staged changes found to commit.");
    }
    return await git.diff(["--staged"]);
  } catch (error) {
    if (error.message === "No staged changes found to commit.") {
      throw error;
    }
    throw new Error(`Failed to get staged diff: ${error.message}`);
  }
}

module.exports = {
  ensureStagedFiles,
};
