import {
  ConversationStatusResponseSchema,
  CreateConversationRequestSchema,
  CreateConversationResponseSchema,
  AvatarUploadResponseSchema,
  DeleteConversationResponseSchema,
  OwnerPersonaDraftInputSchema,
  OwnerStudioPersonaSchema,
  OwnerStudioResponseSchema,
  PublishPersonaResponseSchema,
  PublicPersonaResponseSchema,
  StudioConversationDetailSchema,
  VisitorActivityRequestSchema,
  VisitorActivityResponseSchema,
  VoicePreviewRequestSchema,
  UuidSchema,
  UsageLimitResultSchema,
  VoiceRuntimeContextSchema,
  VoiceRuntimeMessageRequestSchema,
  VoiceRuntimeMessageResultSchema,
  VoiceRuntimeStateRequestSchema,
  VoiceRuntimeStateResultSchema,
  VoiceSessionRequestSchema,
  VoiceTokenResponseSchema,
  type UsageLimitResult,
  type ConversationStatusResponse,
  type CreateConversationResponse,
  type OwnerPersonaDraftInput,
  type OwnerStudioPersona,
  type OwnerStudioResponse,
  type PublishPersonaResponse,
  type PublicPersonaResponse,
  type StudioConversationDetail,
  type VoiceRuntimeContext,
  type VoiceRuntimeMessageRequest,
  type VoiceRuntimeMessageResult,
  type VoiceRuntimeState,
  type VoiceRuntimeStateResult,
  type VoiceTokenResponse,
  type VoiceSnapshot,
} from "@flying-eagle/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";

import {
  matchesVoiceInternalToken,
  validateVoiceInternalToken,
} from "./auth/internal-token.js";
import {
  InvalidAvatarFileError,
  validateAvatarFile,
} from "./storage/avatar-file.js";
import { AvatarStorageUploadError } from "./storage/supabase-avatar-storage.js";


export interface AuthenticatedUser {
  userId: string;
  email?: string | null;
  displayName?: string | null;
}

export interface ConversationVoiceContext {
  conversationId: string;
  tenantId: string;
  visitorUserId: string;
  personaVersionId: string;
  status: "PENDING" | "CONNECTING";
}

export interface AuthVerifier {
  verifyAuthorizationHeader(header: string | null): Promise<AuthenticatedUser>;
}

export interface ConversationRepository {
  createForUser(
    personaId: string,
    userId: string,
    profile?: { email: string | null; displayName: string | null },
  ): Promise<CreateConversationResponse | null>;
  findVoiceContextForUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationVoiceContext | null>;
  findStatusForUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationStatusResponse | null>;
  recordActivity(
    personaId: string,
    userId: string,
    profile: { email: string | null; displayName: string | null },
  ): Promise<boolean>;
}

export interface VoiceAdmission {
  evaluate(context: ConversationVoiceContext): Promise<UsageLimitResult>;
}

export interface VoiceTokenIssuer {
  issue(context: ConversationVoiceContext): Promise<VoiceTokenResponse>;
}

export interface VoiceRuntimeRepository {
  findContext(conversationId: string): Promise<VoiceRuntimeContext | null>;
  appendMessage(
    conversationId: string,
    message: VoiceRuntimeMessageRequest,
  ): Promise<VoiceRuntimeMessageResult | null>;
  transitionState(
    conversationId: string,
    state: VoiceRuntimeState,
  ): Promise<VoiceRuntimeStateResult | null>;
}

export interface OwnedPersonaIdentity {
  personaId: string;
  tenantId: string;
}

export interface VoicePreviewContext {
  voice: VoiceSnapshot;
  pronunciationFixes: Record<string, string>;
}

export interface VoicePreviewInput extends VoicePreviewContext {
  text: string;
}

export interface VoicePreviewResult {
  audio: Uint8Array;
  contentType: "audio/wav";
}

