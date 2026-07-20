const axios = require("axios");
const inquirer = require("inquirer");

const {
  CONFIG_KEY_OPENROUTER_MODEL,
  getModelListHttpTimeoutMs,
} = require("../core/constants");

const { updateGlobalConfig } = require("../core/globalStore");

async function selectModel() {
  console.log("Fetching OpenRouter models...");
  try {
    const { data } = await axios.get("https://openrouter.ai/api/v1/models", {
      timeout: getModelListHttpTimeoutMs(),
    });
    let models = (Array.isArray(data?.data) ? data.data : [])
      .filter(
        (m) =>
          m &&
          typeof m === "object" &&
          typeof m.id === "string" &&
          m.id.trim().length > 0,
      )
      .map((m) => ({
        name: `${m.name || m.id} - ${m.id}`,
        value: m.id.trim(),
      }));

    if (models.length === 0) {
      console.log("No models available.");
      return;
    }

    let selected;
    try {
      ({ selected } = await inquirer.prompt([
        {
          type: "autocomplete",
          name: "selected",
          message: "Search and select a model (type to filter):",
          source: (answers, input) => {
            input = input || "";
            return models
              .filter(
                (m) =>
                  m.name.toLowerCase().includes(input.toLowerCase()) ||
                  m.value.toLowerCase().includes(input.toLowerCase()),
              )
              .slice(0, 20);
          },
          pageSize: 7,
        },
      ]));
    } catch {
      console.warn("\n⚠️ Model selection prompt interrupted. No changes saved.");
      return;
    }

    if (typeof selected === "string" && selected.trim().length > 0) {
      try {
        updateGlobalConfig(CONFIG_KEY_OPENROUTER_MODEL, selected);
      } catch (error) {
        console.error(`Failed to save selected model: ${error?.message ?? String(error)}`);
        throw error;
      }
      console.log(`\n✅ Set OpenRouter model to: ${selected}`);
    }
  } catch (error) {
    console.error(`Failed to fetch models or select: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
    }
  }
}

module.exports = {
  selectModel,
};
