// AI extraction eval: runs the app's own extraction (lib/ai/extract-trip.ts) on the
// 20 sentences in evals/extraction.json and prints per-field accuracy (SPEC §8 target ≥ 90%).
// Costs real money on the school key (~20 small calls) — run it sparingly.
//
//   node --conditions=react-server --env-file=.env.local scripts/eval-extraction.mjs
//
// (--conditions=react-server lets Node load files that import "server-only".)
import { readFile } from "node:fs/promises";
import { extractTrip, prepareTripText } from "../lib/ai/extract-trip.ts";
import { containsContactDetails } from "../lib/profile/contact.ts";
import { TONES } from "../lib/posts/card.ts";

const { today, cases } = JSON.parse(await readFile(new URL("../evals/extraction.json", import.meta.url), "utf8"));
const FIELDS = ["city", "start_date", "end_date", "interests", "budget", "no_contact", "headline", "tone"];
const score = Object.fromEntries(FIELDS.map((f) => [f, 0]));
const failures = [];

const norm = (v) => (v == null ? null : String(v).trim().toLowerCase());

for (const c of cases) {
  let card;
  try {
    card = await extractTrip(prepareTripText(c.text), today);
  } catch (error) {
    failures.push(`#${c.id}: extraction failed — ${error.message}`);
    console.log(`#${String(c.id).padStart(2)}  ERROR  ${error.message}`);
    continue;
  }
  const e = c.expect;
  const outputs = [prepareTripText(c.text), card.city, card.vibe, ...card.headline].filter(Boolean);
  const checks = {
    city: norm(card.city) === norm(e.city),
    start_date: card.startDate === e.start_date,
    end_date: card.endDate === e.end_date,
    interests: e.interests.every((v) => card.interests.includes(v)) && card.interests.length <= e.interests.length + 2,
    budget: card.budget === e.budget,
    no_contact: outputs.every((s) => !containsContactDetails(s)),
    headline: card.headline.length === 2 && card.headline.every((l) => l.length >= 1 && l.length <= 22),
    tone: TONES.includes(card.tone),
  };
  for (const f of FIELDS) if (checks[f]) score[f] += 1;
  const marks = FIELDS.map((f) => (checks[f] ? "✓" : "✗")).join(" ");
  console.log(`#${String(c.id).padStart(2)}  ${marks}  ${c.text.slice(0, 60)}`);
  const wrong = FIELDS.filter((f) => !checks[f]);
  if (wrong.length) {
    const got = { city: card.city, start_date: card.startDate, end_date: card.endDate, interests: card.interests, budget: card.budget, headline: card.headline };
    failures.push(`#${c.id} wrong: ${wrong.join(", ")} — got ${JSON.stringify(got)}`);
  }
}

console.log(`\n      ${FIELDS.join(" · ")}\n`);
let total = 0;
for (const f of FIELDS) {
  total += score[f];
  console.log(`${f.padEnd(11)} ${String(score[f]).padStart(2)}/${cases.length}  ${((score[f] / cases.length) * 100).toFixed(0)}%`);
}
const overall = (total / (FIELDS.length * cases.length)) * 100;
console.log(`\nOverall: ${total}/${FIELDS.length * cases.length} fields correct = ${overall.toFixed(1)}% (target ≥ 90%) ${overall >= 90 ? "✅" : "❌"}`);
if (failures.length) console.log(`\nDetails:\n${failures.join("\n")}`);
