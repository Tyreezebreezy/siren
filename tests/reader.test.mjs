import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeState } from "../src/persistence.ts";
import {
  markdownToReadableText,
  moveSentence,
  parseReaderDocument,
} from "../src/reader.ts";

test("sentence parsing preserves punctuation and paragraph boundaries", () => {
  const document = parseReaderDocument(
    'Dr. Rivera asked, "Ready?" Yes!\n\nThe next paragraph starts here.',
  );
  assert.deepEqual(
    document.sentences.map(({ text }) => text),
    ['Dr. Rivera asked, "Ready?"', "Yes!", "The next paragraph starts here."],
  );
  assert.equal(document.paragraphs.length, 2);
});

test("Markdown becomes readable without structural markers", () => {
  assert.equal(
    markdownToReadableText(
      "## Heading\n\n- Read [the guide](https://example.test).",
    ),
    "Heading\n\nRead the guide.",
  );
});

test("navigation and persisted settings stay within safe bounds", () => {
  assert.equal(moveSentence(0, -1, 4), 0);
  assert.equal(moveSentence(3, 1, 4), 3);
  assert.equal(
    normalizeState({ version: 1, settings: { speed: 99 }, documents: [] })
      .settings.speed,
    1,
  );
});

test("long documents parse incrementally into the expected queue", () => {
  const text = readFileSync(
    new URL("fixtures/long.txt", import.meta.url),
    "utf8",
  );
  assert.equal(parseReaderDocument(text).sentences.length, 50);
});
