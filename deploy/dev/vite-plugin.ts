import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv, type Plugin } from "vite";
import { CYAN, DIM, logTiming, paint, timeUpstreamFetch } from "../shared/trace-fetch";

// spec-5 A1, A2
export function apiDevPlugin(): Plugin {
  return {
    name: "api-dev",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root;
      const env = loadEnv("development", root, "");
      for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
      timeUpstreamFetch();

      server.middlewares.use("/api", async (req, res) => {
        const method = req.method ?? "GET";
        const originalUrl = req.originalUrl ?? req.url ?? "";
        const startedAt = performance.now();
        // check-ignore console: saída colorida do terminal do vite (spec-3 E1)
        console.debug(`${paint("[api]", DIM)} ${paint(method, CYAN)} ${originalUrl} ${paint("…", DIM)}`);
        res.on("finish", () => logTiming("api", method, originalUrl, res.statusCode, startedAt));

        const route = (req.url ?? "").split("?")[0].replace(/\/+$/, "");
        const candidates = route.includes("..") ? [] : [`api${route}.ts`, `api${route}/index.ts`];
        const file = candidates.map((candidate) => path.resolve(root, candidate)).find(existsSync);

        // rota fora da lista fechada: 404 em JSON, não o index.html
        if (!file) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ key: "NOT_FOUND_ERROR", message: "Route not found" }));
          return;
        }

        try {
          const module = await server.ssrLoadModule(file);
          const handler: ((request: Request) => Promise<Response>) | undefined = module[method];

          if (!handler) {
            res.statusCode = 405;
            res.end();
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            for (const item of ([] as string[]).concat(value ?? [])) headers.append(key, item);
          }

          const hasBody = !["GET", "HEAD"].includes(method) && chunks.length > 0;
          const request = new Request(`http://${req.headers.host}${originalUrl}`, {
            method,
            headers,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          });
          const response = await handler(request);

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key !== "set-cookie") res.setHeader(key, value);
          });
          // pelo IP da rede (http://10.0.0.x), o navegador descarta cookie Secure; localhost é exceção
          const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(req.headers.host ?? "");
          const cookies = response.headers
            .getSetCookie()
            .map((cookie) => (local ? cookie : cookie.replace(/; Secure/i, "")));
          if (cookies.length) res.setHeader("set-cookie", cookies);
          const body = await response.arrayBuffer();
          res.end(Buffer.from(body));
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          // check-ignore console: stack do vite com ssrFixStacktrace
          console.error(`[api] ${method} ${originalUrl}`, error);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ key: "INTERNAL_ERROR", message: "Unexpected error" }));
        }
      });
    },
  };
}
