import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DICTS } from "./i18n.ts";

const SRC = join(import.meta.dirname, "..");

/** Every Italian key passed to the translator. Writer files that also use model.ts's `t` import it as `tr`. */
export function sourceKeys(): Set<string> {
  const keys = new Set<string>();
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f) && !/\.test\.ts$|^locales|i18n\.ts$/.test(f));
  for (const f of files) {
    const code = readFileSync(join(SRC, f), "utf8");
    if (!/from "[^"]*i18n(\.ts)?"/.test(code)) continue;
    const fn = /\bt as tr\b/.test(code) ? "tr" : "t";
    for (const m of code.matchAll(new RegExp(`\\b${fn}\\(\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g"))) keys.add(JSON.parse(`"${m[1]}"`));
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every language translates every string, keeping its placeholders", () => {
  const keys = sourceKeys();
  assert.ok(keys.size > 100, `only ${keys.size} keys found`);
  for (const [lang, dict] of Object.entries(DICTS)) {
    const missing = [...keys].filter((k) => !(k in dict));
    assert.deepEqual(missing, [], `${lang}: missing translations`);
    for (const k of keys) assert.deepEqual(placeholders(dict[k]), placeholders(k), `${lang}: placeholders differ for "${k}"`);
  }
});
