const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_LLM_HTTP_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL_LIST_HTTP_TIMEOUT_MS = 30_000;
const ENV_KEY_HTTP_TIMEOUT_MS = "COMMIAT_HTTP_TIMEOUT_MS";

const DEFAULT_OPENROUTER_MODEL = "xiaomi/mimo-v2-flash";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3";
const DEFAULT_CONVENTIONAL_FORMAT = "{type}: {msg}";

const CONFIG_KEY_API_KEY = "COMMIAT_OPENROUTER_API_KEY";
const CONFIG_KEY_OPENROUTER_MODEL = "COMMIAT_OPENROUTER_MODEL";
const CONFIG_KEY_USE_OLLAMA = "COMMIAT_USE_OLLAMA";
const CONFIG_KEY_OLLAMA_BASE_URL = "COMMIAT_OLLAMA_BASE_URL";
const CONFIG_KEY_OLLAMA_MODEL = "COMMIAT_OLLAMA_MODEL";
const CONFIG_KEY_OLLAMA_FALLBACK = "COMMIAT_OLLAMA_FALLBACK_TO_OPENROUTER";
const CONFIG_KEY_DEFAULT_MULTI = "COMMIAT_DEFAULT_MULTI";

const STATE_KEY_LEAD_PROMPTED = "LEAD_PROMPTED";
const STATE_KEY_LEAD_PROMPTED_AT = "LEAD_PROMPTED_AT";
const STATE_KEY_LEAD_PROMPTED_SUCCESS = "LEAD_PROMPTED_SUCCESS";

function parsePositiveInt(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLlmHttpTimeoutMs() {
  return parsePositiveInt(process.env[ENV_KEY_HTTP_TIMEOUT_MS], DEFAULT_LLM_HTTP_TIMEOUT_MS);
}

function getModelListHttpTimeoutMs() {
  return DEFAULT_MODEL_LIST_HTTP_TIMEOUT_MS;
}

function isAxiosTimeoutError(error) {
  if (!error || typeof error !== "object") return false;
  if (error.code === "ECONNABORTED") return true;
  return /timeout/i.test(String(error.message ?? ""));
}

module.exports = Object.freeze({
  OPENROUTER_API_URL,
  DEFAULT_LLM_HTTP_TIMEOUT_MS,
  DEFAULT_MODEL_LIST_HTTP_TIMEOUT_MS,
  ENV_KEY_HTTP_TIMEOUT_MS,
  getLlmHttpTimeoutMs,
  getModelListHttpTimeoutMs,
  isAxiosTimeoutError,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_CONVENTIONAL_FORMAT,
  CONFIG_KEY_API_KEY,
  CONFIG_KEY_OPENROUTER_MODEL,
  CONFIG_KEY_USE_OLLAMA,
  CONFIG_KEY_OLLAMA_BASE_URL,
  CONFIG_KEY_OLLAMA_MODEL,
  CONFIG_KEY_OLLAMA_FALLBACK,
  CONFIG_KEY_DEFAULT_MULTI,
  STATE_KEY_LEAD_PROMPTED,
  STATE_KEY_LEAD_PROMPTED_AT,
  STATE_KEY_LEAD_PROMPTED_SUCCESS,
});
