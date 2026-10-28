import { buildCookie, readCookie } from "./cookies";

const USER_COOKIE = "hg_user";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// D3
export function readUserId(request: Request): string | null {
  return readCookie(request, USER_COOKIE);
}

export function createUserCookie(userId: string): string {
  return buildCookie(USER_COOKIE, userId, ONE_YEAR_SECONDS);
}
