// Email / phone rules shared by sign-up and the profile forms. No imports, so
// `npm test` can load this file directly (lib/profile/contact.test.mjs).

const EMAIL = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";
const EMAIL_EXACT = new RegExp(`^${EMAIL}$`);
const EMAIL_ANYWHERE = new RegExp(EMAIL);
// Digits joined by spaces, dots, dashes or brackets. Not slashes, so
// "2018/2019/2020" stays three separate years.
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{6,}\d/g;

export function isEmailAddress(value: string) {
  return EMAIL_EXACT.test(value);
}

// No contact details in profile text (safety rule, SPEC §4.10).
export function containsContactDetails(value: string) {
  if (EMAIL_ANYWHERE.test(value)) return true;
  // A run of 9+ digits looks like a phone number; "2015 - 2019" (8 digits) does not.
  return (value.match(PHONE_CANDIDATE) ?? []).some(
    (m) => m.replace(/\D/g, "").length >= 9,
  );
}

// Removes emails and phone numbers from free text (post sentences, AI output),
// so they are never stored, shown or sent to the AI provider.
export const CONTACT_PLACEHOLDER = "[contact removed]";
export function stripContactDetails(value: string) {
  return value
    .replace(new RegExp(EMAIL, "g"), CONTACT_PLACEHOLDER)
    .replace(PHONE_CANDIDATE, (m) => (m.replace(/\D/g, "").length >= 9 ? CONTACT_PLACEHOLDER : m))
    .replace(/\s{2,}/g, " ")
    .trim();
}
