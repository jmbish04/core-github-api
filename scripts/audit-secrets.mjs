#!/usr/bin/env node
/**
 * secrets:audit — Compare wrangler.jsonc secrets_store_secrets against the live Cloudflare Secrets Store.
 *
 * Usage:
 *   pnpm run secrets:audit          # audit using wrangler.jsonc in project root
 *   node scripts/audit-secrets.mjs  # same thing
 *
 * Exit codes:
 *   0 = all secrets present
 *   1 = one or more secrets missing
 *
 * Works for any Cloudflare Worker that uses secrets_store_secrets in wrangler.jsonc.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 1. Parse wrangler.jsonc ──────────────────────────────────────────────────

/**
 * Strip JSONC comments without breaking strings that contain // (e.g. URLs).
 * Walks character-by-character to respect string boundaries.
 */
function stripJsonComments(text) {
  let result = "";
  let i = 0;
  const len = text.length;

  while (i < len) {
    // String literal — copy verbatim
    if (text[i] === '"') {
      let j = i + 1;
      while (j < len && text[j] !== '"') {
        if (text[j] === "\\") j++; // skip escaped char
        j++;
      }
      result += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // Line comment
    if (text[i] === "/" && text[i + 1] === "/") {
      while (i < len && text[i] !== "\n") i++;
      continue;
    }

    // Block comment
    if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < len && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    result += text[i];
    i++;
  }

  return result;
}

const wranglerPath = resolve(process.cwd(), "wrangler.jsonc");
let raw;
try {
  raw = readFileSync(wranglerPath, "utf-8");
} catch {
  console.error("❌  Could not read wrangler.jsonc at", wranglerPath);
  process.exit(1);
}

// Strip comments then remove trailing commas before } or ]
const json = stripJsonComments(raw).replace(/,\s*([}\]])/g, "$1");

let config;
try {
  config = JSON.parse(json);
} catch (e) {
  console.error("❌  Failed to parse wrangler.jsonc:", e.message);
  process.exit(1);
}

const storeSecrets = config.secrets_store_secrets;
if (!storeSecrets || storeSecrets.length === 0) {
  console.log("ℹ️  No secrets_store_secrets defined in wrangler.jsonc — nothing to audit.");
  process.exit(0);
}

// ── 2. Group required secrets by store_id ────────────────────────────────────
/** @type {Map<string, {binding: string, secret_name: string}[]>} */
const byStore = new Map();
for (const entry of storeSecrets) {
  const list = byStore.get(entry.store_id) || [];
  list.push({ binding: entry.binding, secret_name: entry.secret_name });
  byStore.set(entry.store_id, list);
}

// ── 3. For each store, fetch live secrets and compare ────────────────────────
let totalMissing = 0;
let totalFound = 0;

for (const [storeId, required] of byStore) {
  console.log(`\n🔐  Auditing store: ${storeId}`);
  console.log(`    Required secrets: ${required.length}`);

  // Fetch live secret names from the store
  let output;
  // Strip CLOUDFLARE_API_TOKEN so wrangler uses interactive OAuth
  // (the env var token often lacks Secrets Store read scopes)
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLOUDFLARE_API_TOKEN;

  try {
    output = execSync(
      `wrangler secrets-store secret list ${storeId} --remote --per-page 100`,
      { encoding: "utf-8", env: cleanEnv, maxBuffer: 1024 * 1024 }
    );
  } catch (e) {
    console.error(`    ⚠️  Failed to list secrets for store ${storeId}:`);
    console.error(`       ${e.stderr?.split("\n").find((l) => l.includes("ERROR")) || e.message}`);
    totalMissing += required.length;
    continue;
  }

  // Extract secret names from the wrangler table output
  // Table uses unicode box-drawing chars — match lines with 32-char hex IDs
  const liveNames = new Set();
  for (const line of output.split("\n")) {
    // Look for cells separated by │ where the second cell is a 32-char hex string
    const cells = line.split("│").map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2 && /^[a-f0-9]{32}$/.test(cells[1])) {
      liveNames.add(cells[0]);
    }
  }

  console.log(`    Live secrets found: ${liveNames.size}`);
  console.log("");

  // Compare
  const missing = [];
  const found = [];
  for (const { binding, secret_name } of required) {
    if (liveNames.has(secret_name)) {
      found.push({ binding, secret_name });
    } else {
      missing.push({ binding, secret_name });
    }
  }

  for (const { binding, secret_name } of found) {
    console.log(`    ✅  ${binding} → ${secret_name}`);
  }
  for (const { binding, secret_name } of missing) {
    console.log(`    ❌  ${binding} → ${secret_name}  (MISSING)`);
  }

  totalFound += found.length;
  totalMissing += missing.length;
}

// ── 4. Summary ───────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
if (totalMissing === 0) {
  console.log(`✅  All ${totalFound} secrets are present in the Secrets Store.`);
  process.exit(0);
} else {
  console.log(`❌  ${totalMissing} secret(s) MISSING, ${totalFound} present.`);
  console.log(`\n💡  To create a missing secret:`);
  console.log(`    wrangler secrets-store secret create <store-id> <secret-name> --remote`);
  process.exit(1);
}
