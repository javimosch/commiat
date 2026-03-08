const axios = require("axios");
const inquirer = require("inquirer");

const {
  CONFIG_KEY_OPENROUTER_MODEL,
} = require("../core/constants");

const { updateGlobalConfig } = require("../core/globalStore");

async function selectModel() {
  console.log("Fetching OpenRouter models...");
  try {
    const { data } = await axios.get("https://openrouter.ai/api/v1/models");
    let models = data.data
      .map((m) => ({
        name: `${m.name} - ${m.id}`,
        value: m.id,
      }))
      .filter((m) => m.name && m.value);

    if (models.length === 0) {
      console.log("No models available.");
      return;
    }

    const { selected } = await inquirer.prompt([
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
    ]);

    if (selected) {
      updateGlobalConfig(CONFIG_KEY_OPENROUTER_MODEL, selected);
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
