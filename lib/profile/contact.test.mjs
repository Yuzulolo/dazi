// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { containsContactDetails, isEmailAddress, stripContactDetails } from "./contact.ts";

const blocked = [
  // bio
  "write me at alice@mail.com",
  "call +1 (415) 555-0132",
  "0151 23456789",
  // hobbies / cities / home city / display name (W2)
  "WA 0151 2345 6789",
  "insta: bob@ig.de",
  "Berlin +49 30 1234567",
  "Alice 015123456789",
];

const allowed = [
  "Erasmus 2018/2019/2020 in Lisbon", // S6
  "Lived in Berlin 2015 - 2019",
  "Born 1995",
  "35mm film photography",
  "Room 101",
  "Tokyo",
  "Rio de Janeiro",
  "vinyl, 80s synth-pop",
  "Alice",
  "",
];

for (const value of blocked) {
  test(`blocks: ${value}`, () => assert.equal(containsContactDetails(value), true));
}
for (const value of allowed) {
  test(`allows: ${JSON.stringify(value)}`, () => assert.equal(containsContactDetails(value), false));
}

test("isEmailAddress accepts a whole address only", () => {
  assert.equal(isEmailAddress("alice@mail.com"), true);
  assert.equal(isEmailAddress("write me at alice@mail.com"), false);
  assert.equal(isEmailAddress("alice@mail"), false);
});

test("stripContactDetails removes phone numbers and emails, keeps the rest", () => {
  assert.equal(stripContactDetails("Berlin next week, text me at 0151 2345678"), "Berlin next week, text me at [contact removed]");
  assert.equal(stripContactDetails("Mail a.b@mail.de for details"), "Mail [contact removed] for details");
  assert.equal(stripContactDetails("I'm in Berlin from 20 to 25 October 2026"), "I'm in Berlin from 20 to 25 October 2026");
  assert.equal(stripContactDetails("Erasmus 2018/2019/2020 in Lisbon"), "Erasmus 2018/2019/2020 in Lisbon");
  assert.equal(containsContactDetails(stripContactDetails("call +49 30 1234567 or x@y.com")), false);
});
