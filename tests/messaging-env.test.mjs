// The messaging kill switch is a server-only env var (lib/messaging/flag.ts). Run with: npm test
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

test("MESSAGING_ENABLED is never NEXT_PUBLIC_ and only read in lib/messaging/flag.ts (server-only)", async () => {
  for (const file of [...(await files("app")), ...(await files("lib"))]) {
    const source = await readFile(join(root, file), "utf8");
    assert.ok(!/NEXT_PUBLIC_MESSAGING/.test(source), `${file} must not expose the kill switch as NEXT_PUBLIC_`);
    if (/MESSAGING_ENABLED/.test(source) && file !== join("lib", "messaging", "flag.ts")) {
      // Comments may mention it; only flag.ts may read process.env.MESSAGING_ENABLED.
      assert.ok(!/process\.env\.MESSAGING_ENABLED/.test(source), `${file} must use messagingEnabled() instead`);
    }
  }
  const flag = await readFile(join(root, "lib", "messaging", "flag.ts"), "utf8");
  assert.match(flag, /^import "server-only";/, "lib/messaging/flag.ts must be server-only");
  assert.match(flag, /process\.env\.MESSAGING_ENABLED === "true"/, "only the exact string \"true\" switches it on");
});

test("every messaging server action checks the kill switch first", async () => {
  const source = await readFile(join(root, "app", "messaging", "actions.ts"), "utf8");
  assert.match(source, /^"use server";/);
  const actions = [...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n(.*)\n/g)];
  assert.ok(actions.length >= 5, "expected the five messaging actions");
  for (const [, name, firstLine] of actions) {
    assert.match(firstLine, /if \(!messagingEnabled\(\)\) return \{ error: OFF \};/, `${name} must check messagingEnabled() first`);
  }
});
