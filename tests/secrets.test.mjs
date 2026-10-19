// The service role key bypasses RLS: it may only be used by local scripts (seed, backfill,
// eval) — never by app code, never on Vercel (CLAUDE.md). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

async function files(dir) {
  const out = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("app/ and lib/ never mention the service role key", async () => {
  for (const file of [...(await files("app")), ...(await files("lib"))]) {
    const source = await readFile(join(root, file), "utf8");
    assert.ok(!/SERVICE_ROLE|service_role|scripts\/lib\/admin/.test(source), `${file} must not use the service role key`);
  }
});
