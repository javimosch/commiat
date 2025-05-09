const simpleGit = require('simple-git');
const git = simpleGit();

/**
 * Extracts the first sequence of digits from a string.
 * @param {string} branchName - The string to extract digits from.
 * @returns {string} The first number found, or an empty string if none.
 */
function extractNumberFromString(branchName) {
    if (!branchName) return '';
    // Matches the first sequence of one or more digits
    const match = branchName.match(/\d+/);
    return match ? match[0] : '';
}

/**
 * Gets the current Git branch name.
 * @returns {Promise<string>} The current branch name.
 * @throws {Error} If not in a git repository or branch cannot be determined.
 */
async function getGitBranch() {
  try {
    const status = await git.status();
    if (!status.current) {
        console.warn('⚠️ Could not automatically determine current git branch name.');
        return ''; // Return empty string if branch cannot be determined
    }
    console.log(`Detected current branch: ${status.current}`);
    return status.current;
  } catch (error) {
    console.error('❌ Error getting git branch:', error.message);
    if (error.message.includes('not a git repository')) {
        throw new Error('Not running in a git repository.');
    }
    throw new Error(`Failed to get current git branch: ${error.message}`);
  }
}

/**
 * Gets the number part of the current Git branch name.
 * Extracts the first sequence of digits found in the branch name.
 * @returns {Promise<string>} The extracted number, or empty string if no number found or error.
 */
async function getGitBranchNumber() {
    try {
        const branchName = await getGitBranch();
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

module.exports = {
  getGitBranch,
  getGitBranchNumber,
  extractNumberFromString,
};