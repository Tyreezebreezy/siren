export class SessionBuffer<T> {
  readonly capacity: number;
  private session = 0;
  private ready: T[] = [];

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Playback buffer capacity must be a positive integer.");
    }
    this.capacity = capacity;
  }

  begin() {
    this.ready = [];
    return ++this.session;
  }

  cancel() {
    return this.begin();
  }

  isCurrent(session: number) {
    return session === this.session;
  }

  enqueue(session: number, item: T) {
    if (!this.isCurrent(session) || this.ready.length >= this.capacity) {
      return false;
    }
    this.ready.push(item);
    return true;
  }

  dequeue(session: number) {
    return this.isCurrent(session) ? this.ready.shift() : undefined;
  }

  get size() {
    return this.ready.length;
  }
}
