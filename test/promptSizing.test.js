const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getMaxPromptChars,
  isLikelyContextLimitError,
  middleOutCompress,
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

test("getMaxPromptChars reads positive integer from env", () => {
  const key = "COMMIAT_MAX_PROMPT_CHARS";
  const before = process.env[key];
  process.env[key] = "50000";
  try {
    assert.equal(getMaxPromptChars(), 50000);
  } finally {
    if (before !== undefined) process.env[key] = before;
    else delete process.env[key];
  }
});

test("getMaxPromptChars returns default when env is zero", () => {
  const key = "COMMIAT_MAX_PROMPT_CHARS";
  const before = process.env[key];
  process.env[key] = "0";
  try {
    assert.equal(getMaxPromptChars(), 200000);
  } finally {
    if (before !== undefined) process.env[key] = before;
    else delete process.env[key];
  }
});

test("getMaxPromptChars returns default when env is negative", () => {
  const key = "COMMIAT_MAX_PROMPT_CHARS";
  const before = process.env[key];
  process.env[key] = "-100";
  try {
    assert.equal(getMaxPromptChars(), 200000);
  } finally {
    if (before !== undefined) process.env[key] = before;
    else delete process.env[key];
  }
});

test("getMaxPromptChars returns default when env is NaN", () => {
  const key = "COMMIAT_MAX_PROMPT_CHARS";
  const before = process.env[key];
  process.env[key] = "not-a-number";
  try {
    assert.equal(getMaxPromptChars(), 200000);
  } finally {
    if (before !== undefined) process.env[key] = before;
    else delete process.env[key];
  }
});

test("getMaxPromptChars floors fractional env values and applies minimum clamp", () => {
  const key = "COMMIAT_MAX_PROMPT_CHARS";
  const before = process.env[key];
  process.env[key] = "100.7";
  try {
    assert.equal(getMaxPromptChars(), 1000);
  } finally {
    if (before !== undefined) process.env[key] = before;
    else delete process.env[key];
  }
});

// -------------------------------------------------------------------------
// isLikelyContextLimitError
// -------------------------------------------------------------------------
test("isLikelyContextLimitError returns true for 'maximum context length'", () => {
  const err = { responseStatus: 400, responseData: { error: { message: "maximum context length exceeded" } } };
  assert.equal(isLikelyContextLimitError(err), true);
});

test("isLikelyContextLimitError returns true for 'context length'", () => {
  const err = { responseStatus: 400, responseData: { error: { message: "Context length too large" } } };
  assert.equal(isLikelyContextLimitError(err), true);
});

test("isLikelyContextLimitError returns true for 'too many tokens'", () => {
  const err = { responseStatus: 400, message: "too many tokens requested" };
  assert.equal(isLikelyContextLimitError(err), true);
});

test("isLikelyContextLimitError returns true for 'max tokens'", () => {
  const err = { responseStatus: 400, responseData: { error: { message: "max tokens is 4096" } } };
  assert.equal(isLikelyContextLimitError(err), true);
});

test("isLikelyContextLimitError returns true for 'requested about'", () => {
  const err = { responseStatus: 400, responseData: { error: { message: "you requested about 10000 tokens" } } };
  assert.equal(isLikelyContextLimitError(err), true);
});

test("isLikelyContextLimitError returns false for non-400 status", () => {
  const err = { responseStatus: 429, responseData: { error: { message: "too many tokens" } } };
  assert.equal(isLikelyContextLimitError(err), false);
});

test("isLikelyContextLimitError returns false for unrelated 400 error", () => {
  const err = { responseStatus: 400, responseData: { error: { message: "bad request: invalid model" } } };
  assert.equal(isLikelyContextLimitError(err), false);
});

test("isLikelyContextLimitError handles missing fields gracefully", () => {
  assert.equal(isLikelyContextLimitError({}), false);
  assert.equal(isLikelyContextLimitError(null), false);
  assert.equal(isLikelyContextLimitError(undefined), false);
});

test("isLikelyContextLimitError reads from both responseData and top-level message", () => {
  const err1 = { responseStatus: 400, responseData: { error: { message: "context length exceeded" } } };
  const err2 = { responseStatus: 400, message: "context length exceeded" };
  assert.equal(isLikelyContextLimitError(err1), true);
  assert.equal(isLikelyContextLimitError(err2), true);
});

// -------------------------------------------------------------------------
// middleOutCompress
// -------------------------------------------------------------------------
test("middleOutCompress returns text unchanged when within limit", () => {
  assert.equal(middleOutCompress("hello world", 100), "hello world");
});

test("middleOutCompress returns text unchanged when exactly at limit", () => {
  assert.equal(middleOutCompress("exactly", 7), "exactly");
});

test("middleOutCompress compresses long text with marker", () => {
  const long = "a".repeat(200) + "b".repeat(200);
  const result = middleOutCompress(long, 100);
  const marker = "\n... (prompt middle-out compressed) ...\n";
  assert.ok(result.includes(marker.trim()), "marker present");
  assert.ok(result.length <= 100);
  // Head of original should be preserved (60% of budget excluding marker)
  const budget = Math.max(0, 100 - marker.length);
  const headLen = Math.floor(budget * 0.6);
  const tailLen = Math.max(0, budget - headLen);
  assert.ok(result.startsWith("a".repeat(headLen)), "head preserved");
  assert.ok(result.endsWith("b".repeat(tailLen)), "tail preserved");
});

test("middleOutCompress handles empty string", () => {
  assert.equal(middleOutCompress("", 100), "");
});

test("middleOutCompress handles null input", () => {
  assert.equal(middleOutCompress(null, 100), "");
});

test("middleOutCompress handles undefined input", () => {
  assert.equal(middleOutCompress(undefined, 100), "");
});

test("middleOutCompress handles exact budget with short text", () => {
  assert.equal(middleOutCompress("short", 5), "short");
});

test("middleOutCompress handles very small budget", () => {
  const long = "hello world this is a test";
  const result = middleOutCompress(long, 20);
  // When maxChars is smaller than the compression marker, the result
  // is just the marker (no content head/tail can fit)
  const marker = "\n... (prompt middle-out compressed) ...\n";
  assert.equal(result, marker);
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
