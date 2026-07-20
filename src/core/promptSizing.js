function getMaxPromptChars() {
  const raw = process.env.COMMIAT_MAX_PROMPT_CHARS;
  if (raw === undefined || raw === null) return 200000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 200000;
  return Math.min(Math.max(Math.floor(n), 1000), 1000000);
}

function isLikelyContextLimitError(error) {
  if (!error) return false;
  const status = error?.responseStatus;
  if (status !== 400) return false;

  const msg = String(error?.responseData?.error?.message || error?.message || "")
    .toLowerCase();

  return (
    msg.includes("maximum context length") ||
    msg.includes("context length") ||
    msg.includes("too many tokens") ||
    msg.includes("max tokens") ||
    msg.includes("requested about")
  );
}

function middleOutCompress(text, maxChars) {
  const s = String(text ?? "");
  const budget = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 200000;
  if (s.length <= budget) return s;

  const marker = "\n... (prompt middle-out compressed) ...\n";
  const remaining = Math.max(0, budget - marker.length);
  const headLen = Math.floor(remaining * 0.6);
  const tailLen = Math.max(0, remaining - headLen);

  const head = s.slice(0, headLen);
  const tail = s.slice(s.length - tailLen);
  return `${head}${marker}${tail}`;
}

module.exports = {
  getMaxPromptChars,
  isLikelyContextLimitError,
  middleOutCompress,
};
