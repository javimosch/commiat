const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isLikelyContextLimitError,
  middleOutCompress,
  getMaxPromptChars,
} = require("../src/core/promptSizing");

test("getMaxPromptChars returns default on missing env", () => {
  const prev = process.env.COMMIAT_MAX_PROMPT_CHARS;
  delete process.env.COMMIAT_MAX_PROMPT_CHARS;
  try {
    assert.equal(getMaxPromptChars(), 200000);
  } finally {
    if (prev !== undefined) process.env.COMMIAT_MAX_PROMPT_CHARS = prev;
  }
});

test("getMaxPromptChars returns parsed number from env", () => {
  const prev = process.env.COMMIAT_MAX_PROMPT_CHARS;
  process.env.COMMIAT_MAX_PROMPT_CHARS = "50000";
  try {
    assert.equal(getMaxPromptChars(), 50000);
  } finally {
    if (prev !== undefined) process.env.COMMIAT_MAX_PROMPT_CHARS = prev;
  }
});

test("getMaxPromptChars ignores non-numeric env values", () => {
  const prev = process.env.COMMIAT_MAX_PROMPT_CHARS;
  process.env.COMMIAT_MAX_PROMPT_CHARS = "not-a-number";
  try {
    assert.equal(getMaxPromptChars(), 200000);
  } finally {
    if (prev !== undefined) process.env.COMMIAT_MAX_PROMPT_CHARS = prev;
  }
});

test("isLikelyContextLimitError returns false for null error", () => {
  assert.equal(isLikelyContextLimitError(null), false);
});

test("isLikelyContextLimitError returns false for undefined error", () => {
  assert.equal(isLikelyContextLimitError(undefined), false);
});

test("isLikelyContextLimitError returns false for non-context 400 error", () => {
  const err = {
    responseStatus: 400,
    message: "Bad request - invalid input",
  };
  assert.equal(isLikelyContextLimitError(err), false);
});

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

test("middleOutCompress returns empty string for null input", () => {
  assert.equal(middleOutCompress(null, 100), "");
});

test("middleOutCompress returns empty string for undefined input", () => {
  assert.equal(middleOutCompress(undefined, 100), "");
});

test("middleOutCompress returns full text when under max chars", () => {
  const s = "short text";
  assert.equal(middleOutCompress(s, 100), s);
});
