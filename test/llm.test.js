const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const { CONFIG_KEY_API_KEY } = require("../src/core/constants");
const {
  callOllamaApi,
  callOpenRouterApi,
  callOpenRouterWithPromptSizing,
  formatOpenRouterErrorForCli,
} = require("../src/core/llm");
const { isLikelyContextLimitError, middleOutCompress } = require("../src/core/promptSizing");

test("callOllamaApi enhances error with metadata", async () => {
  const postStub = axios.post;
  axios.post = async () => {
    const err = new Error("Network error");
    err.code = "ECONNREFUSED";
    err.request = {}; // Ensure .request exists so isNetworkError becomes true
    throw err;
  };
  try {
    await callOllamaApi("prompt", { baseUrl: "http://localhost:11434", model: "llama3" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.equal(e.provider, "ollama");
    assert.ok(e.requestUrl?.includes("11434"));
    assert.equal(e.isNetworkError, true);
  } finally {
    axios.post = postStub;
  }
});

test("callOpenRouterApi enhances error with metadata", async () => {
  const prevKey = process.env[CONFIG_KEY_API_KEY];
  process.env[CONFIG_KEY_API_KEY] = "test-key";
  const postStub = axios.post;
  axios.post = async () => {
    const err = new Error("Unauthorized");
    err.response = { status: 401 };
    throw err;
  };
  try {
    await callOpenRouterApi("prompt", { model: "test" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.equal(e.provider, "openrouter");
    assert.equal(e.responseStatus, 401);
    assert.equal(e.isAuthenticationError, true);
  } finally {
    axios.post = postStub;
    if (prevKey === undefined) delete process.env[CONFIG_KEY_API_KEY];
    else process.env[CONFIG_KEY_API_KEY] = prevKey;
  }
});

test("callOpenRouterApi prefers provider message and request id", async () => {
  const prevKey = process.env[CONFIG_KEY_API_KEY];
  process.env[CONFIG_KEY_API_KEY] = "test-key";

  const postStub = axios.post;
  axios.post = async () => {
    const err = new Error("Request failed with status code 429");
    err.response = {
      status: 429,
      data: { error: { message: "You exceeded your quota", code: "rate_limit" } },
      headers: { "x-request-id": "req_123" },
    };
    throw err;
  };

  try {
    await callOpenRouterApi("prompt", { model: "test" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.equal(e.provider, "openrouter");
    assert.equal(e.responseStatus, 429);
    assert.equal(e.providerMessage, "You exceeded your quota");
    assert.equal(e.providerCode, "rate_limit");
    assert.equal(e.requestId, "req_123");
    assert.equal(e.isRateLimitError, true);
    assert.equal(e.message, "You exceeded your quota");
    assert.equal(
      formatOpenRouterErrorForCli(e),
      "OpenRouter request failed (Status: 429): You exceeded your quota [request_id: req_123]",
    );
  } finally {
    axios.post = postStub;
    if (prevKey === undefined) delete process.env[CONFIG_KEY_API_KEY];
    else process.env[CONFIG_KEY_API_KEY] = prevKey;
  }
});

test("callOpenRouterWithPromptSizing retries on context limit error", async () => {
  const prevKey = process.env[CONFIG_KEY_API_KEY];
  process.env[CONFIG_KEY_API_KEY] = "test-key";
  const postStub = axios.post;
  let attempts = 0;
  axios.post = async (_, data) => {
    attempts++;
    if (attempts === 1) {
      const err = new Error("Context length exceeded");
      err.response = { status: 400 };
      err.responseData = { error: { message: "maximum context length" } };
      throw err;
    }
    return { data: { choices: [{ message: { content: "ok" } }] } };
  };
  try {
    const out = await callOpenRouterWithPromptSizing("a".repeat(300000), { model: "test" });
    assert.equal(out, "ok");
    assert.ok(attempts > 1);
  } finally {
    axios.post = postStub;
    if (prevKey === undefined) delete process.env[CONFIG_KEY_API_KEY];
    else process.env[CONFIG_KEY_API_KEY] = prevKey;
  }
});

test("callOllamaApi handles error thrown as string (non-Error)", async () => {
  const postStub = axios.post;
  axios.post = async () => {
    throw "string error";
  };
  try {
    await callOllamaApi("prompt", { baseUrl: "http://localhost:11434", model: "llama3" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.equal(e.provider, "ollama");
    // Non-Error thrown should still result in an error-like object
    assert.ok(e instanceof Error || e.message);
  } finally {
    axios.post = postStub;
  }
});

test("callOllamaApi handles missing baseUrl gracefully", async () => {
  const postStub = axios.post;
  axios.post = async () => {
    const err = new Error("ECONNREFUSED");
    err.code = "ECONNREFUSED";
    err.request = {};
    throw err;
  };
  try {
    await callOllamaApi("prompt", { model: "llama3" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.equal(e.provider, "ollama");
    assert.ok(e.message);
  } finally {
    axios.post = postStub;
  }
});

test("callOpenRouterApi handles error thrown as null", async () => {
  const prevKey = process.env[CONFIG_KEY_API_KEY];
  process.env[CONFIG_KEY_API_KEY] = "test-key";
  const postStub = axios.post;
  axios.post = async () => {
    throw null;
  };
  try {
    await callOpenRouterApi("prompt", { model: "test" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.equal(e.provider, "openrouter");
    assert.ok(e);
  } finally {
    axios.post = postStub;
    if (prevKey === undefined) delete process.env[CONFIG_KEY_API_KEY];
    else process.env[CONFIG_KEY_API_KEY] = prevKey;
  }
});

test("formatOpenRouterErrorForCli handles error with no properties", () => {
  const err = new Error("generic");
  const out = formatOpenRouterErrorForCli(err);
  assert.ok(out.includes("generic"));
});

test("formatOpenRouterErrorForCli handles null error", () => {
  const out = formatOpenRouterErrorForCli(null);
  assert.ok(typeof out === "string");
});

test("callOpenRouterWithPromptSizing handles empty prompt", async () => {
  const prevKey = process.env[CONFIG_KEY_API_KEY];
  process.env[CONFIG_KEY_API_KEY] = "test-key";
  const postStub = axios.post;
  axios.post = async () => {
    return { data: { choices: [{ message: { content: "ok" } }] } };
  };
  try {
    const out = await callOpenRouterWithPromptSizing("", { model: "test" });
    assert.equal(out, "ok");
  } finally {
    axios.post = postStub;
    if (prevKey === undefined) delete process.env[CONFIG_KEY_API_KEY];
    else process.env[CONFIG_KEY_API_KEY] = prevKey;
  }
});

test("callOllamaApi rejects response with empty content", async () => {
  const postStub = axios.post;
  axios.post = async () => ({
    data: { message: { content: "   " } },
  });
  try {
    await callOllamaApi("prompt", { baseUrl: "http://localhost:11434", model: "llama3" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.match(e.message, /Invalid Ollama API response structure/);
  } finally {
    axios.post = postStub;
  }
});

test("callOpenRouterApi rejects response with missing content", async () => {
  const prevKey = process.env[CONFIG_KEY_API_KEY];
  process.env[CONFIG_KEY_API_KEY] = "test-key";
  const postStub = axios.post;
  axios.post = async () => ({
    data: { choices: [{ message: {} }] },
  });
  try {
    await callOpenRouterApi("prompt", { model: "test" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.match(e.message, /Invalid OpenRouter API response structure/);
  } finally {
    axios.post = postStub;
    if (prevKey === undefined) delete process.env[CONFIG_KEY_API_KEY];
    else process.env[CONFIG_KEY_API_KEY] = prevKey;
  }
});

test("callOpenRouterWithPromptSizing uses middleOutCompress", async () => {
  const prevKey = process.env[CONFIG_KEY_API_KEY];
  process.env[CONFIG_KEY_API_KEY] = "test-key";
  const postStub = axios.post;
  let capturedPrompt;
  axios.post = async (_, data) => {
    capturedPrompt = data.messages[0].content;
    return { data: { choices: [{ message: { content: "ok" } }] } };
  };
  try {
    await callOpenRouterWithPromptSizing("a".repeat(300000), { model: "test" });
    assert.ok(capturedPrompt.length < 300000);
    assert.ok(capturedPrompt.includes("middle-out"));
  } finally {
    axios.post = postStub;
    if (prevKey === undefined) delete process.env[CONFIG_KEY_API_KEY];
    else process.env[CONFIG_KEY_API_KEY] = prevKey;
  }
});
