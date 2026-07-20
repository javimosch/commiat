const test = require("node:test");
const assert = require("node:assert/strict");

const { promptUser } = require("../src/core/userPrompts");

test("promptUser returns trimmed message in non-interactive mode", async () => {
  const originalLog = console.log;
  console.log = () => {};
  try {
    const result = await promptUser("  feat: add feature  ", true);
    assert.equal(result, "feat: add feature");
  } finally {
    console.log = originalLog;
  }
});

test("promptUser returns null for non-string input", async () => {
  assert.equal(await promptUser(null, true), null);
  assert.equal(await promptUser(undefined, true), null);
  assert.equal(await promptUser(42, true), null);
});

test("promptUser returns null for empty or whitespace-only message", async () => {
  assert.equal(await promptUser("", true), null);
  assert.equal(await promptUser("   ", true), null);
});
