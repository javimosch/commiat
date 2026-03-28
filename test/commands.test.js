const test = require("node:test");
const assert = require("node:assert/strict");

const inquirer = require("inquirer");

const { configureOllama } = require("../src/commands/ollamaConfig");
const { selectModel } = require("../src/commands/modelSelect");

test("configureOllama writes config when useOllama true", async () => {
  const promptStub = inquirer.prompt;
  let callCount = 0;
  inquirer.prompt = async (questions) => {
    callCount++;
    if (callCount === 1) {
      // First call: useOllama prompt
      return { useOllama: true };
    }
    // Second call: baseUrl/model/fallback prompts
    return {
      baseUrl: "http://custom:11434",
      model: "custom",
      fallback: false,
    };
  };
  const updateStub = require("../src/core/globalStore").updateGlobalConfig;
  const updates = {};
  require("../src/core/globalStore").updateGlobalConfig = (k, v) => { updates[k] = v; };
  try {
    await configureOllama();
    assert.equal(updates["COMMIAT_USE_OLLAMA"], "true");
    assert.equal(updates["COMMIAT_OLLAMA_BASE_URL"], "http://custom:11434");
    assert.equal(updates["COMMIAT_OLLAMA_MODEL"], "custom");
    assert.equal(updates["COMMIAT_OLLAMA_FALLBACK_TO_OPENROUTER"], "false");
  } finally {
    inquirer.prompt = promptStub;
    require("../src/core/globalStore").updateGlobalConfig = updateStub;
  }
});

test("selectModel updates config when model selected", async () => {
  const promptStub = inquirer.prompt;
  inquirer.prompt = async () => ({ selected: "custom/model" });
  const updateStub = require("../src/core/globalStore").updateGlobalConfig;
  let updatedKey, updatedVal;
  require("../src/core/globalStore").updateGlobalConfig = (k, v) => {
    updatedKey = k;
    updatedVal = v;
  };
  try {
    await selectModel();
    assert.equal(updatedKey, "COMMIAT_OPENROUTER_MODEL");
    assert.equal(updatedVal, "custom/model");
  } finally {
    inquirer.prompt = promptStub;
    require("../src/core/globalStore").updateGlobalConfig = updateStub;
  }
});
