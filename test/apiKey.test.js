const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const inquirer = require("inquirer");

const PROJECT_SRC = path.join(__dirname, "..", "src");

function clearProjectCache() {
  for (const key of Object.keys(require.cache).filter((k) => k.startsWith(PROJECT_SRC))) {
    delete require.cache[key];
  }
}

async function withTempGlobalConfig(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-apikey-"));
  const prev = process.env.GLOBAL_CONFIG_DIR;
  process.env.GLOBAL_CONFIG_DIR = tmp;
  clearProjectCache();
  try {
    return await fn(tmp);
  } finally {
    if (prev === undefined) delete process.env.GLOBAL_CONFIG_DIR;
    else process.env.GLOBAL_CONFIG_DIR = prev;
    clearProjectCache();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("getApiKey returns env key when set", async () => {
  await withTempGlobalConfig(async () => {
    const { getApiKey } = require("../src/core/apiKey");
    const prev = process.env.COMMIAT_OPENROUTER_API_KEY;
    process.env.COMMIAT_OPENROUTER_API_KEY = "  sk-test-key  ";
    try {
      const key = await getApiKey(false, true);
      assert.equal(key, "sk-test-key");
    } finally {
      if (prev === undefined) delete process.env.COMMIAT_OPENROUTER_API_KEY;
      else process.env.COMMIAT_OPENROUTER_API_KEY = prev;
    }
  });
});

test("getApiKey ignores invalid non-string config value", async () => {
  await withTempGlobalConfig(async () => {
    const globalStore = require("../src/core/globalStore");
    const origLoad = globalStore.loadGlobalConfig;
    globalStore.loadGlobalConfig = () => ({ COMMIAT_OPENROUTER_API_KEY: 123 });
    clearProjectCache();
    const { getApiKey } = require("../src/core/apiKey");

    const prevEnv = process.env.COMMIAT_OPENROUTER_API_KEY;
    delete process.env.COMMIAT_OPENROUTER_API_KEY;
    const warnStub = console.warn;
    console.warn = () => {};
    try {
      const key = await getApiKey(false, true);
      assert.equal(key, null);
    } finally {
      globalStore.loadGlobalConfig = origLoad;
      console.warn = warnStub;
      if (prevEnv === undefined) delete process.env.COMMIAT_OPENROUTER_API_KEY;
      else process.env.COMMIAT_OPENROUTER_API_KEY = prevEnv;
    }
  });
});

test("promptForApiKey returns null when prompt is interrupted", async () => {
  await withTempGlobalConfig(async () => {
    const { getApiKey } = require("../src/core/apiKey");
    const prevEnv = process.env.COMMIAT_OPENROUTER_API_KEY;
    delete process.env.COMMIAT_OPENROUTER_API_KEY;
    const promptStub = inquirer.prompt;
    inquirer.prompt = async () => {
      throw new Error("Prompt interrupted");
    };
    const errStub = console.error;
    console.error = () => {};
    try {
      const key = await getApiKey(true, false);
      assert.equal(key, null);
    } finally {
      inquirer.prompt = promptStub;
      console.error = errStub;
      if (prevEnv === undefined) delete process.env.COMMIAT_OPENROUTER_API_KEY;
      else process.env.COMMIAT_OPENROUTER_API_KEY = prevEnv;
    }
  });
});
