import type {
  AvatarStorage,
  AvatarStorageUpload,
  OwnedPersonaIdentity,
} from "../app.js";
import { validateAvatarFile } from "./avatar-file.js";


export interface SupabaseAvatarStorageOptions {
  supabaseUrl: string;
  secretKey: string;
  fetcher?: typeof fetch;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const STORAGE_TIMEOUT_MS = 20_000;

export class AvatarStorageUploadError extends Error {
  constructor(
    readonly status: number,
    readonly storageCode: string,
  ) {
    super(`頭像上傳失敗（HTTP ${status}；${storageCode}）`);
    this.name = "AvatarStorageUploadError";
  }
}

function storageErrorCode(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown; code?: unknown };
    const candidate = typeof parsed.error === "string"
      ? parsed.error
      : typeof parsed.code === "string"
        ? parsed.code
        : undefined;
    if (candidate && /^[A-Z0-9_]{1,80}$/i.test(candidate)) return candidate;
  } catch {
    // Storage can return a non-JSON response. Keep the log safe and generic.
  }
  return "UNKNOWN_STORAGE_ERROR";
}

export class SupabaseAvatarStorage implements AvatarStorage {
  readonly #supabaseUrl: URL;
  readonly #secretKey: string;
  readonly #fetcher: typeof fetch;

  constructor({ supabaseUrl, secretKey, fetcher = fetch }: SupabaseAvatarStorageOptions) {
    this.#supabaseUrl = new URL(supabaseUrl);
    this.#secretKey = secretKey.trim();
    if (!this.#secretKey) throw new Error("SUPABASE_SECRET_KEY 不可為空");
    this.#fetcher = fetcher;
  }

  async upload(
    owner: OwnedPersonaIdentity,
    file: File,
  ): Promise<AvatarStorageUpload> {
    const extension = EXTENSIONS[file.type];
    if (!extension) throw new Error("不支援的頭像格式");
    await validateAvatarFile(file);
    const path = `${owner.tenantId}/${owner.personaId}/avatar.${extension}`;
    const objectUrl = new URL(
      `/storage/v1/object/persona-avatars/${path}`,
      this.#supabaseUrl,
    );
    const response = await this.#fetcher(objectUrl.toString(), {
      method: "POST",
      headers: {
        apikey: this.#secretKey,
        authorization: `Bearer ${this.#secretKey}`,
        "content-type": file.type,
        "x-upsert": "true",
      },
      body: file,
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AvatarStorageUploadError(
        response.status,
        storageErrorCode(body),
      );
    }
    return {
      path,
      publicUrl: new URL(
        `/storage/v1/object/public/persona-avatars/${path}`,
        this.#supabaseUrl,
      ).toString(),
      stalePaths: Object.values(EXTENSIONS)
        .filter((candidate) => candidate !== extension)
        .map((candidate) => (
          `${owner.tenantId}/${owner.personaId}/avatar.${candidate}`
        )),
    };
  }

  async remove(paths: string[]): Promise<void> {
    await Promise.all(paths.map(async (path) => {
      const objectUrl = new URL(
        `/storage/v1/object/persona-avatars/${path}`,
        this.#supabaseUrl,
      );
      const response = await this.#fetcher(objectUrl.toString(), {
        method: "DELETE",
        headers: {
          apikey: this.#secretKey,
          authorization: `Bearer ${this.#secretKey}`,
        },
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`頭像清理失敗（HTTP ${response.status}）`);
      }
    }));
  }
}