export interface VoicePreviewClient {
  synthesize(input: VoicePreviewInput): Promise<VoicePreviewResult>;
}

export interface VoicePreviewLimiter {
  consume(userId: string): Promise<{
    allowed: boolean;
    retryAfterSeconds: number | null;
  }>;
}

export interface ApiRequestLog {
  event: "http_request_completed";
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  level: "info" | "error";
}

export interface ApiRequestLogger {
  write(entry: ApiRequestLog): void;
}

export interface OwnerStudioRepository {
  getStudio(userId: string): Promise<OwnerStudioResponse | null>;
  saveDraft(
    userId: string,
    input: OwnerPersonaDraftInput,
  ): Promise<OwnerStudioPersona | null>;
  publishDraft(userId: string): Promise<PublishPersonaResponse | null>;
  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<StudioConversationDetail | null>;
  findOwnedPersona(userId: string): Promise<OwnedPersonaIdentity | null>;
  updateAvatarPath(userId: string, avatarPath: string): Promise<boolean>;
  restoreVersion(
    userId: string,
    personaVersionId: string,
  ): Promise<OwnerStudioPersona | null>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  findPublicPersona(personaId: string): Promise<PublicPersonaResponse | null>;
  findVoicePreviewContext(userId: string): Promise<VoicePreviewContext | null>;
}

export interface AvatarStorageUpload {
  path: string;
  publicUrl: string;
  stalePaths: string[];
}

export interface AvatarStorage {
  upload(
    owner: OwnedPersonaIdentity,
    file: File,
  ): Promise<AvatarStorageUpload>;
  remove(paths: string[]): Promise<void>;
}

export interface ApiDependencies {
  auth: AuthVerifier;
  conversations: ConversationRepository;
  admission: VoiceAdmission;
  tokenIssuer: VoiceTokenIssuer;
  voiceRuntime: VoiceRuntimeRepository;
  ownerStudio: OwnerStudioRepository;
  avatarStorage: AvatarStorage;
  voiceInternalToken: string;
  voicePreview: VoicePreviewClient;
  voicePreviewLimiter: VoicePreviewLimiter;
  requestLogger?: ApiRequestLogger;
  webOrigin?: string;
}


