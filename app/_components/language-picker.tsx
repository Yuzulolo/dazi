"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  MAX_LANGUAGES,
  MAX_LANGUAGE_LENGTH,
  isKnownLanguage,
  languageKey,
  languageLabel,
  normalizeLanguage,
  searchLanguages,
} from "@/lib/profile/languages";
import { containsContactDetails } from "@/lib/profile/contact";

type Choice = { value: string; label: string; custom?: boolean };

// Searchable multi-select for "Languages you speak" (phase 7a). Common languages come from
// lib/profile/languages.ts; anything else can be added as typed ("Add “…”"). Each selection
// is a hidden <input name="languages">, so the server actions read it as before; the server
// normalises and validates again (lib/profile/validate.ts) — the browser is never trusted.
// Keyboard: ↑/↓ move, Enter picks, Escape closes, Backspace on an empty search removes the last.
export function LanguagePicker({ defaultValue }: { defaultValue: string[] }) {
  const id = useId();
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = selected.length >= MAX_LANGUAGES;

  const taken = new Set(selected.map(languageKey));
  const typed = normalizeLanguage(query);
  const choices: Choice[] = searchLanguages(query, selected)
    .slice(0, 8)
    .map((l) => ({ value: l.value, label: l.label }));
  // Offer the typed text itself (2+ characters) when it isn't a listed language and isn't selected yet.
  const contact = typed !== null && containsContactDetails(typed);
  if (
    typed &&
    typed.length >= 2 &&
    !contact &&
    !isKnownLanguage(typed) &&
    !taken.has(languageKey(typed)) &&
    typed.length <= MAX_LANGUAGE_LENGTH
  ) {
    choices.push({ value: typed, label: `Add “${typed}”`, custom: true });
  }
  const showList = open && !full && choices.length > 0;
  const already = typed && taken.has(languageKey(typed)) ? languageLabel(typed) : null;
  const current = Math.min(active, choices.length - 1);

  // Keep the highlighted option visible when ↑/↓ scroll past the list's height (review S4).
  useEffect(() => {
    if (showList) document.getElementById(`${id}-opt-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [id, showList, current]);

  function pick(value: string) {
    if (full || taken.has(languageKey(value))) return;
    setSelected([...selected, value]);
    setQuery("");
    setActive(0);
  }

  // The × button disappears with its tag, so focus goes back to the search box (review S3).
  function remove(value: string) {
    setSelected(selected.filter((v) => v !== value));
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!showList) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + choices.length) % choices.length);
    } else if (event.key === "Enter") {
      // Never submit the whole form from the search box.
      event.preventDefault();
      if (showList && choices[current]) pick(choices[current].value);
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Backspace" && query === "" && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  }

  const listId = `${id}-list`;
  const helpId = `${id}-help`;
  return (
    <fieldset className="language-picker">
      <legend>Languages you speak (at least one, up to {MAX_LANGUAGES})</legend>
      {selected.length > 0 && (
        <ul className="language-tags" aria-label="Selected languages">
          {selected.map((value) => (
            <li key={value}>
              {languageLabel(value)}
              <button type="button" onClick={() => remove(value)} aria-label={`Remove ${languageLabel(value)}`}>
                ×
              </button>
              <input type="hidden" name="languages" value={value} />
            </li>
          ))}
        </ul>
      )}
      <div className="language-combo">
        <input
          ref={inputRef}
          type="text"
          aria-label="Search or add a language"
          role="combobox"
          autoComplete="off"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${id}-opt-${current}` : undefined}
          aria-describedby={helpId}
          maxLength={MAX_LANGUAGE_LENGTH}
          placeholder={full ? `Up to ${MAX_LANGUAGES} languages` : "Search or add a language"}
          // readOnly, not disabled: picking the 8th language must not throw focus away (review S2).
          readOnly={full}
          aria-disabled={full || undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="language-options"
            aria-label="Languages"
            // Pressing the list's scrollbar must not blur the input (which closes the list).
            onMouseDown={(event) => event.preventDefault()}
          >
            {choices.map((c, i) => (
              <li
                key={c.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === current}
                data-custom={c.custom ? "" : undefined}
                // mousedown, not click: picking must happen before the input's blur closes the list.
                onMouseDown={() => pick(c.value)}
                onMouseEnter={() => setActive(i)}
              >
                {c.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <small id={helpId} className="field-help" aria-live="polite">
        {full
          ? `That's the maximum of ${MAX_LANGUAGES} — remove one to add another.`
          : contact
            ? "Contact details (email or phone number) can't be added as a language."
            : already
              ? `${already} is already on your list.`
            : `Not listed? Type it and choose “Add”. Up to ${MAX_LANGUAGE_LENGTH} characters.`}
      </small>
    </fieldset>
  );
}
