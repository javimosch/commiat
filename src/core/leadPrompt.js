const axios = require("axios");
const inquirer = require("inquirer");

const {
  STATE_KEY_LEAD_PROMPTED,
  STATE_KEY_LEAD_PROMPTED_AT,
  STATE_KEY_LEAD_PROMPTED_SUCCESS,
} = require("./constants");

const { loadState, saveState, updateState, fsLogError } = require("./globalStore");

const LEAD_WEBHOOK_URL =
  "https://activepieces.coolify.intrane.fr/api/v1/webhooks/Uo0638ojR53Psjs2PFAgG";

async function promptForLead(nonInteractive = false) {
  if (nonInteractive) {
    return;
  }
  const currentState = loadState();

  if (currentState[STATE_KEY_LEAD_PROMPTED_SUCCESS] === "1") {
    return;
  }

  const lastPromptedAt = currentState[STATE_KEY_LEAD_PROMPTED_AT];
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  if (lastPromptedAt) {
    const lastPromptDate = new Date(parseInt(lastPromptedAt, 10));
    const now = new Date();
    if (now - lastPromptDate < oneWeek) {
      return;
    }
  }

  console.log("\n---\n");

  try {
    const { interested } = await inquirer.prompt([
      {
        type: "confirm",
        name: "interested",
        message:
          "💡 Commiat Cloud is coming — your AI assistant that understands your commits, searches your history, and answers code questions. ⚡ Get early access free in exchange for feedback — interested?",
        default: true,
      },
    ]);

    if (interested) {
      const { email } = await inquirer.prompt([
        {
          type: "input",
          name: "email",
          message: "Great! Please enter your email to receive the early access link when available",
          validate: (input) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(input) ? true : "Please enter a valid email address.";
          },
        },
      ]);

      if (email) {
        const webhookUrlWithEmail = `${LEAD_WEBHOOK_URL}?email=${encodeURIComponent(email)}`;
        console.log("Sending your interest...");
        try {
          await axios.get(webhookUrlWithEmail, { timeout: 5000 });
          console.log("Thanks! We'll be in touch.");
          updateState(STATE_KEY_LEAD_PROMPTED_SUCCESS, "1");
        } catch (webhookError) {
          console.warn(
            "Could not send email interest automatically, but we appreciate your interest!",
          );
          await fsLogError(new Error(`Webhook failed: ${webhookError.message}`));
        }
      } else {
        console.log("No email provided. Thanks for your interest anyway!");
      }
    } else {
      console.log("Okay, no problem!");
    }
  } catch (promptError) {
    console.warn("Could not display the interest prompt.");
    await fsLogError(new Error(`Lead prompt failed: ${promptError.message}`));
  } finally {
    const newState = { ...currentState };
    newState[STATE_KEY_LEAD_PROMPTED_AT] = Date.now().toString();
    if (newState[STATE_KEY_LEAD_PROMPTED]) {
      delete newState[STATE_KEY_LEAD_PROMPTED];
    }
    saveState(newState);
    console.log("\n---\n");
  }
}

module.exports = {
  promptForLead,
};
