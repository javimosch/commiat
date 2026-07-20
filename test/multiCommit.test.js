const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseGroupsFromLlmResponse,
  normalizeMultiCommitGroups,
  extractFirstJsonArray,
} = require("../src/utils/multiCommit");

test("parseGroupsFromLlmResponse parses plain JSON array", () => {
  const txt = JSON.stringify([
    { group: "A", files: ["a.js"], description: "desc" },
    { group: "B", files: ["b.js"] },
  ]);
  const groups = parseGroupsFromLlmResponse(txt);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].group, "A");
});

test("parseGroupsFromLlmResponse tolerates markdown code fences", () => {
  const txt = "```json\n[{\"group\":\"A\",\"files\":[\"a.js\"]}]\n```";
  const groups = parseGroupsFromLlmResponse(txt);
  assert.deepEqual(groups, [{ group: "A", files: ["a.js"] }]);
});

test("parseGroupsFromLlmResponse extracts first JSON array from surrounding text", () => {
  const txt =
    "Sure! Here you go:\n[{\"group\":\"A\",\"files\":[\"a.js\"],\"description\":\"x\"}]\nThanks";
  const groups = parseGroupsFromLlmResponse(txt);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].group, "A");
});

test("parseGroupsFromLlmResponse throws on empty string", () => {
  assert.throws(
    () => parseGroupsFromLlmResponse(""),
    { message: /empty or contained no JSON array/ },
  );
});

test("parseGroupsFromLlmResponse throws on non-JSON response", () => {
  assert.throws(
    () => parseGroupsFromLlmResponse("This is just plain text from the LLM"),
    { message: /invalid JSON/ },
  );
});

test("parseGroupsFromLlmResponse throws on null input", () => {
  assert.throws(
    () => parseGroupsFromLlmResponse(null),
    { message: /empty or contained no JSON array/ },
  );
});

test("parseGroupsFromLlmResponse throws on invalid files field", () => {
  const txt = JSON.stringify([{ group: "A", files: "not-an-array" }]);
  assert.throws(
    () => parseGroupsFromLlmResponse(txt),
    { message: /invalid "files" field/ },
  );
});

test("parseGroupsFromLlmResponse throws on invalid group field", () => {
  const txt = JSON.stringify([{ group: 123, files: ["a.js"] }]);
  assert.throws(
    () => parseGroupsFromLlmResponse(txt),
    { message: /invalid "group" field/ },
  );
});

test("parseGroupsFromLlmResponse throws on invalid description field", () => {
  const txt = JSON.stringify([{ group: "A", description: 42, files: ["a.js"] }]);
  assert.throws(
    () => parseGroupsFromLlmResponse(txt),
    { message: /invalid "description" field/ },
  );
});

test("parseGroupsFromLlmResponse throws on non-object group entry", () => {
  assert.throws(
    () => parseGroupsFromLlmResponse("[null]"),
    { message: /not a valid object/ },
  );
});

test("normalizeMultiCommitGroups filters to relevant files, first-group-wins overlaps, and adds unassigned", () => {
  const relevant = ["a.js", "b.js", "c.js"];
  const raw = [
    { group: "G1", files: ["a.js", "b.js", "b.js"] },
    { group: "G2", files: ["b.js", "c.js", "not-relevant.js"] },
  ];

  const { groups, warnings, unassignedFiles } = normalizeMultiCommitGroups(raw, relevant);

  assert.deepEqual(groups[0].files, ["a.js", "b.js"]);
  assert.deepEqual(groups[1].files, ["c.js"]);
  assert.deepEqual(unassignedFiles, []);
  assert.ok(warnings.some((w) => w.includes("first-group-wins")));
});

test("extractFirstJsonArray returns the first JSON array substring from surrounding text", () => {
  const input = 'Prefix text [{"group":"A","files":["a.js"]}] suffix text';
  const result = extractFirstJsonArray(input);
  assert.equal(result, '[{"group":"A","files":["a.js"]}]');
});

test("extractFirstJsonArray returns null for non-string input", () => {
  assert.equal(extractFirstJsonArray(42), null);
  assert.equal(extractFirstJsonArray(null), null);
  assert.equal(extractFirstJsonArray({}), null);
});

test("normalizeMultiCommitGroups skips empty groups and creates (Unassigned) group when needed", () => {
  const relevant = ["a.js", "b.js"];
  const raw = [{ group: "Empty", files: ["not-relevant.js"] }];
  const { groups, unassignedFiles } = normalizeMultiCommitGroups(raw, relevant);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].group, "(Unassigned)");
  assert.deepEqual(unassignedFiles.sort(), ["a.js", "b.js"]);
});

test("normalizeMultiCommitGroups throws when relevantFiles is not an array", () => {
  assert.throws(
    () => normalizeMultiCommitGroups([], "not-an-array"),
    /relevantFiles must be an array/,
  );
});
