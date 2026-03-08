function getMaxPromptChars() {
  const raw = process.env.COMMIAT_MAX_PROMPT_CHARS;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 200000;
}

function isLikelyContextLimitError(error) {
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
  if (s.length <= maxChars) return s;

  const marker = "\n... (prompt middle-out compressed) ...\n";
  const budget = Math.max(0, maxChars - marker.length);
  const headLen = Math.floor(budget * 0.6);
  const tailLen = Math.max(0, budget - headLen);

  const head = s.slice(0, headLen);
  const tail = s.slice(s.length - tailLen);
  return `${head}${marker}${tail}`;
}

module.exports = {
  getMaxPromptChars,
  isLikelyContextLimitError,
  middleOutCompress,
};
