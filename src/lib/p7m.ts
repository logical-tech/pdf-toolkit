// BER TLV: id is the identifier byte, content is b[start, end), the next sibling starts at `next`.
type Node = { id: number; cons: boolean; start: number; end: number; next: number };

const SIGNED_DATA = "42,134,72,134,247,13,1,7,2"; // OID 1.2.840.113549.1.7.2

function tlv(b: Uint8Array, p: number): Node {
  const id = b[p++];
  if ((id & 0x1f) === 0x1f) while (b[p++] & 0x80);
  const cons = (id & 0x20) !== 0;
  let len = b[p++];
  if (len === 0x80) {
    let q = p;
    while (b[q] !== 0 || b[q + 1] !== 0) {
      if (q >= b.length) throw new Error("P7M malformato.");
      q = tlv(b, q).next;
    }
    return { id, cons, start: p, end: q, next: q + 2 };
  }
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[p++];
  }
  if (!(p + len <= b.length)) throw new Error("P7M malformato.");
  return { id, cons, start: p, end: p + len, next: p + len };
}

function children(b: Uint8Array, n: Node): Node[] {
  const out: Node[] = [];
  for (let q = n.start; q < n.end; q = out[out.length - 1].next) out.push(tlv(b, q));
  return out;
}

// Signing tools often stream the content as a constructed OCTET STRING made of chunks.
function octets(b: Uint8Array, n: Node): Uint8Array {
  if (!n.cons) return b.subarray(n.start, n.end);
  const parts = children(b, n).map((c) => octets(b, c));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  parts.reduce((off, p) => (out.set(p, off), off + p.length), 0);
  return out;
}

function decode(b: Uint8Array): Uint8Array {
  if (b[0] === 0x30) return b;
  const text = new TextDecoder("latin1").decode(b).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return text && /^[A-Za-z0-9+/]+=*$/.test(text) ? Uint8Array.from(atob(text), (c) => c.charCodeAt(0)) : b;
}

// eContent of a CMS signedData, or null when b is not one.
function encapContent(b: Uint8Array): Uint8Array | null {
  let encap: Node[];
  try {
    const [type, body] = children(b, tlv(b, 0));
    if (type.id !== 0x06 || b.subarray(type.start, type.end).join() !== SIGNED_DATA || body.id !== 0xa0) return null;
    encap = children(b, children(b, children(b, body)[0])[2]);
  } catch {
    return null;
  }
  if (encap.length < 2) throw new Error("Il file P7M non contiene il documento (firma separata dal contenuto).");
  return octets(b, children(b, encap[1])[0]);
}

export function extractP7m(bytes: Uint8Array): Uint8Array {
  let out = encapContent(decode(bytes));
  if (!out) throw new Error("Il file non è una busta P7M firmata valida.");
  for (let inner; (inner = encapContent(decode(out))); ) out = inner;
  return out;
}
