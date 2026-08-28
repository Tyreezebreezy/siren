import assert from "node:assert/strict";
import test from "node:test";
import { SessionBuffer } from "../src/playback.ts";

test("ready audio stays ordered and bounded", () => {
  const buffer = new SessionBuffer(3);
  const session = buffer.begin();
  assert.equal(buffer.enqueue(session, "one"), true);
  assert.equal(buffer.enqueue(session, "two"), true);
  assert.equal(buffer.enqueue(session, "three"), true);
  assert.equal(buffer.enqueue(session, "four"), false);
  assert.equal(buffer.dequeue(session), "one");
  assert.equal(buffer.dequeue(session), "two");
  assert.equal(buffer.dequeue(session), "three");
});

test("context changes reject stale synthesis results", () => {
  for (const cause of ["stop", "navigation", "voice", "speed", "document"]) {
    const buffer = new SessionBuffer(3);
    const staleSession = buffer.begin();
    assert.equal(buffer.enqueue(staleSession, `${cause}-old`), true);
    const activeSession = buffer.cancel();
    assert.equal(buffer.size, 0);
    assert.equal(buffer.enqueue(staleSession, `${cause}-late`), false);
    assert.equal(buffer.enqueue(activeSession, `${cause}-new`), true);
    assert.equal(buffer.dequeue(activeSession), `${cause}-new`);
  }
});
