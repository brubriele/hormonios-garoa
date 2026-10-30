import { UnauthorizedError } from "../errors/app-error";

const encoder = new TextEncoder();

export async function digest(value: string): Promise<Uint8Array> {
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
