import Link from "next/link";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { AI_MODELS } from "@/lib/ai/providers";

export const metadata = { title: "Privacy · Dazi" };

const CONTACT = "xiangquyuanfang@hotmail.com";

// Plain-English privacy notice. Model names are rendered from lib/ai (AI_MODELS), not typed here.
export default function PrivacyPage() {
  const [primary, fallback] = AI_MODELS.chat;
  const model = (m: { provider: string; id: string }) => (
    <>
      {m.provider} <code>{m.id}</code>
    </>
  );
  return (
    <SiteShell variant="calm">
      <article className="glass calm-panel privacy">
        <h1>Privacy</h1>
        <p className="calm-lead">
          Dazi is a student project (Turing College capstone). This page explains what happens to your data in plain
          English. It is not legal advice.
        </p>

        <h2>What we store and why</h2>
        <ul>
          <li><strong>Account:</strong> your email and password (handled by Supabase Auth) — to log you in.</li>
          <li><strong>Birth year:</strong> to make sure every user is 18+. Others only ever see an age range (e.g. 30–34), never the year.</li>
          <li><strong>Profile:</strong> display name, languages, home city, bio, cities visited, hobbies, travel style — shown to other signed-in users and used for matching.</li>
          <li><strong>Gender and matching preferences</strong> (age range, gender): private, only used for matching, never shown.</li>
          <li><strong>Plans:</strong> your one-sentence plan and its card (city, dates, interests…). Phone numbers and emails are removed before anything is stored.</li>
          <li><strong>AI usage counters:</strong> how many AI actions you used in the last 24 hours — only to cap costs.</li>
        </ul>

        <h2>AI processing</h2>
        <p>
          AI requests go through <strong>OpenRouter</strong> to the model providers below. These providers may process the
          data <strong>outside the EU (e.g. in the US)</strong>. Contact details are removed from your plan text before it is sent.
        </p>
        <ul>
          <li><strong>Turning your sentence into a plan card</strong> and <strong>writing match reasons:</strong> {model(primary)}{fallback && <>, falling back to {model(fallback)}</>}.</li>
          <li><strong>Matching</strong> (comparing plans and profiles as numbers, “embeddings”): {model(AI_MODELS.embedding)} — from your plan card and your bio, hobbies, cities and travel interests.</li>
          <li>Match reasons only use safe fields (plan headlines, shared interests, overlapping days, pace) — never your birth year, gender or preferences.</li>
        </ul>
        <p>Every AI-written text in Dazi is labelled “AI-generated” (EU AI Act, Art. 50).</p>

        <h2>Where your data lives</h2>
        <ul>
          <li><strong>Supabase</strong> (database and login) — EU, Frankfurt.</li>
          <li><strong>Vercel</strong> (hosting) — the app’s server code runs in Frankfurt (fra1).</li>
          <li><strong>Your browser</strong> — the sentence you type on the homepage before signing up stays only in this browser (localStorage) until you publish your first plan, sign out or 7 days pass.</li>
        </ul>

        <h2>How long we keep it</h2>
        <p>Until you delete your account. Ended plans stay in your own history until then.</p>

        <h2>Deleting your data</h2>
        <p>
          Go to <Link href="/settings">Settings → Delete my account</Link>. Your account, profile, plans, match explanations
          and AI usage records are deleted immediately and permanently.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </article>
    </SiteShell>
  );
}
