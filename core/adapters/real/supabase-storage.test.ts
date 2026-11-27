import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import { createSupabaseStorage } from "./supabase-storage";

function setup() {
  const upload = vi.fn().mockResolvedValue({ data: { path: "shot.jpg" }, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "signed" }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const from = vi.fn().mockReturnValue({ upload, createSignedUrl, remove });
  const client = { storage: { from } } as unknown as SupabaseClient;
  return { adapter: createSupabaseStorage(client), upload, createSignedUrl, remove, from };
}

describe("Supabase Storage adapter", () => {
  test("uploads to the requested bucket and preserves MIME type", async () => {
    const { adapter, upload, from } = setup();
    const body = new Blob(["photo"], { type: "image/jpeg" });
    await expect(adapter.upload({ bucket: "media", path: "shot.jpg", body })).resolves.toEqual({
      ok: true,
      data: { bucket: "media", path: "shot.jpg", status: "uploaded" },
    });
    expect(from).toHaveBeenCalledWith("media");
    expect(upload).toHaveBeenCalledWith("shot.jpg", body, { contentType: "image/jpeg" });
  });

  test("creates a signed URL with the requested expiry", async () => {
    const { adapter, createSignedUrl, from } = setup();
    await expect(
      adapter.getUrl({ bucket: "media", path: "a", expiresInSeconds: 30 }),
    ).resolves.toEqual({
      ok: true,
      data: "signed",
    });
    expect(from).toHaveBeenCalledWith("media");
    expect(createSignedUrl).toHaveBeenCalledWith("a", 30);
  });

  test("removes only the requested object", async () => {
    const { adapter, remove } = setup();
    await expect(adapter.remove({ bucket: "media", path: "a" })).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    expect(remove).toHaveBeenCalledWith(["a"]);
  });

  test("preserves structured error messages and service codes for every operation", async () => {
    const { adapter, upload, createSignedUrl, remove } = setup();
    upload.mockResolvedValueOnce({
      data: null,
      error: { message: "denied", code: "AccessDenied" },
    });
    createSignedUrl.mockRejectedValueOnce({ message: "offline", code: "NETWORK" });
    remove.mockResolvedValueOnce({ data: null, error: { message: "missing", code: "NoSuchKey" } });

    await expect(adapter.upload({ bucket: "media", path: "a", body: new Blob() })).resolves.toEqual(
      {
        ok: false,
        error: { message: "denied", code: "AccessDenied" },
      },
    );
    await expect(
      adapter.getUrl({ bucket: "media", path: "a", expiresInSeconds: 30 }),
    ).resolves.toEqual({
      ok: false,
      error: { message: "offline", code: "NETWORK" },
    });
    await expect(adapter.remove({ bucket: "media", path: "a" })).resolves.toEqual({
      ok: false,
      error: { message: "missing", code: "NoSuchKey" },
    });
  });

  test.each([null, {}, { signedUrl: "" }])(
    "rejects an invalid signed URL response %#",
    async (data) => {
      const { adapter, createSignedUrl } = setup();
      createSignedUrl.mockResolvedValueOnce({ data, error: null });
      await expect(
        adapter.getUrl({ bucket: "media", path: "a", expiresInSeconds: 30 }),
      ).resolves.toEqual({
        ok: false,
        error: { message: "Storage returned an invalid signed URL" },
      });
    },
  );

  test("returns SDK and network errors without pretending upload succeeded", async () => {
    const { adapter, upload, createSignedUrl } = setup();
    upload.mockResolvedValueOnce({ data: null, error: new Error("denied") });
    createSignedUrl.mockRejectedValueOnce(new Error("offline"));
    await expect(adapter.upload({ bucket: "media", path: "a", body: new Blob() })).resolves.toEqual(
      {
        ok: false,
        error: { message: "denied" },
      },
    );
    await expect(
      adapter.getUrl({ bucket: "media", path: "a", expiresInSeconds: 30 }),
    ).resolves.toEqual({
      ok: false,
      error: { message: "offline" },
    });
  });
});
