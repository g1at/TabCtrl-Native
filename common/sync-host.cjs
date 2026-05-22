#!/usr/bin/env node
/**
 * Sync shared source files from native/common/ into each platform directory.
 *
 * Source of truth lives under native/common/. The platform directories
 * (native/windows/, native/macos/, native/linux/) each carry byte-identical
 * copies so end users can grab just one platform's folder and have a fully
 * self-contained install bundle.
 *
 * Usage:
 *   node native/common/sync-host.cjs           # copy common/* -> platforms
 *   node native/common/sync-host.cjs --check   # exit 1 if anything drifted
 *
 * Add `--check` to a pre-commit hook or CI step to catch drift.
 */
const fs = require("fs");
const path = require("path");

const COMMON_DIR = __dirname;
const NATIVE_DIR = path.dirname(COMMON_DIR);
const PLATFORMS = ["windows", "macos", "linux"];

// Files in common/ that must be byte-identical across all platform dirs.
const SHARED_FILES = [
  "host.cjs",
  "generate-manifest.cjs",
  "bridge.config.schema.json",
  "com.tabctrl.bridge.json",
];

function readBytes(file) {
  try { return fs.readFileSync(file); } catch { return null; }
}

function bytesEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.equals(b);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const checkMode = process.argv.includes("--check");
  const drift = [];
  const updated = [];

  for (const file of SHARED_FILES) {
    const source = path.join(COMMON_DIR, file);
    const sourceBytes = readBytes(source);
    if (!sourceBytes) {
      console.error(`[sync-host] source missing: ${source}`);
      process.exit(1);
    }
    for (const platform of PLATFORMS) {
      const target = path.join(NATIVE_DIR, platform, file);
      const targetBytes = readBytes(target);
      if (bytesEqual(sourceBytes, targetBytes)) continue;
      if (checkMode) {
        drift.push(path.relative(NATIVE_DIR, target));
      } else {
        ensureDir(path.dirname(target));
        fs.writeFileSync(target, sourceBytes);
        updated.push(path.relative(NATIVE_DIR, target));
      }
    }
  }

  if (checkMode) {
    if (drift.length) {
      console.error("[sync-host] platform copies drifted from common/:");
      for (const item of drift) console.error("  " + item);
      console.error('[sync-host] run "node native/common/sync-host.cjs" to fix.');
      process.exit(1);
    }
    console.log("[sync-host] platform copies match common/ ✓");
    return;
  }

  if (!updated.length) {
    console.log("[sync-host] already up to date.");
    return;
  }
  console.log(`[sync-host] updated ${updated.length} file(s):`);
  for (const item of updated) console.log("  " + item);
}

if (require.main === module) {
  main();
}

module.exports = { SHARED_FILES, PLATFORMS };
