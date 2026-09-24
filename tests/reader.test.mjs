import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeState } from "../src/persistence.ts";
import {
  buildSpeechChunks,
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
  const migrated = normalizeState({
    version: 1,
    settings: { speed: 99 },
    documents: [],
  }).settings;
  assert.equal(migrated.speed, 1);
  assert.equal(migrated.highlighting, true);
  assert.equal(migrated.textSize, "medium");
  assert.equal(migrated.lineSpacing, "comfortable");
  assert.equal(migrated.readerWidth, "comfortable");
  assert.equal(
    normalizeState({
      version: 1,
      settings: { textSize: "large" },
      documents: [],
    }).settings.textSize,
    "large",
  );
});

test("long documents parse incrementally into the expected queue", () => {
  const text = readFileSync(
    new URL("fixtures/long.txt", import.meta.url),
    "utf8",
  );
  assert.equal(parseReaderDocument(text).sentences.length, 50);
});

test("speech chunks combine short neighbors without crossing paragraphs", () => {
  const document = parseReaderDocument(
    "One short sentence. Two stays beside it. Three completes the group.\n\nA new paragraph starts here. This sentence is deliberately long enough to stand alone when the chunk limit is small.",
  );
  const chunks = buildSpeechChunks(document.sentences, 0, 90);
  assert.deepEqual(
    chunks.map(({ startSentence, endSentence }) => [
      startSentence,
      endSentence,
    ]),
    [
      [0, 2],
      [3, 3],
      [4, 4],
    ],
  );
  assert.equal(
    chunks.map(({ text }) => text).join(" "),
    document.sentences.map(({ text }) => text).join(" "),
  );
  assert.deepEqual(buildSpeechChunks([], 0), []);
  assert.equal(buildSpeechChunks(document.sentences, 2)[0].startSentence, 2);
});
