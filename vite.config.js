import { defineConfig, loadEnv } from 'vite'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Só no `yarn dev`: executa as funções de api/ como a Vercel faz em produção.
// /api/reserva/desfazer → api/reserva/desfazer.ts; /api/reserva → api/reserva/index.ts
function vercelApiDev() {
  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    // window.HG_DEV: o que só aparece no `yarn dev` (ex.: E-{id}-{integrationId} do ensaio)
    transformIndexHtml() {
      return [{ tag: 'script', children: 'window.HG_DEV = true', injectTo: 'head-prepend' }]
    },
    configureServer(server) {
      const root = server.config.root
      const env = loadEnv('development', root, '') // .env, .env.local etc.
      for (const [key, value] of Object.entries(env)) process.env[key] ??= value

      server.middlewares.use('/api', async (req, res, next) => {
        const route = req.url.split('?')[0].replace(/\/+$/, '')
        const file = route.includes('..') ? undefined : [`api${route}.ts`, `api${route}/index.ts`]
          .map((candidate) => path.resolve(root, candidate))
          .find(existsSync)

        // rota fora da lista fechada: 404 em JSON, não o index.html
        if (!file) {
          res.statusCode = 404
          res.setHeader('content-type', 'application/json')
          return res.end(JSON.stringify({ key: 'NOT_FOUND_ERROR', message: 'Route not found' }))
        }

        try {
          const handler = (await server.ssrLoadModule(file))[req.method]
          if (!handler) {
            res.statusCode = 405
            return res.end()
          }

          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            for (const item of [].concat(value ?? [])) headers.append(key, item)
          }

          const response = await handler(new Request(`http://${req.headers.host}${req.originalUrl}`, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) || !chunks.length ? undefined : Buffer.concat(chunks),
          }))

          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            if (key !== 'set-cookie') res.setHeader(key, value)
          })
          // pelo IP da rede (http://10.0.0.x), o navegador descarta cookie Secure; localhost é exceção
          const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(req.headers.host ?? '')
          const cookies = response.headers.getSetCookie()
            .map((cookie) => local ? cookie : cookie.replace(/; Secure/i, ''))
          if (cookies.length) res.setHeader('set-cookie', cookies)
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          server.ssrFixStacktrace(error)
          console.error(`[api] ${req.method} ${req.originalUrl}`, error)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ key: 'INTERNAL_ERROR', message: 'Unexpected error' }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [vercelApiDev()],
  server: { host: true }, // escuta em 0.0.0.0: abre pelo IP local da máquina (celular na mesma rede)
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        flow: 'flow.html',
        guides: 'guias.html'
      }
    }
  }
})
