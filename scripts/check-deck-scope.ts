/**
 * Build gate for the two-stylesheet architecture.
 *
 *  1. static/styles/broadcast.css is the frozen desktop / OBS truth and must
 *     never gain a media-query block.
 *  2. Every selector in static/styles/deck.css must begin with `html.web`,
 *     which is what keeps responsive rules off the /overlay route.
 *
 * Wired into `deno task check`.
 */

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const repoRoot = new URL("../", import.meta.url);
const read = async (path: string) =>
  stripComments(await Deno.readTextFile(new URL(path, repoRoot)));

const deck = await read("static/styles/deck.css");
const broadcast = await read("static/styles/broadcast.css");

let bad = 0;

if (/@media/.test(broadcast)) {
  console.error("broadcast.css must contain no media-query block");
  bad++;
}

/** Split a selector list on top-level commas only (`:is(a, b)` is one part). */
function splitSelectorList(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

for (const raw of deck.split("}")) {
  const parts = raw.split("{");
  // Every part except the last is a selector head (or an at-rule prelude).
  for (const head of parts.slice(0, -1)) {
    const sel = head.trim();
    if (!sel || sel.startsWith("@")) continue;
    for (const part of splitSelectorList(sel)) {
      const p = part.trim();
      if (
        !p || p.startsWith("@") || p.startsWith("from") || p.startsWith("to")
      ) {
        continue;
      }
      if (!p.startsWith("html.web")) {
        console.error(`deck.css selector must start with html.web: ${p}`);
        bad++;
      }
    }
  }
}

if (bad > 0) Deno.exit(1);
console.log("deck scope OK");
