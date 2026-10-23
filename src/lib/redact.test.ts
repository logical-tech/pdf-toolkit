import assert from "node:assert/strict";
import { test } from "node:test";
import { findRanges } from "./redact.ts";

const found = (text: string, query: string, ...p: Parameters<typeof findRanges>[2]) => findRanges(text, query, p).map(([a, b]) => text.slice(a, b));

test("finds Italian personal data by shape", () => {
  assert.deepEqual(found("CF: RSSMRA85T10A562S, nato a Roma", "", "cf"), ["RSSMRA85T10A562S"]);
  assert.deepEqual(found("P.IVA IT01234567890", "", "piva"), ["IT01234567890"]);
  assert.deepEqual(found("IBAN IT60 X054 2811 1010 0000 0123 456 grazie", "", "iban"), ["IT60 X054 2811 1010 0000 0123 456"]);
  assert.deepEqual(found("scrivi a mario.rossi+pdf@esempio.it.", "", "email"), ["mario.rossi+pdf@esempio.it"]);
  assert.deepEqual(found("tel. +39 333 123 4567 o 06 1234 5678", "", "phone"), ["+39 333 123 4567", "06 1234 5678"]);
});

test("free text matches any case and is not a regex", () => {
  assert.deepEqual(found("Mario Rossi e MARIO ROSSI", "mario rossi"), ["Mario Rossi", "MARIO ROSSI"]);
  assert.deepEqual(found("costo (a+b)", "(a+b)"), ["(a+b)"]);
  assert.deepEqual(found("niente", "  "), []);
});

test("ordinary words are not taken for an IBAN or a fiscal code", () => {
  assert.deepEqual(found("Il contratto è valido dal 2024 per ARTICOLO DODICESIMO", "", "iban", "cf"), []);
});
