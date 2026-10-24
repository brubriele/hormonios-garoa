import { UnauthorizedError } from "../errors/app-error";
import { buildCookie, readCookie } from "./cookies";

const ADMIN_COOKIE = "hg_admin";
const TWELVE_HOURS_SECONDS = 60 * 60 * 12;
const encoder = new TextEncoder();

function readEnv(name: "COOKIE_KEY" | "ADMIN_KEY"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

async function hmacKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(readEnv("COOKIE_KEY")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string): Promise<string> {
  const signature = await globalThis.crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// verify do WebCrypto compara em tempo constante
async function verify(payload: string, signature: string): Promise<boolean> {
  try {
    const bytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0));

    return await globalThis.crypto.subtle.verify("HMAC", await hmacKey(), bytes, encoder.encode(payload));
  } catch {
    return false;
  }
}

// HMAC(candidate) === HMAC(ADMIN_KEY), sem comparar a chave com ===
export async function isAdminKey(candidate: string): Promise<boolean> {
  return verify(readEnv("ADMIN_KEY"), await sign(candidate));
}

export async function createAdminCookie(): Promise<string> {
  const expiresAt = String(Date.now() + TWELVE_HOURS_SECONDS * 1000);

  return buildCookie(ADMIN_COOKIE, `${expiresAt}.${await sign(expiresAt)}`, TWELVE_HOURS_SECONDS);
}

export async function requireAdmin(request: Request): Promise<void> {
  const [expiresAt, signature] = (readCookie(request, ADMIN_COOKIE) ?? "").split(".");

  if (!expiresAt || !signature || !(await verify(expiresAt, signature))) {
    throw new UnauthorizedError("Admin session required");
  }

  if (Number(expiresAt) < Date.now()) {
    throw new UnauthorizedError("Admin session expired");
  }
}
