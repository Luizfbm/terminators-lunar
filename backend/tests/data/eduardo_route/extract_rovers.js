/*
 * Reads the `const ROVERS = [...]` catalogue out of Eduardo's cockpit page and writes it as
 * JSON, field names as he wrote them (model, massKg, batteryWh, est, ...), so the route tests
 * can compare the API's /rovers against his own numbers.
 *
 *   git show origin/eduardo/cockpit-multirresolucao:src/cockpit_missao_lunar.html > /tmp/cockpit.html
 *   node extract_rovers.js /tmp/cockpit.html rovers_eduardo.json
 *
 * Source: src/cockpit_missao_lunar.html at commit 2195fcb, `const ROVERS` (line ~5598).
 */
"use strict";
const fs = require("fs");

const [htmlPath, outPath] = process.argv.slice(2);
if (!htmlPath || !outPath) {
  console.error("usage: node extract_rovers.js <cockpit_missao_lunar.html> <out.json>");
  process.exit(2);
}
const html = fs.readFileSync(htmlPath, "utf8");
const start = html.indexOf("const ROVERS = [");
if (start < 0) throw new Error("const ROVERS not found");
// The array ends at the first "\n    ];" after the start (4-space indent, as he wrote it).
const end = html.indexOf("\n    ];", start);
const literal = html.slice(start + "const ROVERS = ".length, end + "\n    ]".length);
const rovers = new Function("return " + literal + ";")();
fs.writeFileSync(outPath, JSON.stringify(rovers, null, 1) + "\n");
console.log(`${rovers.length} rovers -> ${outPath}`);
