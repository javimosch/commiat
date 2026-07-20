const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const path = require("path");

const inquirer = require("inquirer");

const PROJECT_SRC = path.join(__dirname, "..", "src");

function createStubModules(tmpDir) {
  const cacheKeys = Object.keys(require.cache).filter((k) => k.startsWith(PROJECT_SRC));
  for (const key of cacheKeys) delete require.cache[key];
  process.env.GLOBAL_CONFIG_DIR = tmpDir;

  const globalStore = require("../src/core/globalStore");
  const updates = {};
  const saves = [];
  const origUpdate = globalStore.updateGlobalConfig;
  const origSave = globalStore.saveGlobalConfig;
  globalStore.updateGlobalConfig = (k, v) => {
    updates[k] = v;
  };
  globalStore.saveGlobalConfig = (cfg) => {
    saves.push({ ...cfg });
  };

  const { configureOllama } = require("../src/commands/ollamaConfig");
  const { selectModel } = require("../src/commands/modelSelect");
  return { configureOllama, selectModel, globalStore, origUpdate, origSave, updates, saves };
}

function restoreModules(globalStore, origUpdate, origSave) {
  globalStore.updateGlobalConfig = origUpdate;
  globalStore.saveGlobalConfig = origSave;
  const keys = Object.keys(require.cache).filter((k) => k.startsWith(PROJECT_SRC));
  for (const key of keys) delete require.cache[key];
}

test("configureOllama writes config when useOllama true", async () => {
  const tmpDir = require("fs").mkdtempSync("/tmp/commiat-test-");
  try {
    const promptStub = inquirer.prompt;
    let callCount = 0;
    inquirer.prompt = async (questions) => {
      callCount++;
      if (callCount === 1) {
        return { useOllama: true };
      }
      return {
        baseUrl: "http://custom:11434",
        model: "custom",
        fallback: false,
      };
    };

    const { configureOllama, globalStore, origUpdate, origSave, saves } = createStubModules(tmpDir);
    try {
      await configureOllama();
      assert.equal(saves.length, 1, "ollama config should be saved atomically");
      assert.equal(saves[0]["COMMIAT_USE_OLLAMA"], "true");
      assert.equal(saves[0]["COMMIAT_OLLAMA_BASE_URL"], "http://custom:11434");
      assert.equal(saves[0]["COMMIAT_OLLAMA_MODEL"], "custom");
      assert.equal(saves[0]["COMMIAT_OLLAMA_FALLBACK_TO_OPENROUTER"], "false");
    } finally {
      inquirer.prompt = promptStub;
      restoreModules(globalStore, origUpdate, origSave);
    }
  } finally {
    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("selectModel handles API failure gracefully", async () => {
  const { selectModel } = require("../src/commands/modelSelect");
  const getStub = axios.get;
  axios.get = async () => { throw new Error("Network error"); };
  const promptStub = inquirer.prompt;
  inquirer.prompt = async () => ({ selected: "custom/model" });
  const originalLog = console.error;
  console.error = () => {};
  try {
    await selectModel();
    assert.ok(true, "selectModel must not throw on API failure");
  } finally {
    axios.get = getStub;
    inquirer.prompt = promptStub;
    console.error = originalLog;
  }
});

test("selectModel handles empty model list", async () => {
  const { selectModel } = require("../src/commands/modelSelect");
  const getStub = axios.get;
  axios.get = async () => ({ data: { data: [] } });
  const promptStub = inquirer.prompt;
  inquirer.prompt = async () => ({ selected: "custom/model" });
  const originalLog = console.log;
  console.log = () => {};
  try {
    await selectModel();
    assert.ok(true, "selectModel must not throw on empty model list");
  } finally {
    axios.get = getStub;
    inquirer.prompt = promptStub;
    console.log = originalLog;
  }
});

test("selectModel handles malformed model entries", async () => {
  const tmpDir = require("fs").mkdtempSync("/tmp/commiat-test-");
  try {
    const getStub = axios.get;
    axios.get = async () => ({
      data: {
        data: [
          { id: "valid/model", name: "Valid" },
          { id: "", name: "Empty id" },
          null,
          { name: "No id" },
        ],
      },
    });
    const promptStub = inquirer.prompt;
    inquirer.prompt = async () => ({ selected: "valid/model" });

    const { selectModel, globalStore, origUpdate, origSave, updates } = createStubModules(tmpDir);
    try {
      await selectModel();
      assert.equal(updates["COMMIAT_OPENROUTER_MODEL"], "valid/model");
    } finally {
      axios.get = getStub;
      inquirer.prompt = promptStub;
      restoreModules(globalStore, origUpdate, origSave);
    }
  } finally {
    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("configureOllama handles interrupted prompt gracefully", async () => {
  const tmpDir = require("fs").mkdtempSync("/tmp/commiat-test-");
  try {
    const promptStub = inquirer.prompt;
    inquirer.prompt = async () => { throw new Error("Prompt interrupted"); };

    const { configureOllama, globalStore, origUpdate, origSave, saves } = createStubModules(tmpDir);
    try {
      await configureOllama();
      assert.equal(saves.length, 0);
    } finally {
      inquirer.prompt = promptStub;
      restoreModules(globalStore, origUpdate, origSave);
    }
  } finally {
    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("selectModel handles interrupted prompt gracefully", async () => {
  const { selectModel } = require("../src/commands/modelSelect");
  const getStub = axios.get;
  axios.get = async () => ({
    data: { data: [{ id: "valid/model", name: "Valid" }] },
  });
  const promptStub = inquirer.prompt;
  inquirer.prompt = async () => { throw new Error("Prompt interrupted"); };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await selectModel();
    assert.ok(true, "selectModel must not throw on interrupted prompt");
  } finally {
    axios.get = getStub;
    inquirer.prompt = promptStub;
    console.warn = originalWarn;
  }
});

test("selectModel updates config when model selected", async () => {
  const tmpDir = require("fs").mkdtempSync("/tmp/commiat-test-");
  try {
    const getStub = axios.get;
    axios.get = async () => ({
      data: { data: [{ id: "custom/model", name: "Custom Model" }] },
    });
    const promptStub = inquirer.prompt;
    inquirer.prompt = async () => ({ selected: "custom/model" });

    const { selectModel, globalStore, origUpdate, origSave, updates } = createStubModules(tmpDir);
    try {
      await selectModel();
      assert.equal(updates["COMMIAT_OPENROUTER_MODEL"], "custom/model");
    } finally {
      axios.get = getStub;
      inquirer.prompt = promptStub;
      restoreModules(globalStore, origUpdate, origSave);
    }
  } finally {
    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("selectModel passes timeout option to axios.get", async () => {
  const { selectModel } = require("../src/commands/modelSelect");
  const getStub = axios.get;
  let capturedConfig;
  axios.get = async (_url, config) => {
    capturedConfig = config;
    return { data: { data: [] } };
  };
  const originalLog = console.log;
  console.log = () => {};
  try {
    await selectModel();
    assert.ok(capturedConfig?.timeout > 0);
  } finally {
    axios.get = getStub;
    console.log = originalLog;
  }
});
