const test = require("node:test");
const assert = require("node:assert/strict");

const { detectVariables } = require("../src/variables");

test("detectVariables finds placeholders in format", () => {
  assert.deepEqual(detectVariables("{type}: {msg}"), ["type"]);
  assert.deepEqual(detectVariables("fix({module}): {desc}"), ["module", "desc"]);
  assert.deepEqual(detectVariables("no placeholders"), []);
  assert.deepEqual(detectVariables("{a}{b}{c}"), ["a", "b", "c"]);
});
