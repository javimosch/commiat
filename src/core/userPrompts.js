const inquirer = require("inquirer");

async function promptUser(initialMessage, nonInteractive = false) {
  if (nonInteractive) {
    console.log(`Commit message: "${initialMessage}"`);
    return initialMessage;
  }

  let currentMessage = initialMessage;
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: `Suggested Commit Message:\n"${currentMessage}"\n\nWhat would you like to do?`,
        choices: [
          { name: "✅ Confirm and Commit", value: "confirm" },
          { name: "📝 Adjust Message", value: "adjust" },
          { name: "❌ Cancel", value: "cancel" },
        ],
      },
    ]);
    if (action === "confirm") {
      return currentMessage;
    }
    if (action === "adjust") {
      const { adjustedMessage } = await inquirer.prompt([
        {
          type: "editor",
          name: "adjustedMessage",
          message: "Adjust the commit message:",
          default: currentMessage,
          validate: (input) =>
            input.trim().length > 0 ? true : "Commit message cannot be empty.",
        },
      ]);
      currentMessage = adjustedMessage.trim();
      continue;
    }
    return null;
  }
}

module.exports = {
  promptUser,
};
