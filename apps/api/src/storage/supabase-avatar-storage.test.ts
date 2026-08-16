import { describe, expect, it, vi } from "vitest";

import { SupabaseAvatarStorage } from "./supabase-avatar-storage.js";


describe("SupabaseAvatarStorage", () => {
  it("只用後端 secret 上傳至 OWNER 專屬路徑", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    const storage = new SupabaseAvatarStorage({
      supabaseUrl: "http://127.0.0.1:54321",
      secretKey: "server-secret-key",
      fetcher,
    });
    const result = await storage.upload(
      { tenantId: "tenant-1", personaId: "persona-1" },
      new File([
        new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
      ], "photo.webp", { type: "image/webp" }),
    );

    expect(result.path).toBe("tenant-1/persona-1/avatar.webp");
    expect(result.publicUrl).toContain(
      "/storage/v1/object/public/persona-avatars/tenant-1/persona-1/avatar.webp",
    );
    expect(result.stalePaths).toEqual([
      "tenant-1/persona-1/avatar.jpg",
      "tenant-1/persona-1/avatar.png",
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/storage/v1/object/persona-avatars/tenant-1/persona-1/avatar.webp"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "server-secret-key",
          authorization: "Bearer server-secret-key",
          "x-upsert": "true",
        }),
      }),
    );
  });

  it("可用後端 secret 精準刪除被取代的固定頭像路徑", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    const storage = new SupabaseAvatarStorage({
      supabaseUrl: "http://127.0.0.1:54321",
      secretKey: "server-secret-key",
      fetcher,
    });

    await storage.remove([
      "tenant-1/persona-1/avatar.jpg",
      "tenant-1/persona-1/avatar.png",
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/tenant-1/persona-1/avatar.jpg"),
      expect.objectContaining({ method: "DELETE", signal: expect.any(AbortSignal) }),
    );
  });

  it("Storage 拒絕上傳時不回傳假成功", async () => {
    const storage = new SupabaseAvatarStorage({
      supabaseUrl: "http://127.0.0.1:54321",
      secretKey: "server-secret-key",
      fetcher: vi.fn(async () => new Response("denied", { status: 403 })),
    });

    await expect(storage.upload(
      { tenantId: "tenant-1", personaId: "persona-1" },
      new File([
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      ], "photo.png", { type: "image/png" }),
    )).rejects.toThrow("頭像上傳失敗");
  });

  it("MIME 宣稱是圖片但檔案簽章不符時拒絕且不連 Storage", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    const storage = new SupabaseAvatarStorage({
      supabaseUrl: "http://127.0.0.1:54321",
      secretKey: "server-secret-key",
      fetcher,
    });

    await expect(storage.upload(
      { tenantId: "tenant-1", personaId: "persona-1" },
      new File(["not a png"], "spoofed.png", { type: "image/png" }),
    )).rejects.toThrow("檔案內容與格式不符");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
