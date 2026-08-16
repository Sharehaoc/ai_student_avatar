import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions } from "jose";

import type { AuthenticatedUser, AuthVerifier } from "../app.js";


export function extractBearerToken(header: string | null): string {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
  if (!match) {
    throw new Error("UNAUTHORIZED");
  }
  return match[1]!;
}

export interface SupabaseJwtVerifierOptions {
  supabaseUrl: string;
  audience?: string;
}

export class SupabaseJwtVerifier implements AuthVerifier {
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;
  readonly #verifyOptions: JWTVerifyOptions;

  constructor({ supabaseUrl, audience = "authenticated" }: SupabaseJwtVerifierOptions) {
    const projectUrl = new URL(supabaseUrl);
    const localHttp = projectUrl.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(projectUrl.hostname);
    if (projectUrl.protocol !== "https:" && !localHttp) {
      throw new Error("SUPABASE_URL 必須使用 https://");
    }
    const issuer = new URL("/auth/v1", projectUrl).toString().replace(/\/$/, "");
    const jwksUrl = new URL("/auth/v1/.well-known/jwks.json", projectUrl);
    this.#jwks = createRemoteJWKSet(jwksUrl);
    this.#verifyOptions = {
      issuer,
      audience,
      algorithms: ["ES256", "RS256"],
    };
  }

  async verifyAuthorizationHeader(header: string | null): Promise<AuthenticatedUser> {
    const accessToken = extractBearerToken(header);
    const { payload } = await jwtVerify(accessToken, this.#jwks, this.#verifyOptions);
    if (typeof payload.sub !== "string" || !payload.sub.trim()) {
      throw new Error("UNAUTHORIZED");
    }
    if (payload.role !== "authenticated") {
      throw new Error("UNAUTHORIZED");
    }
    const userMetadata = payload.user_metadata;
    const displayName = userMetadata
      && typeof userMetadata === "object"
      && "display_name" in userMetadata
      && typeof userMetadata.display_name === "string"
      ? userMetadata.display_name.trim().slice(0, 100)
      : null;
    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
      displayName: displayName || null,
    };
  }
}
