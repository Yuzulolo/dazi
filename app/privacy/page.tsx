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
          <li><strong>Profile:</strong> display name, languages, home city, bio, cities you love to travel to, hobbies, travel style — shown to other signed-in users and used for matching.</li>
          <li><strong>Gender and matching preferences</strong> (age range, gender): private, only used for matching, never shown.</li>
          <li><strong>Plans:</strong> your one-sentence plan and its card (city, dates, interests…). Phone numbers and emails are removed before anything is stored.</li>
          <li><strong>AI usage counters:</strong> how many AI actions you used in the last 24 hours — only to cap costs.</li>
          <li><strong>Embeddings:</strong> number lists computed by AI from your plan and from your bio, hobbies, cities and travel interests — used only to rank matches, never shown.</li>
          <li><strong>Match explanations:</strong> AI-written reasons why a plan fits yours, cached so reloading costs nothing.</li>
          <li><strong>Invites, messages and blocks</strong> (when invites are switched on): who invited whom for which plan, your optional note, the answer, the messages of a chat both of you accepted, and the people you blocked. Only the two people of an invite can read it; nobody can read a chat before it is accepted or after a block. Messages are limited to 30 per hour. Exception: the public demo account is shared, so every visitor using it can read its chat (contact details are refused there).</li>
          <li><strong>Technical logs:</strong> Supabase (login) and Vercel (hosting) keep standard request logs, which include IP addresses and browser information, for security and debugging.</li>
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
          <li><strong>Your browser</strong> — the sentence you type on the homepage stays only in this browser (localStorage). It is removed when you save a plan, sign out or delete your account, and after 7 days at the latest. A sentence typed while signed out is only offered to a new account created afterwards on this browser, never to someone else&rsquo;s existing account.</li>
        </ul>

        <h2>How long we keep it</h2>
        <p>
          Until you delete your account. Ended plans stay in your own history until then. Deleting your account also
          removes the chats you were part of, for the other person too.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Go to <Link href="/settings">Settings → Delete my account</Link> (also possible before you finish onboarding). Your
          account, profile, plans, embeddings, match explanations, AI usage records, invites, messages and blocks are deleted from the database
          immediately. Copies in our providers&rsquo; backups and logs expire on their own schedules.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </article>
    </SiteShell>
  );
}
