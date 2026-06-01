const test = require("node:test");
const assert = require("node:assert/strict");

const { detectVariables } = require("../src/variables");

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
