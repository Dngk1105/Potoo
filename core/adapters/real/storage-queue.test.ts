import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, test, vi } from "vitest";
import { shotQueue } from "./storage-queue";

afterEach(() => vi.unstubAllGlobals());

test("persists blobs across database reopen and isolates users", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const bodyA = new Blob(["first"], { type: "image/jpeg" });
  const bodyB = new Blob(["second"], { type: "image/jpeg" });
  await shotQueue.add({ id: "a", userId: "user-a", bucket: "media", path: "a", body: bodyA });
  await shotQueue.add({ id: "b", userId: "user-b", bucket: "media", path: "b", body: bodyB });

  const first = await shotQueue.list("user-a");
  expect(first).toHaveLength(1);
  expect(first[0].id).toBe("a");
  expect(await first[0].body.text()).toBe("first");
  expect((await shotQueue.list("user-b")).map((shot) => shot.id)).toEqual(["b"]);
  await shotQueue.remove("a");
  expect(await shotQueue.list("user-a")).toEqual([]);
  expect((await shotQueue.list("user-b")).map((shot) => shot.id)).toEqual(["b"]);
});

test("rejects a duplicate queue ID without overwriting the original", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const shot = { id: "same", userId: "user", bucket: "media", path: "a", body: new Blob(["one"]) };
  await shotQueue.add(shot);
  await expect(shotQueue.add({ ...shot, body: new Blob(["two"]) })).rejects.toThrow();
  expect(await (await shotQueue.list("user"))[0].body.text()).toBe("one");
});
