/**
 * Secure DMS — Tamper Detection Demo helpers.
 *
 * Pure, dependency-free functions used by the in-browser demo page AND its
 * unit test. They perform ZERO network access and ZERO writes: they only read
 * the bytes handed to them, so the demo never modifies, re-uploads, or
 * otherwise touches the stored document or its checksum.
 *
 * The same Web Crypto API (globalThis.crypto.subtle) is available in modern
 * browsers and in Node >= 20, which is why the module (and its test) run
 * identically in both environments.
 */

/**
 * Encode bytes as a lowercase hex string.
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {string} lowercase hex, e.g. "ba7816bf..."
 */
export function bytesToHex(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * SHA-256 digest of the given bytes (Uint8Array or ArrayBuffer) as hex.
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {Promise<string>} 64-char lowercase hex digest
 */
export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Return an in-memory COPY of the bytes with exactly one byte flipped
 * (the last byte XOR 0xFF). The caller's buffer is never mutated. A single
 * altered byte is enough to demonstrate the avalanche effect of SHA-256:
 * the digest of the copy is completely different from the original.
 *
 * @param {Uint8Array|ArrayBuffer} bytes the original bytes (never changed)
 * @returns {Uint8Array} a fresh copy with one byte modified
 */
export function makeTamperedCopy(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(source);
  if (copy.length > 0) {
    copy[copy.length - 1] = copy[copy.length - 1] ^ 0xff;
  }
  return copy;
}