import assert from "node:assert/strict";
import { test } from "node:test";
import { everyN, parseRanges } from "./tools.ts";

test("parseRanges", () => {
  assert.deepEqual(parseRanges("1-3, 5, 8-", 9), [[1, 2, 3], [5], [8, 9]]);
  assert.deepEqual(parseRanges("-2", 4), [[1, 2]]);
  assert.equal(parseRanges("3-1", 5), null);
  assert.equal(parseRanges("7", 5), null);
  assert.equal(parseRanges("a", 5), null);
  assert.equal(parseRanges(" , ", 5), null);
});

test("everyN", () => {
  assert.deepEqual(everyN(2, 5), [[1, 2], [3, 4], [5]]);
});
