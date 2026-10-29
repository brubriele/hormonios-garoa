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
