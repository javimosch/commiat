const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadConfig, saveConfig, validateConfig } = require("../src/config");

function withTempDir(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "commiat-test-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(tmp);
    return fn(tmp);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("loadConfig returns null when file missing and nonInteractive", async () => {
  withTempDir(async () => {
    const cfg = await loadConfig(true);
    assert.equal(cfg, null);
  });
});

test("loadConfig creates default config when file missing and interactive", async () => {
  withTempDir(async () => {
    // Mock inquirer.prompt to return defaults
    const originalPrompt = require("inquirer").prompt;
    require("inquirer").prompt = async () => ({ shouldCreate: true, format: "{type}: {msg}" });
    const cfg = await loadConfig(false);
    require("inquirer").prompt = originalPrompt;
    assert.ok(cfg);
    assert.equal(cfg.format, "{type}: {msg}");
    assert.ok(fs.existsSync(".commiat"));
  });
});

test("saveConfig writes JSON file", () => {
  withTempDir(() => {
    const cfg = { format: "custom", variables: { comp: "component" } };
    saveConfig(cfg);
    assert.ok(fs.existsSync(".commiat"));
    const raw = fs.readFileSync(".commiat", "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.format, "custom");
    assert.equal(parsed.variables.comp, "component");
  });
});

test("validateConfig returns true for valid config", () => {
  const result = validateConfig({ format: "{type}: {msg}", variables: {} });
  assert.equal(result, true);
});

test("validateConfig returns false for missing format", () => {
  const result = validateConfig({ variables: {} });
  assert.equal(result, false);
});

test("validateConfig returns false for missing variables", () => {
  const result = validateConfig({ format: "{type}: {msg}" });
  assert.equal(result, false);
});

test("validateConfig returns false for empty format string", () => {
  const result = validateConfig({ format: "", variables: {} });
  assert.equal(result, false);
});

test("validateConfig returns false for null variables", () => {
  const result = validateConfig({ format: "{type}: {msg}", variables: null });
  assert.equal(result, false);
});

test("validateConfig returns false for null config", () => {
  const result = validateConfig(null);
  assert.equal(result, false);
});

test("validateConfig returns false for non-object config", () => {
  const result = validateConfig("invalid");
  assert.equal(result, false);
});
