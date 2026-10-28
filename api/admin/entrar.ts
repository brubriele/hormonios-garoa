import { UnauthorizedError } from "../../src/bff/errors/app-error";
import { createAdminCookie, isAdminKey } from "../../src/bff/http/admin-session";
import { handle, readJson } from "../../src/bff/http/handle";

export const POST = handle(async (request) => {
  const { key } = await readJson<{ key?: string }>(request);

  if (typeof key !== "string" || key === "" || !(await isAdminKey(key))) {
    throw new UnauthorizedError("Invalid admin key");
  }

  return { cookies: [await createAdminCookie()] };
});
