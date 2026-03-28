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
