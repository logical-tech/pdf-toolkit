import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractP7m } from "./p7m.ts";

const dir = mkdtempSync(join(tmpdir(), "p7m-"));
const f = (name: string) => join(dir, name);
const openssl = (...args: string[]) => {
  const r = spawnSync("/usr/bin/openssl", args, { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
};
const sign = (input: string, output: string, ...opts: string[]) => {
  openssl("cms", "-sign", "-binary", "-in", f(input), "-signer", f("cert.pem"), "-inkey", f("key.pem"), "-out", f(output), ...opts);
  return new Uint8Array(readFileSync(f(output)));
};

// Large enough that -stream splits the content into several OCTET STRING chunks.
const pdf = new TextEncoder().encode("%PDF-1.4\n" + "x".repeat(5000) + "\n%%EOF\n");
writeFileSync(f("doc.pdf"), pdf);
openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", f("key.pem"), "-out", f("cert.pem"), "-days", "1", "-subj", "/CN=test");

test("DER, definite lengths", () => {
  const der = sign("doc.pdf", "der.p7m", "-nodetach", "-outform", "DER");
  assert.equal(der[1], 0x82);
  assert.deepEqual(extractP7m(der), pdf);
});

test("BER, indefinite lengths and chunked content", () => {
  const ber = sign("doc.pdf", "ber.p7m", "-nodetach", "-stream", "-outform", "DER");
  assert.equal(ber[1], 0x80);
  assert.deepEqual(extractP7m(ber), pdf);
});

test("PEM and bare base64", () => {
  const pem = sign("doc.pdf", "pem.p7m", "-nodetach", "-outform", "PEM");
  assert.match(new TextDecoder().decode(pem), /-----BEGIN/);
  assert.deepEqual(extractP7m(pem), pdf);
  const bare = new TextDecoder().decode(pem).replace(/-----[^-]+-----/g, "");
  assert.deepEqual(extractP7m(new TextEncoder().encode(bare)), pdf);
});

test("double-wrapped p7m", () => {
  sign("doc.pdf", "inner.p7m", "-nodetach", "-outform", "DER");
  assert.deepEqual(extractP7m(sign("inner.p7m", "outer.p7m", "-nodetach", "-stream", "-outform", "DER")), pdf);
});

test("errors", () => {
  assert.throws(() => extractP7m(sign("doc.pdf", "detached.p7m", "-outform", "DER")), /firma separata/);
  assert.throws(() => extractP7m(pdf), /non è una busta P7M/);
  assert.throws(() => extractP7m(new Uint8Array([0x30, 0x05, 0x06])), /non è una busta P7M/);
});
