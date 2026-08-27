#!/usr/bin/env node
/**
 * Fold the build into one self-contained file for publishing.
 *
 *   node build-standalone.mjs        writes akalade-standalone.html
 *
 * The page ships as five files: index.html, the engine's CSS and JS, a font
 * stylesheet, and two woff2 faces. That is correct for a real deploy and
 * useless for anywhere the page has to arrive as a single document: an
 * Artifact, an email, a USB stick handed to a client.
 *
 * Two things this has to get right, and both fail silently if it does not:
 *
 *   - NO EXTERNAL REFERENCES. The Artifact CSP blocks every host except
 *     Google Fonts, so the two faces are embedded as data URIs rather than
 *     linked. A missed reference does not error, it falls back to system-ui
 *     and the page quietly stops being the page you designed.
 *   - NO WRAPPER TAGS. The host supplies <!doctype>, <html>, <head> and
 *     <body>, so emitting our own nests a document inside a document.
 *
 * Both are asserted at the end. This exits non-zero rather than writing a
 * file that looks fine and is not.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, p), "utf8");
const OUT = "akalade-standalone.html";

const html = read("index.html");

// Faces first: inline them into the font stylesheet before it goes into the
// page, so there is one place that knows about the woff2 paths.
let fontsCss = read("assets/fonts.css");
for (const name of ["archivo-var", "geist-var"]) {
  const b64 = fs.readFileSync(path.join(HERE, "assets/fonts", `${name}.woff2`)).toString("base64");
  fontsCss = fontsCss.replaceAll(`url(fonts/${name}.woff2)`, `url(data:font/woff2;base64,${b64})`);
}

const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`could not find ${what} in index.html`);
  return m[0];
};

// Photographs go in as data URIs for the same reason the fonts do: nothing
// outside this file resolves once it is published.
const MIME = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml" };
const inlineAssets = (text) =>
  text.replace(/(src|href)="(assets\/[^"]+)"/g, (whole, attr, rel) => {
    const file = path.join(HERE, rel);
    if (!fs.existsSync(file)) throw new Error(`asset referenced but missing: ${rel}`);
    const mime = MIME[rel.split(".").pop().toLowerCase()];
    if (!mime) throw new Error(`no mime type known for ${rel}`);
    return `${attr}="data:${mime};base64,${fs.readFileSync(file).toString("base64")}"`;
  });

const pageCss = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const pageJs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const night = pick(/<div class="night"[\s\S]*?<\/div>\s*<\/div>/, "the night layer");
const folio = pick(/<aside class="folio"[\s\S]*?<\/aside>/, "the folio");
const body = inlineAssets(pick(/<main>[\s\S]*?<\/main>/, "<main>"));

const out = `<title>Akalade Careers</title>

<style>
/* ---- self-hosted typography, embedded ------------------------------- */
${fontsCss}
/* ---- scrollcraft engine stylesheet ---------------------------------- */
${read("scrollcraft.css")}
/* ---- Akalade ---------------------------------------------------------
   Single committed visual world: a chaptered editorial that hard-cuts
   between graphite grounds and one paper ground. Every colour is painted
   explicitly, so the page holds on either host theme rather than
   borrowing one.
   -------------------------------------------------------------------- */
${pageCss}
</style>

${night}
<div class="sc-grain" aria-hidden="true"></div>
${folio}
${body}

<script>
${read("scrollcraft.js")}
</script>
<script>
${pageJs.join("\n")}
</script>
`;

// --------------------------------------------------------------- checks ----
const problems = [];

// Strip comments and string literals before looking for wrapper tags, so a
// CSS comment that mentions <body> does not read as a leaked tag.
const structural = out
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ");
const leaked = structural.match(/<(?:!doctype|\/?html|\/?head|\/?body)[\s>]/gi);
if (leaked) problems.push(`wrapper tags emitted: ${[...new Set(leaked)].join(", ")}`);

const external = [...out.matchAll(/(?:src|href)\s*=\s*"(https?:\/\/[^"]+)"/gi)].map((m) => m[1]);
if (external.length) problems.push(`external references left: ${[...new Set(external)].join(", ")}`);

for (const face of ["Archivo", "Geist"]) {
  if (!new RegExp(`font-family:\\s*'${face}'`).test(out)) problems.push(`${face} @font-face missing`);
}
const embeds = (out.match(/data:font\/woff2;base64,/g) || []).length;
if (embeds !== 2) {
  // More than two means a face got inlined once per weight rule, which
  // multiplies the page size by the number of rules. Fewer means a rule
  // still points at a relative path that will not resolve.
  problems.push(`expected exactly two embedded faces, found ${embeds}`);
}
if (/url\(fonts\//.test(out)) problems.push("a @font-face still points at a relative path");
if (!/ScrollCraft\.mount\(/.test(out)) problems.push("the engine is never mounted");
if (!/class="night"/.test(out)) problems.push("the night ground is missing");
// Scope this to the page's own markup. Scanning the whole file would also
// read the engine's inline documentation, whose examples reference asset
// filenames that were never meant to resolve.
const markup = [night, folio, body].join("\n");
const relative = [...markup.matchAll(/(?:src|href)="((?!data:|#|mailto:|tel:)[^"]+)"/g)].map((m) => m[1]);
if (relative.length) problems.push(`unresolved relative reference(s): ${[...new Set(relative)].join(", ")}`);
const photos = (out.match(/data:image\/webp;base64,/g) || []).length;
if (photos < 9) problems.push(`expected at least 9 embedded photographs, found ${photos}`);

if (problems.length) {
  console.error("build-standalone: refusing to write\n  " + problems.join("\n  "));
  process.exit(1);
}

fs.writeFileSync(path.join(HERE, OUT), out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`${OUT}  ${kb}KB  self-contained, 0 external references`);
