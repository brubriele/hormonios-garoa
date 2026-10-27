# HTTP (`src/serve-utils/http/`)

> Índice: [`README.md`](README.md). Quem usa: [`api.md`](api.md). Erros: [`errors.md`](errors.md).

As peças da borda HTTP que todas as rotas repetiriam: a resposta, o tratamento de erro, os
cookies, a autenticação do cron e do webhook e o IP real. Não têm regra de negócio.

## Regras

| # | Regra |
|---|---|
| H1 | Toda rota é `export const <VERBO> = handle(async (request) => ...)`. O `handle` converte `AppError` em `{ key, message }` com o `status` do erro, e qualquer outro erro em `500` `INTERNAL_ERROR`. |
| H2 | A função da rota devolve `IHttpResult` (`{ status?, body?, cookies? }`). Sem `body`, a resposta é `204`. |
| H3 | O corpo é lido com `readJson<T>(request)` e precisa ser um objeto JSON. Um corpo que não é JSON, ou que é `null`, array ou outro valor que não seja objeto, vira `InvalidParameterError`. |
| H4 | Cookie sempre por `buildCookie`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. |
| H5 | **`hg_device`:** `getOrCreateDevice(request)` devolve o `deviceId`. Quando o aparelho ainda não tem um, devolve também o `cookie` para a rota gravar. É um UUID aleatório que vale 1 ano. |
| H6 | **`hg_admin`:** `createAdminCookie()` grava, com validade de 12 h. `requireAdmin(request)` lança `UnauthorizedError` sem um cookie válido. A assinatura é HMAC-SHA256 por WebCrypto, com `COOKIE_KEY`. |
| H7 | **`ADMIN_KEY`:** comparada só por `isAdminKey(candidate)`, em tempo constante. Nunca use `===` na chave. |
| H8 | Só WebCrypto (`globalThis.crypto`) e `btoa`/`atob`. Sem `node:*` (G4). Env lida na chamada. |
| H9 | **Cron:** `requireCron(request)` (`http/cron-auth.ts`) exige `Authorization: Bearer <CRON_SECRET>` e lança `UnauthorizedError`. A comparação é pelo SHA-256 dos dois valores (WebCrypto `digest`), em tempo constante. |
| H10 | **Webhook:** `requireWebhookKey(request)` (`http/webhook-auth.ts`) confere o header `api-key` com o `WEBHOOK_API_KEY`, pelo SHA-256 dos dois, em tempo constante. Falhou → `UnauthorizedError`. |
| H11 | **IP real:** `clientIp(request)` (`http/client-ip.ts`) devolve o primeiro IP do `x-forwarded-for` que a Vercel repassa, ou `null`. A rota passa o IP ao usecase, que o repassa ao repo do Transicionais (`docs/spec/fase-2.md`). |

## Exemplo

```ts
// src/serve-utils/http/handle.ts
import { AppError, InvalidParameterError } from "../errors/app-error";

export interface IHttpResult {
  status?: number; // padrão: 200 com body, 204 sem
  body?: unknown;
  cookies?: string[]; // um Set-Cookie por item
}

export function handle(fn: (request: Request) => Promise<IHttpResult>) {
  return async (request: Request): Promise<Response> => {
    try {
      const result = await fn(request);
      const headers = new Headers();
      result.cookies?.forEach((cookie) => headers.append("Set-Cookie", cookie));

      if (result.body === undefined) {
        return new Response(null, { status: result.status ?? 204, headers });
      }

      return Response.json(result.body, { status: result.status ?? 200, headers });
    } catch (error) {
      if (error instanceof AppError) {
        logger.warn({ key: error.key, status: error.status }, error.message);
        return Response.json({ key: error.key, message: error.message }, { status: error.status });
      }

      logger.error({ err: error }, "unhandled error");
      return Response.json({ key: "INTERNAL_ERROR", message: "Unexpected error" }, { status: 500 });
    }
  };
}

export async function readJson<T>(request: Request): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new InvalidParameterError("Body must be JSON");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidParameterError("Body must be a JSON object");
  }

  return body as T;
}
```

```ts
// src/serve-utils/http/cookies.ts
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");

  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

export function buildCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
```

```ts
// src/serve-utils/http/device.ts
import type { UUID } from "../interfaces/uuid";
import { buildCookie, readCookie } from "./cookies";

const DEVICE_COOKIE = "hg_device";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getOrCreateDevice(request: Request): { deviceId: UUID; cookie?: string } {
  const current = readCookie(request, DEVICE_COOKIE);

  if (current && UUID_PATTERN.test(current)) {
    return { deviceId: current as UUID };
  }

  const deviceId = globalThis.crypto.randomUUID();

  return { deviceId, cookie: buildCookie(DEVICE_COOKIE, deviceId, ONE_YEAR_SECONDS) };
}
```

```ts
// src/serve-utils/http/cron-auth.ts
import { UnauthorizedError } from "../errors/app-error";

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

// compara os hashes byte a byte, sem sair cedo
export async function requireCron(request: Request): Promise<void> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    throw new Error("CRON_SECRET is not set");
  }

  const [expected, received] = await Promise.all([
    digest(`Bearer ${secret}`),
    digest(request.headers.get("authorization") ?? ""),
  ]);
  let diff = 0;
  expected.forEach((byte, index) => (diff |= byte ^ received[index]));

  if (diff !== 0) {
    throw new UnauthorizedError("Cron secret required");
  }
}
```

```ts
// src/serve-utils/http/admin-session.ts
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
```
