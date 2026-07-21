/**
 * Utilities for multi-commit planning: parsing LLM JSON group output and
 * normalizing groups against a known set of relevant files.
 */

function dedupePreserveOrder(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function stripMarkdownCodeFences(text) {
  if (typeof text !== "string") return "";
  let out = text.trim();
  out = out.replace(/^```json\s*/i, "");
  out = out.replace(/^```\s*/i, "");
  out = out.replace(/```\s*$/i, "");
  return out.trim();
}

function extractFirstJsonArray(text) {
  if (typeof text !== "string") return null;
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  return match ? match[0] : null;
}

function validateGroupShape(group, index) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    throw new Error(`LLM group at index ${index} is not a valid object.`);
  }
  if (group.group !== undefined && typeof group.group !== "string") {
    throw new Error(
      `LLM group at index ${index} has invalid "group" field (expected string).`,
    );
  }
  if (group.description !== undefined && typeof group.description !== "string") {
    throw new Error(
      `LLM group at index ${index} has invalid "description" field (expected string).`,
    );
  }
  if (group.files !== undefined && !Array.isArray(group.files)) {
    throw new Error(
      `LLM group at index ${index} has invalid "files" field (expected array).`,
    );
  }
}

/**
 * Parse an LLM response into an array of group objects.
 * Accepts either a JSON array or a single JSON object (wrapped into an array).
 */
function parseGroupsFromLlmResponse(llmText) {
  const cleaned = stripMarkdownCodeFences(String(llmText ?? ""));
  const jsonCandidate = extractFirstJsonArray(cleaned) || cleaned;
  if (!jsonCandidate || jsonCandidate.trim() === "") {
    throw new Error(
      "LLM response was empty or contained no JSON array. Raw response: " + JSON.stringify(llmText),
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch (parseError) {
    throw new Error(
      `LLM returned invalid JSON. Raw response: ${JSON.stringify(llmText)}. Parse error: ${parseError.message}`,
    );
  }
  const groups = Array.isArray(parsed) ? parsed : [parsed];
  groups.forEach((group, index) => validateGroupShape(group, index));
  return groups;
}

/**
 * Normalizes raw group output:
 * - filters to relevant files
 * - resolves overlaps with first-group-wins
 * - drops empty groups
 * - appends a synthetic (Unassigned) group for any remaining files
 */
function normalizeMultiCommitGroups(rawGroups, relevantFiles) {
  if (relevantFiles != null && !Array.isArray(relevantFiles)) {
    throw new Error('relevantFiles must be an array of file paths.');
  }
  const relevantSet = new Set((relevantFiles || []).map((f) => String(f)));
  const assigned = new Set();
  const warnings = [];
  const groupsOut = [];

  const groups = Array.isArray(rawGroups) ? rawGroups : [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i] || {};
    const groupName =
      typeof g.group === "string" && g.group.trim().length > 0
        ? g.group.trim()
        : `Group ${i + 1}`;
    const description = typeof g.description === "string" ? g.description.trim() : "";

    const rawFiles = Array.isArray(g.files) ? g.files : [];
    const cleanedFiles = rawFiles
      .map((f) => String(f ?? "").trim())
      .filter((f) => f.length > 0);

    const inScope = dedupePreserveOrder(cleanedFiles).filter((f) => relevantSet.has(f));
    const kept = [];
    const droppedOverlaps = [];

    for (const f of inScope) {
      if (assigned.has(f)) {
        droppedOverlaps.push(f);
        continue;
      }
      assigned.add(f);
      kept.push(f);
    }

    if (droppedOverlaps.length > 0) {
      warnings.push(
        `Group "${groupName}" dropped ${droppedOverlaps.length} overlapping file(s) due to first-group-wins: ${droppedOverlaps.join(", ")}`,
      );
    }

    if (kept.length === 0) {
      warnings.push(`Group "${groupName}" has no remaining relevant files and will be skipped.`);
      continue;
    }

    groupsOut.push({ group: groupName, description, files: kept });
  }

  const unassignedFiles = (relevantFiles || []).map((f) => String(f)).filter((f) => !assigned.has(f));
  if (unassignedFiles.length > 0) {
    groupsOut.push({
      group: "(Unassigned)",
      description: "Files not assigned to any group by the AI.",
      files: unassignedFiles,
      isUnassigned: true,
    });
  }

  return { groups: groupsOut, warnings, unassignedFiles };
}

function sanitizeSelectedIndexes(indexes, groupCount) {
  if (!Array.isArray(indexes)) return [];
  const max = Number.isInteger(groupCount) && groupCount >= 0 ? groupCount : 0;
  const seen = new Set();
  const out = [];
  for (const raw of indexes) {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= max) continue;
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(i);
  }
  return out.sort((a, b) => a - b);
}

module.exports = {
  parseGroupsFromLlmResponse,
  normalizeMultiCommitGroups,
  extractFirstJsonArray,
  stripMarkdownCodeFences,
  sanitizeSelectedIndexes,
};
