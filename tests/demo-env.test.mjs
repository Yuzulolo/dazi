// The demo login's credentials are server-only env vars (CLAUDE.md). Run with: npm test
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

test("DEMO_EMAIL / DEMO_PASSWORD are never NEXT_PUBLIC_ and only read in server-only files", async () => {
  for (const file of [...(await files("app")), ...(await files("lib"))]) {
    const source = await readFile(join(root, file), "utf8");
    assert.ok(!/NEXT_PUBLIC_DEMO/.test(source), `${file} must not expose demo credentials as NEXT_PUBLIC_`);
    if (/DEMO_PASSWORD/.test(source)) {
      assert.equal(file, join("app", "auth", "actions.ts"), `${file} must not read the demo password`);
      assert.match(source, /^"use server";/, "the demo sign-in must stay a server action");
    }
    if (/DEMO_EMAIL/.test(source)) {
      assert.ok([join("app", "auth", "actions.ts"), join("lib", "auth.ts")].includes(file), `${file} must not read DEMO_EMAIL`);
      assert.match(source, /^"use server";|^import "server-only";/, `${file} must be server-only`);
    }
  }
});
