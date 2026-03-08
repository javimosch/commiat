const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isLikelyContextLimitError,
  middleOutCompress,
} = require("../src/core/promptSizing");

test("isLikelyContextLimitError detects OpenRouter max context length error", () => {
  const err = {
    responseStatus: 400,
    responseData: {
      error: {
        message:
          "This endpoint's maximum context length is 262144 tokens. However, you requested about 272739 tokens (272739 of text input). Please reduce the length.",
      },
    },
  };

  assert.equal(isLikelyContextLimitError(err), true);
});

test("middleOutCompress keeps head and tail under max chars", () => {
  const s = "a".repeat(1000);
  const out = middleOutCompress(s, 200);
  assert.ok(out.length <= 200);
  assert.ok(out.includes("middle-out"));
});
