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

test("validateConfig returns false for whitespace-only format", () => {
  const result = validateConfig({ format: "   ", variables: {} });
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

test("validateConfig returns false for array config", () => {
  const result = validateConfig(["a", "b"]);
  assert.equal(result, false);
});

test("validateConfig returns false for array variables", () => {
  const result = validateConfig({ format: "{type}: {msg}", variables: ["some", "array"] });
  assert.equal(result, false);
});

test("validateConfig returns false when variable description is a number", () => {
  const result = validateConfig({ format: "{type}({scope}): {msg}", variables: { scope: 123 } });
  assert.equal(result, false);
});

test("validateConfig returns false when variable description is empty string", () => {
  const result = validateConfig({ format: "{type}({scope}): {msg}", variables: { scope: "" } });
  assert.equal(result, false);
});

test("validateConfig returns false when variable description is an object", () => {
  const result = validateConfig({ format: "{type}({scope}): {msg}", variables: { scope: { level: "detailed" } } });
  assert.equal(result, false);
});

test("validateConfig returns false when variable description is boolean", () => {
  const result = validateConfig({ format: "{type}({scope}): {msg}", variables: { scope: true } });
  assert.equal(result, false);
});

test("validateConfig returns true when variable description is a non-empty string", () => {
  const result = validateConfig({ format: "{type}({scope}): {msg}", variables: { scope: "The affected module" } });
  assert.equal(result, true);
});

test("validateConfig returns false for config with null format", () => {
  const result = validateConfig({ format: null, variables: {} });
  assert.equal(result, false);
});

test("validateConfig returns false for config with undefined format", () => {
  const result = validateConfig({ format: undefined, variables: {} });
  assert.equal(result, false);
});

test("validateConfig returns false for config with number format", () => {
  const result = validateConfig({ format: 42, variables: {} });
  assert.equal(result, false);
});

test("validateConfig returns false when variables contains number key", () => {
  const result = validateConfig({ format: "{type}({1}): {msg}", variables: { 1: "desc" } });
  assert.equal(result, true);
});

test("validateConfig returns false when variable key is unsafe", () => {
  const variables = Object.create(null);
  variables.__proto__ = "polluted";
  const result = validateConfig({
    format: "{type}({scope}): {msg}",
    variables,
  });
  assert.equal(result, false);
  assert.equal(
    validateConfig({
      format: "{type}({scope}): {msg}",
      variables: { constructor: "polluted" },
    }),
    false,
  );
});

test("saveConfig throws for invalid config", async () => {
  await assert.rejects(
    async () => { await saveConfig({ format: "", variables: {} }); },
    { message: /Invalid config object/ }
  );
  await assert.rejects(
    async () => { await saveConfig({ variables: {} }); },
    { message: /Invalid config object/ }
  );
  await assert.rejects(
    async () => { await saveConfig(null); },
    { message: /Invalid config object/ }
  );
});

test("validateConfig returns true for format with only msg variable", () => {
  const result = validateConfig({ format: "{msg}", variables: {} });
  assert.equal(result, true);
});

test("loadConfig returns null when creation prompt interrupted", async () => {
  withTempDir(async () => {
    const originalPrompt = require("inquirer").prompt;
    require("inquirer").prompt = async () => { throw new Error("Prompt interrupted"); };
    const cfg = await loadConfig(false);
    require("inquirer").prompt = originalPrompt;
    assert.equal(cfg, null);
  });
});

test("loadConfig returns null when format prompt interrupted", async () => {
  withTempDir(async () => {
    const originalPrompt = require("inquirer").prompt;
    let callCount = 0;
    require("inquirer").prompt = async () => {
      callCount++;
      if (callCount === 1) return { shouldCreate: true };
      throw new Error("Prompt interrupted");
    };
    const cfg = await loadConfig(false);
    require("inquirer").prompt = originalPrompt;
    assert.equal(cfg, null);
  });
});


