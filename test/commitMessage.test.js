const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyPrefixAffixToMessage,
  substituteVariablesInMessage,
} = require("../src/core/commitMessage");

test("applyPrefixAffixToMessage adds prefix and affix to first line", () => {
  const msg = "feat: add feature\n\nBody";
  const out = applyPrefixAffixToMessage(msg, { prefix: "[WIP]", affix: "(#123)" });
  assert.equal(out, "[WIP] feat: add feature (#123)\n\nBody");
});

test("applyPrefixAffixToMessage handles missing prefix/affix", () => {
  const msg = "chore: update";
  assert.equal(applyPrefixAffixToMessage(msg, {}), "chore: update");
  assert.equal(applyPrefixAffixToMessage(msg, { prefix: "pre" }), "pre chore: update");
  assert.equal(applyPrefixAffixToMessage(msg, { affix: "post" }), "chore: update post");
});

test("substituteVariablesInMessage replaces placeholders", () => {
  const msg = "fix: fix {component} in {repo}";
  const vals = { component: "auth", repo: "myapp" };
  assert.equal(substituteVariablesInMessage(msg, vals), "fix: fix auth in myapp");
});

test("substituteVariablesInMessage ignores missing placeholders", () => {
  const msg = "feat: add {feature} to {module}";
  const vals = { feature: "login" };
  assert.equal(substituteVariablesInMessage(msg, vals), "feat: add login to {module}");
});

test("substituteVariablesInMessage handles null message gracefully", () => {
  assert.equal(substituteVariablesInMessage(null, {}), "");
});

test("substituteVariablesInMessage handles undefined message gracefully", () => {
  assert.equal(substituteVariablesInMessage(undefined, {}), "");
});

test("substituteVariablesInMessage handles empty message", () => {
  assert.equal(substituteVariablesInMessage("", { foo: "bar" }), "");
});

test("substituteVariablesInMessage handles non-string message", () => {
  assert.equal(substituteVariablesInMessage(42, {}), "42");
  assert.equal(substituteVariablesInMessage(true, {}), "true");
  assert.equal(substituteVariablesInMessage({}, {}), "[object Object]");
});

test("substituteVariablesInMessage handles null values", () => {
  const msg = "fix: handle {arg}";
  const vals = { arg: null };
  assert.equal(substituteVariablesInMessage(msg, vals), "fix: handle null");
});

test("substituteVariablesInMessage handles multiple consecutive placeholders", () => {
  const msg = "feat({a}{b}{c}): initial";
  const vals = { a: "x", b: "y", c: "z" };
  assert.equal(substituteVariablesInMessage(msg, vals), "feat(xyz): initial");
});

test("applyPrefixAffixToMessage handles null message", () => {
  assert.equal(applyPrefixAffixToMessage(null, { prefix: "[WIP]" }), "");
});

test("applyPrefixAffixToMessage handles empty message", () => {
  assert.equal(applyPrefixAffixToMessage("", { prefix: "[WIP]", affix: "(#1)" }), "");
});

test("applyPrefixAffixToMessage handles null options", () => {
  const msg = "feat: add feature";
  assert.equal(applyPrefixAffixToMessage(msg, null), "feat: add feature");
});
