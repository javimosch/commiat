const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseGroupsFromLlmResponse,
  normalizeMultiCommitGroups,
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

test("normalizeMultiCommitGroups skips empty groups and creates (Unassigned) group when needed", () => {
  const relevant = ["a.js", "b.js"];
  const raw = [{ group: "Empty", files: ["not-relevant.js"] }];
  const { groups, unassignedFiles } = normalizeMultiCommitGroups(raw, relevant);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].group, "(Unassigned)");
  assert.deepEqual(unassignedFiles.sort(), ["a.js", "b.js"]);
});
