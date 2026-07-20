const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const inquirer = require("inquirer");

const GLOBAL_STORE_PATH = require.resolve("../src/core/globalStore");

function freshLeadPrompt(tmpDir) {
  delete require.cache[GLOBAL_STORE_PATH];
  process.env.GLOBAL_CONFIG_DIR = tmpDir;
  return require("../src/core/leadPrompt");
}

test("promptForLead ignores invalid lastPromptedAt timestamp", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-lead-"));
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "state"),
    "LEAD_PROMPTED_AT=not-a-number\n",
  );

  const promptStub = inquirer.prompt;
  let prompted = false;
  inquirer.prompt = async () => {
    prompted = true;
    return { interested: false };
  };

  const originalLog = console.log;
  console.log = () => {};

  try {
    const { promptForLead } = freshLeadPrompt(tmpDir);
    await promptForLead(false);
    assert.equal(prompted, true, "should prompt when timestamp is invalid");
  } finally {
    inquirer.prompt = promptStub;
    console.log = originalLog;
    delete require.cache[GLOBAL_STORE_PATH];
    delete process.env.GLOBAL_CONFIG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("promptForLead skips when prompted within one week", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-lead-"));
  fs.mkdirSync(tmpDir, { recursive: true });
  const recent = Date.now().toString();
  fs.writeFileSync(
    path.join(tmpDir, "state"),
    `LEAD_PROMPTED_AT=${recent}\n`,
  );

  const promptStub = inquirer.prompt;
  let prompted = false;
  inquirer.prompt = async () => {
    prompted = true;
    return { interested: false };
  };

  try {
    const { promptForLead } = freshLeadPrompt(tmpDir);
    await promptForLead(false);
    assert.equal(prompted, false, "should not prompt within one week");
  } finally {
    inquirer.prompt = promptStub;
    delete require.cache[GLOBAL_STORE_PATH];
    delete process.env.GLOBAL_CONFIG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("promptForLead is no-op in non-interactive mode", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-lead-"));
  const promptStub = inquirer.prompt;
  let prompted = false;
  inquirer.prompt = async () => {
    prompted = true;
    return { interested: false };
  };

  try {
    const { promptForLead } = freshLeadPrompt(tmpDir);
    await promptForLead(true);
    assert.equal(prompted, false);
  } finally {
    inquirer.prompt = promptStub;
    delete require.cache[GLOBAL_STORE_PATH];
    delete process.env.GLOBAL_CONFIG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("promptForLead trims email before webhook call", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-lead-"));
  fs.mkdirSync(tmpDir, { recursive: true });

  const axios = require("axios");
  const getStub = axios.get;
  let capturedUrl;
  axios.get = async (url) => {
    capturedUrl = url;
    return { status: 200 };
  };

  const promptStub = inquirer.prompt;
  let callCount = 0;
  inquirer.prompt = async () => {
    callCount++;
    if (callCount === 1) return { interested: true };
    return { email: "  user@example.com  " };
  };

  const originalLog = console.log;
  console.log = () => {};

  try {
    const { promptForLead } = freshLeadPrompt(tmpDir);
    await promptForLead(false);
    assert.ok(capturedUrl.includes("email=user%40example.com"));
    assert.ok(!capturedUrl.includes("%20user"));
  } finally {
    axios.get = getStub;
    inquirer.prompt = promptStub;
    console.log = originalLog;
    delete require.cache[GLOBAL_STORE_PATH];
    delete process.env.GLOBAL_CONFIG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("promptForLead survives saveState failure in finally block", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-lead-"));
  fs.mkdirSync(tmpDir, { recursive: true });

  const globalStore = require("../src/core/globalStore");
  const origSaveState = globalStore.saveState;
  globalStore.saveState = () => {
    throw new Error("disk full");
  };

  const promptStub = inquirer.prompt;
  inquirer.prompt = async () => ({ interested: false });

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    delete require.cache[GLOBAL_STORE_PATH];
    process.env.GLOBAL_CONFIG_DIR = tmpDir;
    const { promptForLead } = require("../src/core/leadPrompt");
    await promptForLead(false);
    assert.ok(true, "promptForLead must not throw when saveState fails");
  } finally {
    globalStore.saveState = origSaveState;
    inquirer.prompt = promptStub;
    console.log = originalLog;
    console.warn = originalWarn;
    delete require.cache[GLOBAL_STORE_PATH];
    delete require.cache[require.resolve("../src/core/leadPrompt")];
    delete process.env.GLOBAL_CONFIG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("promptForLead handles webhook failure gracefully", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-lead-"));
  fs.mkdirSync(tmpDir, { recursive: true });

  const axios = require("axios");
  const getStub = axios.get;
  axios.get = async () => {
    throw new Error("webhook down");
  };

  const promptStub = inquirer.prompt;
  let callCount = 0;
  inquirer.prompt = async () => {
    callCount++;
    if (callCount === 1) return { interested: true };
    return { email: "user@example.com" };
  };

  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};

  try {
    const { promptForLead } = freshLeadPrompt(tmpDir);
    await promptForLead(false);
    assert.ok(true, "promptForLead must not throw on webhook failure");
  } finally {
    axios.get = getStub;
    inquirer.prompt = promptStub;
    console.log = originalLog;
    console.warn = originalWarn;
    delete require.cache[GLOBAL_STORE_PATH];
    delete process.env.GLOBAL_CONFIG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
