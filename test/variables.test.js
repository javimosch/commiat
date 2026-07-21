const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectVariables,
  promptForMissingVariableDescriptions,
} = require("../src/variables");

test("detectVariables finds placeholders in format", () => {
  assert.deepEqual(detectVariables("{type}: {msg}"), ["type"]);
  assert.deepEqual(detectVariables("fix({module}): {desc}"), ["module", "desc"]);
  assert.deepEqual(detectVariables("no placeholders"), []);
  assert.deepEqual(detectVariables("{a}{b}{c}"), ["a", "b", "c"]);
});

test("detectVariables returns empty array for null input", () => {
  assert.deepEqual(detectVariables(null), []);
});

test("detectVariables returns empty array for undefined input", () => {
  assert.deepEqual(detectVariables(undefined), []);
});

test("detectVariables returns empty array for empty string", () => {
  assert.deepEqual(detectVariables(""), []);
});

test("detectVariables returns empty array for number input", () => {
  assert.deepEqual(detectVariables(123), []);
});

test("detectVariables returns empty array for object input", () => {
  assert.deepEqual(detectVariables({}), []);
});

test("detectVariables excludes unsafe placeholder names", () => {
  assert.deepEqual(detectVariables("{type}: {__proto__} {constructor}"), ["type"]);
});

test("promptForMissingVariableDescriptions skips prompts in non-interactive mode", async () => {
  const config = { format: "feat({scope}): {msg}", variables: {} };
  const result = await promptForMissingVariableDescriptions(["scope"], config, true);
  assert.equal(result, false);
  assert.equal(config.variables.scope, undefined);
});

test("getSystemVariableValues survives handler throw", async () => {
  const gitPath = require.resolve("../src/utils/git");
  const varsPath = require.resolve("../src/variables");
  const origGit = require(gitPath);
  require.cache[gitPath].exports = {
    ...origGit,
    getGitBranch: async () => {
      throw new Error("git boom");
    },
    getGitBranchNumber: async () => {
      throw new Error("number boom");
    },
  };
  delete require.cache[varsPath];
  const { getSystemVariableValues } = require("../src/variables");
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const values = await getSystemVariableValues();
    assert.equal(values.gitBranch, "");
    assert.equal(values.gitBranchNumber, "");
  } finally {
    console.warn = originalWarn;
    require.cache[gitPath].exports = origGit;
    delete require.cache[varsPath];
  }
});
