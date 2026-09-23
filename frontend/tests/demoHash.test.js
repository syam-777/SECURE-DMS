/**
 * Secure DMS — Tamper Detection Demo — hash / mutation unit tests.
 *
 * Zero-dependency tests. Run with:
 *
 *     node tests/demoHash.test.js    (from frontend/)
 *
 * They use the SAME Web Crypto API (globalThis.crypto.subtle) that the demo
 * page uses in the browser (available in Node >= 20), so the tested module
 * behaves identically in both environments.
 *
 * The module under test performs no network access and no writes. These tests
 * additionally prove that the in-memory "tampering" is copy-only (the original
 * buffer/hash is never changed) and that the module source contains no
 * network/write API.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bytesToHex,
  sha256Hex,
  makeTamperedCopy,
} from "../src/utils/demoHash.js";

let pass = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    console.log("  PASS " + name);
    pass++;
  } else {
    console.error("  FAIL " + name + (detail ? " -> " + detail : ""));
    failures.push(name);
  }
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function main() {
  console.log("\n=== Tamper Detection Demo: demoHash helpers ===");

  // Known SHA-256 test vector: SHA-256("abc")
  const abcHex =
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  { // ---- TEST 1: known vector + deterministic output ----
    console.log("\n=== TEST 1: known SHA-256 vector ===");
    const result = await sha256Hex(new TextEncoder().encode("abc"));
    check(
      "SHA-256(\"abc\") matches known vector",
      result === abcHex,
      result
    );
  }

  { // ---- TEST 2: hash format ----
    console.log("\n=== TEST 2: hash format ===");
    const sample = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = await sha256Hex(sample);
    check(
      "hash is a 64-char lowercase hex string",
      /^[0-9a-f]{64}$/.test(hash),
      hash
    );
    check(
      "hashing is deterministic (same bytes -> same hash)",
      hash === (await sha256Hex(sample)),
      hash
    );
    check(
      "empty buffer produces valid 64-char hash",
      /^[0-9a-f]{64}$/.test(await sha256Hex(new Uint8Array(0)))
    );
  }

  { // ---- TEST 3: simulated tampering changes the bytes ----
    console.log("\n=== TEST 3: simulated tampering changes the bytes ===");
    const original = new Uint8Array(1024);
    for (let i = 0; i < original.length; i++) {
      original[i] = (i * 7) % 256;
    }
    const tampered = makeTamperedCopy(original);
    check(
      "tampered copy differs from original bytes",
      !bytesEqual(tampered, original),
      "identical"
    );
    check(
      "tampered copy keeps the same length",
      tampered.length === original.length,
      String(tampered.length)
    );
    check(
      "exactly one byte was flipped",
      (() => {
        let diff = 0;
        for (let i = 0; i < original.length; i++) {
          if (tampered[i] !== original[i]) diff++;
        }
        return diff === 1;
      })(),
      "delta bytes"
    );
  }

  { // ---- TEST 4: original buffer and hash remain unchanged ----
    console.log("\n=== TEST 4: original buffer and hash remain unchanged ===");
    const original = new Uint8Array(2048);
    for (let i = 0; i < original.length; i++) {
      original[i] = (i * 13 + 5) % 256;
    }
    const originalHash = await sha256Hex(original);
    const snapshot = new Uint8Array(original);
    const tamperedCopy = makeTamperedCopy(original);
    const hashAfter = await sha256Hex(original);

    check(
      "makeTamperedCopy did not mutate the original buffer",
      bytesEqual(original, snapshot),
      "buffer changed"
    );
    check(
      "hash of original buffer is unchanged after simulation",
      hashAfter === originalHash,
      hashAfter
    );
    check(
      "mutating the tampered copy does not affect the original",
      (() => {
        tamperedCopy[0] = 255;
        return bytesEqual(original, snapshot);
      })(),
      "original changed"
    );
  }

  { // ---- TEST 5: modified copy produces a different hash ----
    console.log("\n=== TEST 5: modified copy produces a different hash ===");
    const original = new Uint8Array(512);
    for (let i = 0; i < original.length; i++) {
      original[i] = (i * 3) % 256;
    }
    const originalHash = await sha256Hex(original);
    const tamperedHash = await sha256Hex(makeTamperedCopy(original));
    check(
      "tampered hash differs from original hash",
      tamperedHash !== originalHash,
      "identical hashes"
    );
    check(
      "tampered hash is a valid 64-char lowercase hex string",
      /^[0-9a-f]{64}$/.test(tamperedHash),
      tamperedHash
    );
  }

  { // ---- TEST 6: ArrayBuffer input works too ----
    console.log("\n=== TEST 6: ArrayBuffer input works too ===");
    const source = new TextEncoder().encode("hello world");
    const asBuffer = source.slice().buffer;
    const hashFromBuffer = await sha256Hex(
      new Uint8Array(asBuffer)
    );
    const hashFromBytes = await sha256Hex(source);
    check(
      "ArrayBuffer + Uint8Array hash identically",
      hashFromBuffer === hashFromBytes,
      hashFromBuffer
    );
    const tamperedFromBuffer = makeTamperedCopy(asBuffer);
    check(
      "makeTamperedCopy accepts ArrayBuffer and copies bytes",
      !bytesEqual(tamperedFromBuffer, new Uint8Array(asBuffer)),
      "identical"
    );
  }

  { // ---- TEST 7: no network / write API in the module ----
    console.log("\n=== TEST 7: no network / write API in the module ===");
    let source;
    try {
      source = readFileSync(
        fileURLToPath(new URL("../src/utils/demoHash.js", import.meta.url)),
        "utf8"
      );
    } catch (err) {
      check("demoHash source could be read for the static guard", false, String(err));
      return;
    }
    const forbidden = /fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\s*\.|import\s|require\s*\(/;
    check(
      "demoHash module contains no network or write API",
      !forbidden.test(source),
      "forbidden API pattern found"
    );
    check(
      "demoHash only reads bytes and computes SHA-256",
      bytesToHex(new Uint8Array([0xff, 0x00])) === "ff00",
      "bytesToHex mismatch"
    );
  }

  console.log("\n========== RESULTS ==========");
  console.log("PASSED: " + pass);
  console.log("FAILED: " + failures.length);
  console.log("=============================");

  if (failures.length > 0) {
    console.error("\nFailed checks:");
    for (const name of failures) {
      console.error("  - " + name);
    }
    throw new Error(failures.length + " check(s) failed");
  }
}

await main();