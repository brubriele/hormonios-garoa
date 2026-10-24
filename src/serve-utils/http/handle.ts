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
        return Response.json({ key: error.key, message: error.message }, { status: error.status });
      }

      console.error("[handle]", error);
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
