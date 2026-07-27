#!/usr/bin/env node
// Wrapper around `npm audit` that fails the build on any advisory at or above
// THRESHOLD, except those explicitly allowlisted in audit-allowlist.json.
//
// npm audit has no native ignore mechanism, and dropping --audit-level to
// "high" would hide unrelated future findings. This keeps the gate strict
// while allowing a documented, expiring exception.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THRESHOLD = "moderate";
const ORDER = ["info", "low", "moderate", "high", "critical"];
const here = dirname(fileURLToPath(import.meta.url));

const atOrAbove = (sev) => ORDER.indexOf(sev) >= ORDER.indexOf(THRESHOLD);

const { allow } = JSON.parse(readFileSync(join(here, "audit-allowlist.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);

const expired = allow.filter((e) => e.expires < today);
const active = new Map(allow.filter((e) => e.expires >= today).map((e) => [e.id, e]));

// `npm audit` exits non-zero when findings exist, so capture rather than throw.
let report;
try {
  report = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  report = err.stdout;
}
if (!report) {
  console.error("audit-check: npm audit produced no output");
  process.exit(1);
}

const vulns = JSON.parse(report).vulnerabilities ?? {};

// A package can be vulnerable transitively: `via` holds either advisory
// objects or the names of other vulnerable packages. Walk the chain so a
// package inherits the advisory ids it is actually affected by.
const advisoriesFor = (name, seen = new Set()) => {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const ids = new Set();
  for (const via of vulns[name]?.via ?? []) {
    if (typeof via === "string") {
      for (const id of advisoriesFor(via, seen)) ids.add(id);
    } else if (via.url) {
      const match = via.url.match(/GHSA-[a-z0-9-]+/i);
      if (match) ids.add(match[0]);
    }
  }
  return ids;
};

const blocking = [];
const waived = [];

for (const [name, v] of Object.entries(vulns)) {
  if (!atOrAbove(v.severity)) continue;
  const ids = [...advisoriesFor(name)];
  // Only waive when every advisory affecting this package is allowlisted.
  if (ids.length > 0 && ids.every((id) => active.has(id))) {
    waived.push({ name, severity: v.severity, ids });
  } else {
    blocking.push({ name, severity: v.severity, ids });
  }
}

for (const w of waived) {
  const reason = active.get(w.ids[0]);
  console.log(`WAIVED  ${w.severity.padEnd(8)} ${w.name} (${w.ids.join(", ")}) — expires ${reason.expires}`);
}
for (const b of blocking) {
  console.error(`BLOCK   ${b.severity.padEnd(8)} ${b.name} (${b.ids.join(", ") || "no advisory id"})`);
}
for (const e of expired) {
  console.error(`EXPIRED ${e.id} (${e.package}) — allowlist entry lapsed on ${e.expires}; re-review it`);
}

if (blocking.length || expired.length) {
  console.error(`\naudit-check: failing — ${blocking.length} blocking, ${expired.length} expired`);
  process.exit(1);
}
console.log(`\naudit-check: pass — 0 blocking at >=${THRESHOLD}, ${waived.length} waived`);