export function createApi(dependencies: ApiDependencies): Hono {
  const app = new Hono();
  const voiceInternalToken = validateVoiceInternalToken(dependencies.voiceInternalToken);
  const jsonBodyLimit = bodyLimit({
    maxSize: 64 * 1024,
    onError: (context) => context.json({
      error: { code: "PAYLOAD_TOO_LARGE" },
    }, 413),
  });
  const avatarBodyLimit = bodyLimit({
    maxSize: 5_500_000,
    onError: (context) => context.json({
      error: { code: "PAYLOAD_TOO_LARGE" },
    }, 413),
  });

  function parsePathUuid(value: string): string | null {
    const result = UuidSchema.safeParse(value);
    return result.success ? result.data : null;
  }

  app.use("/*", async (context, next) => {
    const requestId = globalThis.crypto.randomUUID();
    const startedAt = performance.now();
    context.header("x-request-id", requestId);

    try {
      await next();
    } finally {
      if (dependencies.requestLogger) {
        const status = context.res.status;
        try {
          dependencies.requestLogger.write({
            event: "http_request_completed",
            timestamp: new Date().toISOString(),
            requestId,
            method: context.req.method,
            path: new URL(context.req.url).pathname,
            status,
            durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
            level: status >= 500 ? "error" : "info",
          });
        } catch {
          // Logging must never turn a completed API response into a failure.
        }
      }
    }
  });

  if (dependencies.webOrigin) {
    app.use("/*", cors({
      origin: dependencies.webOrigin,
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: false,
      maxAge: 600,
    }));
  }

  app.onError((_error, context) => context.json({
    error: { code: "INTERNAL_SERVER_ERROR" },
  }, 500));

  app.get("/health", (context) => context.json({ status: "ok" }));

  app.post("/conversations", jsonBodyLimit, async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }

    let requestBody: unknown;
    try {
      requestBody = await context.req.json();
    } catch {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const request = CreateConversationRequestSchema.safeParse(requestBody);
    if (!request.success) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }

    const created = await dependencies.conversations.createForUser(
      request.data.personaId,
      authenticatedUser.userId,
      {
        email: authenticatedUser.email ?? null,
        displayName: authenticatedUser.displayName ?? null,
      },
    );
    if (!created) {
      return context.json({ error: { code: "PERSONA_NOT_AVAILABLE" } }, 404);
    }
    return context.json(CreateConversationResponseSchema.parse(created), 201);
  });

  app.get("/conversations/:conversationId/status", async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }

    const conversationId = parsePathUuid(context.req.param("conversationId"));
    if (!conversationId) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const status = await dependencies.conversations.findStatusForUser(
      conversationId,
      authenticatedUser.userId,
    );
    if (!status) {
      return context.json({ error: { code: "CONVERSATION_NOT_FOUND" } }, 404);
    }
    return context.json(ConversationStatusResponseSchema.parse(status), 200);
  });

  app.post("/visitor/activity", jsonBodyLimit, async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const request = VisitorActivityRequestSchema.safeParse(body);
    if (!request.success) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const recorded = await dependencies.conversations.recordActivity(
      request.data.personaId,
      authenticatedUser.userId,
      {
        email: authenticatedUser.email ?? null,
        displayName: authenticatedUser.displayName ?? null,
      },
    );
    if (!recorded) {
      return context.json({ error: { code: "PERSONA_NOT_AVAILABLE" } }, 404);
    }
    return context.json(VisitorActivityResponseSchema.parse({ recorded: true }), 200);
  });

  app.post("/voice/sessions/token", jsonBodyLimit, async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }

    let requestBody: unknown;
    try {
      requestBody = await context.req.json();
    } catch {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const request = VoiceSessionRequestSchema.safeParse(requestBody);
    if (!request.success) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }

    const voiceContext = await dependencies.conversations.findVoiceContextForUser(
      request.data.conversationId,
      authenticatedUser.userId,
    );
    if (!voiceContext) {
      return context.json({ error: { code: "CONVERSATION_NOT_FOUND" } }, 404);
    }

    const admission = UsageLimitResultSchema.parse(
      await dependencies.admission.evaluate(voiceContext),
    );
    if (!admission.allowed) {
      if (admission.retryAfterSeconds !== null) {
        context.header("retry-after", String(admission.retryAfterSeconds));
      }
      return context.json({ error: admission }, 429);
    }

    const response = VoiceTokenResponseSchema.parse(
      await dependencies.tokenIssuer.issue(voiceContext),
    );
    return context.json(response, 200);
  });

  app.get("/owner/studio", async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    const studio = await dependencies.ownerStudio.getStudio(authenticatedUser.userId);
    if (!studio) {
      return context.json({ error: { code: "OWNER_STUDIO_NOT_FOUND" } }, 404);
    }
    return context.json(OwnerStudioResponseSchema.parse(studio), 200);
  });

  app.put("/owner/persona/draft", jsonBodyLimit, async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const request = OwnerPersonaDraftInputSchema.safeParse(body);
    if (!request.success) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const persona = await dependencies.ownerStudio.saveDraft(
      authenticatedUser.userId,
      request.data,
    );
    if (!persona) {
      return context.json({ error: { code: "OWNER_STUDIO_NOT_FOUND" } }, 404);
    }
    return context.json(OwnerStudioPersonaSchema.parse(persona), 200);
  });

  app.post("/owner/persona/publish", async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    const result = await dependencies.ownerStudio.publishDraft(authenticatedUser.userId);
    if (!result) {
      return context.json({ error: { code: "OWNER_STUDIO_NOT_FOUND" } }, 404);
    }
    return context.json(PublishPersonaResponseSchema.parse(result), 201);
  });

  app.post("/owner/persona/voice-preview", jsonBodyLimit, async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const request = VoicePreviewRequestSchema.safeParse(body);
    if (!request.success) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const previewLimit = await dependencies.voicePreviewLimiter.consume(
      authenticatedUser.userId,
    );
    if (!previewLimit.allowed) {
      context.header("retry-after", String(previewLimit.retryAfterSeconds ?? 60));
      return context.json({ error: { code: "VOICE_PREVIEW_RATE_LIMIT" } }, 429);
    }

    const previewContext = await dependencies.ownerStudio.findVoicePreviewContext(
      authenticatedUser.userId,
    );
    if (!previewContext) {
      return context.json({ error: { code: "OWNER_STUDIO_NOT_FOUND" } }, 404);
    }
    const result = await dependencies.voicePreview.synthesize({
      text: request.data.text,
      ...previewContext,
    });
    context.header("cache-control", "no-store");
    context.header("content-type", result.contentType);
    return context.body(Uint8Array.from(result.audio).buffer);
  });

  app.get("/owner/conversations/:conversationId", async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    const conversationId = parsePathUuid(context.req.param("conversationId"));
    if (!conversationId) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const result = await dependencies.ownerStudio.getConversation(
      authenticatedUser.userId,
      conversationId,
    );
    if (!result) {
      return context.json({ error: { code: "CONVERSATION_NOT_FOUND" } }, 404);
    }
    return context.json(StudioConversationDetailSchema.parse(result), 200);
  });

  app.delete("/owner/conversations/:conversationId", async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    const conversationId = parsePathUuid(context.req.param("conversationId"));
    if (!conversationId) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const deleted = await dependencies.ownerStudio.deleteConversation(
      authenticatedUser.userId,
      conversationId,
    );
    if (!deleted) {
      return context.json({ error: { code: "CONVERSATION_NOT_FOUND" } }, 404);
    }
    return context.json(DeleteConversationResponseSchema.parse({
      conversationId,
      deleted: true,
    }), 200);
  });

  app.post("/owner/persona/versions/:personaVersionId/restore", async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    const personaVersionId = parsePathUuid(context.req.param("personaVersionId"));
    if (!personaVersionId) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const persona = await dependencies.ownerStudio.restoreVersion(
      authenticatedUser.userId,
      personaVersionId,
    );
    if (!persona) {
      return context.json({ error: { code: "PERSONA_VERSION_NOT_FOUND" } }, 404);
    }
    return context.json(OwnerStudioPersonaSchema.parse(persona), 200);
  });

  app.post("/owner/persona/avatar", avatarBodyLimit, async (context) => {
    let authenticatedUser: AuthenticatedUser;
    try {
      authenticatedUser = await dependencies.auth.verifyAuthorizationHeader(
        context.req.header("authorization") ?? null,
      );
    } catch {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    let body: Record<string, string | File>;
    try {
      body = await context.req.parseBody();
    } catch {
      return context.json({ error: { code: "INVALID_AVATAR" } }, 400);
    }
    const avatar = body.avatar;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!(avatar instanceof File)
      || avatar.size <= 0
      || avatar.size > 5 * 1024 * 1024
      || !allowedTypes.has(avatar.type)) {
      return context.json({ error: { code: "INVALID_AVATAR" } }, 400);
    }
    try {
      await validateAvatarFile(avatar);
    } catch (error) {
      if (error instanceof InvalidAvatarFileError) {
        return context.json({ error: { code: "INVALID_AVATAR" } }, 400);
      }
      throw error;
    }
    const owner = await dependencies.ownerStudio.findOwnedPersona(authenticatedUser.userId);
    if (!owner) {
      return context.json({ error: { code: "OWNER_STUDIO_NOT_FOUND" } }, 404);
    }
    let uploaded: AvatarStorageUpload;
    try {
      uploaded = await dependencies.avatarStorage.upload(owner, avatar);
    } catch (error) {
      if (error instanceof AvatarStorageUploadError) {
        console.error(JSON.stringify({
          event: "avatar_storage_upload_failed",
          status: error.status,
          storageCode: error.storageCode,
        }));
        return context.json({ error: { code: "AVATAR_STORAGE_UPLOAD_FAILED" } }, 502);
      }
      throw error;
    }
    const updated = await dependencies.ownerStudio.updateAvatarPath(
      authenticatedUser.userId,
      uploaded.path,
    );
    if (!updated) {
      await dependencies.avatarStorage.remove([uploaded.path]).catch(() => undefined);
      return context.json({ error: { code: "OWNER_STUDIO_NOT_FOUND" } }, 404);
    }
    await dependencies.avatarStorage.remove(uploaded.stalePaths).catch(() => undefined);
    return context.json(AvatarUploadResponseSchema.parse({
      avatarUrl: uploaded.publicUrl,
    }), 200);
  });

  app.get("/personas/:personaId/public", async (context) => {
    const personaId = parsePathUuid(context.req.param("personaId"));
    if (!personaId) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const persona = await dependencies.ownerStudio.findPublicPersona(
      personaId,
    );
    if (!persona) {
      return context.json({ error: { code: "PERSONA_NOT_AVAILABLE" } }, 404);
    }
    return context.json(PublicPersonaResponseSchema.parse(persona), 200);
  });

  function internalRequestIsAuthorized(header: string | undefined): boolean {
    return matchesVoiceInternalToken(header ?? null, voiceInternalToken);
  }

  app.get("/internal/voice/sessions/:conversationId/context", async (context) => {
    if (!internalRequestIsAuthorized(context.req.header("x-voice-internal-token"))) {
      return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    const conversationId = parsePathUuid(context.req.param("conversationId"));
    if (!conversationId) {
      return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
    }
    const runtimeContext = await dependencies.voiceRuntime.findContext(conversationId);
    if (!runtimeContext) {
      return context.json({ error: { code: "VOICE_SESSION_NOT_FOUND" } }, 404);
    }
    return context.json(VoiceRuntimeContextSchema.parse(runtimeContext), 200);
  });

  app.post(
    "/internal/voice/sessions/:conversationId/messages",
    jsonBodyLimit,
    async (context) => {
      if (!internalRequestIsAuthorized(context.req.header("x-voice-internal-token"))) {
        return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
      }
      const conversationId = parsePathUuid(context.req.param("conversationId"));
      if (!conversationId) {
        return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
      }
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
      }
      const request = VoiceRuntimeMessageRequestSchema.safeParse(body);
      if (!request.success) {
        return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
      }
      const result = await dependencies.voiceRuntime.appendMessage(
        conversationId,
        request.data,
      );
      if (!result) {
        return context.json({ error: { code: "VOICE_SESSION_NOT_FOUND" } }, 404);
      }
      return context.json(VoiceRuntimeMessageResultSchema.parse(result), 201);
    },
  );

  app.post(
    "/internal/voice/sessions/:conversationId/state",
    jsonBodyLimit,
    async (context) => {
      if (!internalRequestIsAuthorized(context.req.header("x-voice-internal-token"))) {
        return context.json({ error: { code: "UNAUTHORIZED" } }, 401);
      }
      const conversationId = parsePathUuid(context.req.param("conversationId"));
      if (!conversationId) {
        return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
      }
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
      }
      const request = VoiceRuntimeStateRequestSchema.safeParse(body);
      if (!request.success) {
        return context.json({ error: { code: "INVALID_REQUEST" } }, 400);
      }
      const result = await dependencies.voiceRuntime.transitionState(
        conversationId,
        request.data.state,
      );
      if (!result) {
        return context.json({ error: { code: "VOICE_SESSION_NOT_FOUND" } }, 404);
      }
      return context.json(VoiceRuntimeStateResultSchema.parse(result), 200);
    },
  );

  return app;
}
