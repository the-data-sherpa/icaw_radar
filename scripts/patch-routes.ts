// Patch script to fix Fresh route id -> filePath bug
// Run after `vite build`

const serverEntry = "_fresh/server/server-entry.mjs";
const content = await Deno.readTextFile(serverEntry);

// Replace { id: with { filePath: in route definitions
const patched = content.replace(
  /\{\s*id:\s*("[^"]+"),\s*mod:/g,
  "{ filePath: $1, mod:"
);

await Deno.writeTextFile(serverEntry, patched);
console.log("Patched server-entry.mjs: replaced id: with filePath:");
