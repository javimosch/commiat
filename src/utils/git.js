const simpleGit = require('simple-git');
const git = simpleGit();

/**
 * Extracts the first sequence of digits from a string.
 * @param {string} branchName - The string to extract digits from.
 * @returns {string} The first number found, or an empty string if none.
 */
function extractNumberFromString(branchName) {
    if (typeof branchName !== "string" || branchName.length === 0) return '';
    const match = branchName.match(/\d+/);
    return match ? match[0] : '';
}

/**
 * Gets the current Git branch name.
 * @returns {Promise<string>} The current branch name.
 * @throws {Error} If not in a git repository or branch cannot be determined.
 */
async function getGitBranch(gitInstance) {
  const g = (gitInstance && typeof gitInstance.status === "function") ? gitInstance : git;
  try {
    const status = await g.status();
    if (!status.current) {
        console.warn('⚠️ Could not automatically determine current git branch name.');
        return ''; // Return empty string if branch cannot be determined
    }
    console.log(`Detected current branch: ${status.current}`);
    return status.current;
  } catch (error) {
    const msg = error?.message ?? String(error);
    console.error('❌ Error getting git branch:', msg);
    if (msg.includes('not a git repository')) {
        throw new Error('Not running in a git repository.');
    }
    throw new Error(`Failed to get current git branch: ${msg}`);
  }
}

/**
 * Gets the number part of the current Git branch name.
 * Extracts the first sequence of digits found in the branch name.
 * @returns {Promise<string>} The extracted number, or empty string if no number found or error.
 */
async function getGitBranchNumber(gitInstance) {
    try {
        const branchName = await getGitBranch(gitInstance);
        const branchNumber = extractNumberFromString(branchName);
        if (branchNumber) {
            console.log(`Extracted branch number: ${branchNumber}`);
        } else {
            console.log(`No number found in branch name: ${branchName}`);
        }
        return branchNumber;
    } catch (error) {
        // Log the error but return empty string for this specific variable
        console.error(`❌ Error getting git branch number: ${error.message}`);
        return '';
    }
}

async function getStagedFiles(gitInstance) {
  const g = (gitInstance && typeof gitInstance.diffSummary === "function") ? gitInstance : git;
  try {
    const summary = await g.diffSummary(["--staged"]);
    if (!summary || !Array.isArray(summary.files)) return [];
    return summary.files.map(f => f.file).filter(Boolean);
  } catch {
    return [];
  }
}

async function getUntrackedFiles() {
  try {
    const output = await git.raw(["ls-files", "--others", "--exclude-standard"]);
    if (!output || typeof output !== "string" || output.trim().length === 0) return [];
    return output.trim().split('\n').filter(f => f.length > 0);
  } catch {
    return [];
  }
}

async function getRelevantFiles(options) {
  let files = await getStagedFiles();
  if (options && options.untracked) {
    const untracked = await getUntrackedFiles();
    files = [...new Set([...files, ...untracked])];
  }
  return files;
}

async function stageFiles(files, gitInstance) {
  if (!Array.isArray(files) || files.length === 0) return;
  const g = (gitInstance && typeof gitInstance.add === "function") ? gitInstance : git;
  try {
    await g.add(files.filter(f => typeof f === "string" && f.length > 0));
  } catch (error) {
    console.error("❌ Failed to stage files:", error?.message ?? error);
  }
}

async function unstageAll() {
  try {
    const staged = await getStagedFiles();
    if (staged.length > 0) {
      await git.reset(["--", ...staged]);
    }
  } catch (error) {
    console.error("❌ Failed to unstage files:", error?.message ?? error);
  }
}

async function getFileStatus() {
  try {
    return await git.status();
  } catch (error) {
    console.error("Failed to get git status:", error.message);
    return { files: [] };
  }
}

module.exports = {
  getGitBranch,
  getGitBranchNumber,
  extractNumberFromString,
  getStagedFiles,
  getUntrackedFiles,
  getRelevantFiles,
  stageFiles,
  unstageAll,
  getFileStatus,
};