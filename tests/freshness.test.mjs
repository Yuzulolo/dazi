// Guards against the stale-form bug found in the PR #5 re-test (18 Oct 2026): after a save,
// /posts/edit showed the previous values because (1) the server action never invalidated
// the Next 16 client cache, and (2) the editor (kept alive by Activity) only reads its
// `initial` prop once. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFile(join(root, path), "utf8");

async function actionFiles(dir = "app") {
  const out = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await actionFiles(path)));
    else if (entry.name === "actions.ts") out.push(path);
  }
  return out;
}

// Writes to app data (auth actions only change the session and redirect).
const WRITES = /\.rpc\("(publish_post|update_post)"|\.from\("[a-z_]+"\)\s*\.(update|insert|upsert|delete)\(/;

test("every server action file that writes data revalidates the pages that show it", async () => {
  const files = (await actionFiles()).filter((f) => !f.startsWith(join("app", "auth")));
  assert.ok(files.length >= 3, "expected the posts, profile and onboarding action files");
  for (const file of files) {
    const source = await read(file);
    if (WRITES.test(source)) {
      assert.match(source, /revalidatePath\(/, `${file} writes data but never calls revalidatePath()`);
    }
  }
});

test("both post actions refresh the post pages before redirecting", async () => {
  const source = await read("app/posts/actions.ts");
  for (const fn of ["publishPost", "updatePost"]) {
    const body = source.slice(source.indexOf(`export async function ${fn}`));
    const end = body.indexOf("\nexport ", 1);
    const fnBody = end === -1 ? body : body.slice(0, end);
    assert.match(fnBody, /refreshPostPages\(\);\s*redirect\(/, `${fn} must call refreshPostPages() right before redirect()`);
  }
  assert.match(source, /"\/posts\/edit"/, "refreshPostPages() must include /posts/edit");
});

test("kept-alive forms are keyed by their data, so fresh server data remounts them", async () => {
  assert.match(await read("app/posts/edit/page.tsx"), /<PostEditor\s+key=\{post\.updatedAt\}/);
  assert.match(await read("app/posts/new/page.tsx"), /key=\{active\?\.id \?\? "none"\}/);
  assert.match(await read("app/me/edit/page.tsx"), /<ProfileForm\s+key=\{JSON\.stringify\(profile\.values\)\}/);
  assert.match(await read("lib/posts/queries.ts"), /updated_at/, "getMyActivePost must select updated_at for the key");
});

test("profile save redirects to a fresh /me/edit (so the keyed form can't wipe the confirmation)", async () => {
  const source = await read("app/me/edit/actions.ts");
  assert.match(source, /revalidatePath\("\/me\/edit"\);\s*redirect\("\/me\/edit\?saved=1"\)/);
});
