const simpleGit = require('simple-git');
const git = simpleGit();

/**
 * Gets the current Git branch name.
 * @returns {Promise&lt;string&gt;} The current branch name.
 * @throws {Error} If not in a git repository or branch cannot be determined.
 */
async function getGitBranch() {
  try {
    const status = await git.status();
    if (!status.current) {
        // This might happen in detached HEAD state or other edge cases
        console.warn('⚠️ Could not automatically determine current git branch name.');
        // Fallback or prompt? For now, return a placeholder or throw.
        // Let's return an empty string for now, the variable processor can handle it.
        return '';
        // Or throw: throw new Error('Could not determine current git branch.');
    }
    console.log(`Detected current branch: ${status.current}`);
    return status.current;
  } catch (error) {
    console.error('❌ Error getting git branch:', error.message);
    // Check if it's because it's not a git repo
    if (error.message.includes('not a git repository')) {
        throw new Error('Not running in a git repository.');
    }
    throw new Error(`Failed to get current git branch: ${error.message}`);
  }
}

module.exports = {
  getGitBranch,
};