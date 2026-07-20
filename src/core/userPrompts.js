const inquirer = require("inquirer");

async function promptUser(initialMessage, nonInteractive = false) {
  if (typeof initialMessage !== "string") {
    return null;
  }
  const trimmedMessage = initialMessage.trim();
  if (!trimmedMessage) {
    return null;
  }
  if (nonInteractive) {
    console.log(`Commit message: "${trimmedMessage}"`);
    return trimmedMessage;
  }

  let currentMessage = trimmedMessage;
  while (true) {
    let action;
    try {
      ({ action } = await inquirer.prompt([
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
      ]));
    } catch {
      console.error("\n⚠️ Prompt interrupted. Commit cancelled.");
      return null;
    }
    if (action === "confirm") {
      return currentMessage;
    }
    if (action === "adjust") {
      try {
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
      } catch {
        console.error("\n⚠️ Adjust prompt interrupted. Returning original message.");
        return currentMessage;
      }
      continue;
    }
    return null;
  }
}

module.exports = {
  promptUser,
};
