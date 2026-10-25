import { z } from "zod";
import { UnauthorizedError } from "../errors/app-error";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const WEBHOOK_ROLE = "SERVICE";
const WEBHOOK_AUDIENCE = "hormonios";

// cabeçalho do JWT: só HS256
const JwtHeaderSchema = z.object({ alg: z.literal("HS256") });

// claims do JWT do Transicionais (as outras ficam como vieram)
const WebhookJwtPayloadSchema = z.looseObject({
  role: z.string(),
  exp: z.number(), // segundos desde a época
  aud: z.union([z.string(), z.array(z.string())]).optional(),
});

export type IWebhookJwtPayload = z.infer<typeof WebhookJwtPayloadSchema>;

function readKey(): string {
  const key = process.env.TRANSICIONAIS_JWT_KEY;

  if (!key) {
    throw new Error("TRANSICIONAIS_JWT_KEY is not set");
  }

  return key;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function decodeJson(segment: string): unknown {
  return JSON.parse(decoder.decode(base64UrlToBytes(segment)));
}

// aud é opcional; se vier, precisa ser o do Hormônios
function hasAudience(aud: IWebhookJwtPayload["aud"]): boolean {
  if (aud === undefined) {
    return true;
  }

  return Array.isArray(aud) ? aud.includes(WEBHOOK_AUDIENCE) : aud === WEBHOOK_AUDIENCE;
}

// verify do WebCrypto compara em tempo constante
async function verifySignature(signingInput: string, signature: string): Promise<boolean> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(readKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return globalThis.crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), encoder.encode(signingInput));
}

async function parseToken(token: string): Promise<IWebhookJwtPayload | null> {
  const [header, payload, signature, ...rest] = token.split(".");

  if (!header || !payload || !signature || rest.length > 0) {
    return null;
  }

  try {
    JwtHeaderSchema.parse(decodeJson(header));

    if (!(await verifySignature(`${header}.${payload}`, signature))) {
      return null;
    }

    return WebhookJwtPayloadSchema.parse(decodeJson(payload));
  } catch {
    return null; // base64, JSON ou formato (zod) inválido
  }
}

// H10: Authorization: Bearer <JWT> do Transicionais, HS256 com TRANSICIONAIS_JWT_KEY, exp no futuro,
// role SERVICE e, se vier, aud "hormonios". Falhou -> UnauthorizedError. Devolve o payload
// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export async function verifyWebhookJwt(request: Request): Promise<IWebhookJwtPayload> {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new UnauthorizedError("Webhook token required");
  }

  const payload = await parseToken(token);

  if (!payload) {
    throw new UnauthorizedError("Webhook token is invalid");
  }

  if (payload.exp * 1000 <= Date.now()) {
    throw new UnauthorizedError("Webhook token expired");
  }

  if (payload.role !== WEBHOOK_ROLE || !hasAudience(payload.aud)) {
    throw new UnauthorizedError("Webhook token is not allowed");
  }

  return payload;
}
