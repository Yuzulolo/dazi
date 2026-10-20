import "server-only";

// Kill switch for invites + chat (phase 7b-1). Server-only env var: "true" on Preview,
// unset on Production until the director has tested it. Off = every invite / chat UI is
// hidden and every messaging server action refuses. The database rules apply either way
// (supabase/migrations/20261020160000_messaging.sql). tests/messaging-env.test.mjs keeps
// the flag out of client code.
export function messagingEnabled() {
  return process.env.MESSAGING_ENABLED === "true";
}
