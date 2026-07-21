const test = require("node:test");
const assert = require("node:assert/strict");

const { validateMainOptions } = require("../src/commands/mainAction");

test("validateMainOptions accepts valid boolean flags", () => {
  assert.doesNotThrow(() =>
    validateMainOptions({
      addAll: true,
      multi: false,
      untracked: false,
      nonInteractive: true,
      verify: false,
    }),
  );
});

test("validateMainOptions rejects non-object options", () => {
  assert.throws(() => validateMainOptions(null), /Invalid options/);
  assert.throws(() => validateMainOptions("bad"), /Invalid options/);
});

test("validateMainOptions rejects non-boolean flag values", () => {
  assert.throws(
    () => validateMainOptions({ addAll: "yes" }),
    /--add-all must be a boolean/,
  );
  assert.throws(
    () => validateMainOptions({ multi: 1 }),
    /--multi must be a boolean/,
  );
  assert.throws(
    () => validateMainOptions({ untracked: "true" }),
    /--untracked must be a boolean/,
  );
  assert.throws(
    () => validateMainOptions({ nonInteractive: 0 }),
    /--non-interactive must be a boolean/,
  );
  assert.throws(
    () => validateMainOptions({ verify: "false" }),
    /--verify must be a boolean/,
  );
});
