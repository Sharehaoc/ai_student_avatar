import {
  AvatarUploadResponseSchema,
  DeleteConversationResponseSchema,
  OwnerStudioPersonaSchema,
  OwnerStudioResponseSchema,
  PublishPersonaResponseSchema,
  PublicPersonaResponseSchema,
  StudioConversationDetailSchema,
  VisitorActivityRequestSchema,
  VisitorActivityResponseSchema,
  type OwnerPersonaDraftInput,
  type OwnerStudioPersona,
  type OwnerStudioResponse,
  type PublishPersonaResponse,
  type PublicPersonaResponse,
  type StudioConversationDetail,
} from "@flying-eagle/contracts";

import {
  VOICE_PREVIEW_REQUEST_TIMEOUT_MS,
  withRequestTimeout,
} from "../../lib/request-timeout.js";


export interface StudentStudioApi {
  getStudio(): Promise<OwnerStudioResponse>;
  saveDraft(input: OwnerPersonaDraftInput): Promise<OwnerStudioPersona>;
  publishDraft(): Promise<PublishPersonaResponse>;
  getConversation(conversationId: string): Promise<StudioConversationDetail>;
  deleteConversation(conversationId: string): Promise<void>;
  previewVoice(text: string): Promise<Blob>;
  recordVisitorActivity(personaId: string): Promise<void>;
  uploadAvatar(file: File): Promise<string>;
  getPublicPersona(personaId: string): Promise<PublicPersonaResponse>;
}

export interface CreateStudentStudioApiOptions {
  apiUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: { code?: string } };
    return body.error?.code ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}

export function createStudentStudioApi({
  apiUrl,
  getAccessToken,
  fetcher = fetch,
}: CreateStudentStudioApiOptions): StudentStudioApi {
  const baseUrl = apiUrl.replace(/\/$/, "");

  async function ownerFetch(
    path: string,
    init: RequestInit = {},
    timeoutMs?: number,
  ): Promise<Response> {
    const token = await getAccessToken();
    if (!token) throw new Error("UNAUTHORIZED");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData)) {
      headers.set("content-type", "application/json");
    }
    const response = await fetcher(
      `${baseUrl}${path}`,
      withRequestTimeout({ ...init, headers }, timeoutMs),
    );
    if (!response.ok) throw new Error(await readErrorCode(response));
    return response;
  }

  async function ownerRequest(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await ownerFetch(path, init);
    return await response.json();
  }

  return {
    getStudio: async () => OwnerStudioResponseSchema.parse(
      await ownerRequest("/owner/studio"),
    ),
    saveDraft: async (input) => OwnerStudioPersonaSchema.parse(
      await ownerRequest("/owner/persona/draft", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    ),
    publishDraft: async () => PublishPersonaResponseSchema.parse(
      await ownerRequest("/owner/persona/publish", { method: "POST" }),
    ),
    getConversation: async (conversationId) => StudioConversationDetailSchema.parse(
      await ownerRequest(`/owner/conversations/${encodeURIComponent(conversationId)}`),
    ),
    deleteConversation: async (conversationId) => {
      DeleteConversationResponseSchema.parse(await ownerRequest(
        `/owner/conversations/${encodeURIComponent(conversationId)}`,
        { method: "DELETE" },
      ));
    },
    previewVoice: async (text) => {
      const response = await ownerFetch(
        "/owner/persona/voice-preview",
        {
          method: "POST",
          body: JSON.stringify({ text }),
        },
        VOICE_PREVIEW_REQUEST_TIMEOUT_MS,
      );
      if (!response.headers.get("content-type")?.startsWith("audio/wav")) {
        throw new Error("VOICE_PREVIEW_INVALID_AUDIO");
      }
      return await response.blob();
    },
    recordVisitorActivity: async (personaId) => {
      const body = VisitorActivityRequestSchema.parse({ personaId });
      VisitorActivityResponseSchema.parse(await ownerRequest("/visitor/activity", {
        method: "POST",
        body: JSON.stringify(body),
      }));
    },
    uploadAvatar: async (file) => {
      const body = new FormData();
      body.set("avatar", file);
      const result = AvatarUploadResponseSchema.parse(await ownerRequest(
        "/owner/persona/avatar",
        { method: "POST", body },
      ));
      return result.avatarUrl;
    },
    getPublicPersona: async (personaId) => {
      const response = await fetcher(
        `${baseUrl}/personas/${encodeURIComponent(personaId)}/public`,
        withRequestTimeout(),
      );
      if (!response.ok) throw new Error(await readErrorCode(response));
      return PublicPersonaResponseSchema.parse(await response.json());
    },
  };
}
