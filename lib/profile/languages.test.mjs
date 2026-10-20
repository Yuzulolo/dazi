// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGE_LIST,
  MAX_LANGUAGE_LENGTH,
  languageLabel,
  normalizeLanguage,
  normalizeLanguages,
  searchLanguages,
} from "./languages.ts";

test("known languages become their code, whatever the spelling", () => {
  for (const [raw, code] of [
    ["English", "en"], ["  english ", "en"], ["ENGLISH", "en"], ["Englisch", "en"], ["en", "en"],
    ["中文", "zh"], ["Mandarin", "zh"], ["普通话", "zh"], ["Deutsch", "de"], ["Español", "es"],
    ["espanol", "es"], ["Français", "fr"], ["日本語", "ja"], ["한국어", "ko"], ["Farsi", "fa"],
    ["粵語", "yue"], ["Bahasa   Indonesia", "id"],
  ]) {
    assert.equal(normalizeLanguage(raw), code, raw);
  }
});

test("the original 20 codes are still known (existing rows)", () => {
  const original = ["en", "de", "zh", "es", "fr", "it", "pt", "ru", "ja", "ko", "ar", "tr", "pl", "nl", "hi", "uk", "sv", "da", "el", "vi"];
  for (const code of original) assert.equal(normalizeLanguage(code), code);
});

test("custom languages get one canonical form (they must match across users)", () => {
  assert.equal(normalizeLanguage("  swahili  "), "sw"); // listed
  assert.equal(normalizeLanguage("klingon"), "Klingon");
  for (const raw of ["LOW   GERMAN", "low german", "Low german", "low German"]) {
    assert.equal(normalizeLanguage(raw), "Low German", raw);
  }
  assert.equal(normalizeLanguage("   "), null);
});

test("normalising twice changes nothing (browser and server agree)", () => {
  for (const raw of ["Englisch", "中文", "low german", "Plattdüütsch", "मराठी", "ドイツ語", "Klingon"]) {
    const once = normalizeLanguage(raw);
    assert.equal(normalizeLanguage(once), once, raw);
  }
});

test("vowel signs in non-Latin scripts are kept (Marathi ≠ Maratha)", () => {
  assert.deepEqual(normalizeLanguages(["मराठी", "मराठा"]), ["मराठी", "मराठा"]);
  assert.equal(normalizeLanguage("ドイツ語"), "de");
});

test("a 30-character custom language is kept whole", () => {
  const thirty = "Abcdefghij Klmnopqrst Uvwxyzab";
  assert.equal(thirty.length, 30);
  assert.equal(normalizeLanguage(thirty), thirty);
});

test("lists are de-duplicated across spellings, order kept", () => {
  assert.deepEqual(normalizeLanguages(["Englisch", "en", "English", "中文", "klingon", "KLINGON", ""]), ["en", "zh", "Klingon"]);
});

test("labels for codes and custom values", () => {
  assert.equal(languageLabel("en"), "English");
  assert.equal(languageLabel("yue"), "Cantonese");
  assert.equal(languageLabel("Klingon"), "Klingon");
});

test("search finds by name, code and alias", () => {
  assert.equal(searchLanguages("eng")[0].value, "en");
  assert.equal(searchLanguages("Englisch")[0].value, "en");
  assert.equal(searchLanguages("中文")[0].value, "zh");
  assert.equal(searchLanguages("sw")[0].value, "sw"); // code beats "Swedish"
  assert.equal(searchLanguages("ger")[0].value, "de");
  assert.ok(!searchLanguages("", ["en"]).some((l) => l.value === "en"));
});

test("every listed label and code fits the database limit", () => {
  for (const l of LANGUAGE_LIST) {
    assert.ok(l.label.length <= MAX_LANGUAGE_LENGTH && l.value.length <= MAX_LANGUAGE_LENGTH, l.label);
  }
  assert.equal(new Set(LANGUAGE_LIST.map((l) => l.value)).size, LANGUAGE_LIST.length);
});
