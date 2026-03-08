const simpleGit = require("simple-git");

const git = simpleGit();

async function ensureStagedFiles() {
  const diffSummary = await git.diffSummary(["--staged"]);
  if (diffSummary.files.length === 0) {
    console.log("No staged changes found to commit.");
    process.exit(0);
  }
  return await git.diff(["--staged"]);
}

module.exports = {
  ensureStagedFiles,
};
