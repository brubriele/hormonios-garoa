import { defineConfig, loadEnv } from 'vite'
import { existsSync } from 'node:fs'
import path from 'node:path'

const GREEN = 32
const YELLOW = 33
const RED = 31
const CYAN = 36
const DIM = 2

function paint(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`
}

function logTiming(label, method, url, statusCode, startedAt) {
  const ms = Math.round(performance.now() - startedAt)
  const status = paint(statusCode, statusCode >= 500 || statusCode === 0 ? RED : statusCode >= 400 ? YELLOW : GREEN)
  const time = paint(`${ms} ms`, ms >= 1000 ? RED : ms >= 300 ? YELLOW : GREEN)
  console.debug(`${paint(`[${label}]`, DIM)} ${paint(method, CYAN)} ${url} → ${status} (${time})`)
}

// [supabase] e [transicionais]: o tempo de cada chamada, pelo fetch global
function timeUpstreamFetch() {
  const upstreams = [
    ['supabase', process.env.SUPABASE_URL],
    ['transicionais', process.env.TRANSICIONAIS_URL],
  ].filter(([, baseUrl]) => baseUrl)
  globalThis.hgOriginalFetch ??= globalThis.fetch
  const originalFetch = globalThis.hgOriginalFetch

  if (!upstreams.length) return

  const timedFetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const upstream = upstreams.find(([, baseUrl]) => url.startsWith(baseUrl))

    if (!upstream) return originalFetch(input, init)

    const label = upstream[0]
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const { pathname, search } = new URL(url)
    const shown = decodeURIComponent(pathname + search).slice(0, 120)
    const startedAt = performance.now()

    try {
      const response = await originalFetch(input, init)
      logTiming(label, method, shown, response.status, startedAt)
      return response
    } catch (error) {
      logTiming(label, method, shown, 0, startedAt)
      throw error
    }
  }

  globalThis.fetch = timedFetch
}

// Só no `yarn dev`: executa as funções de api/ como a Vercel faz em produção.
// /api/reserva/desfazer → api/reserva/desfazer.ts; /api/reserva → api/reserva/index.ts
function vercelApiDev() {
  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      const env = loadEnv('development', root, '') // .env, .env.local etc.
      for (const [key, value] of Object.entries(env)) process.env[key] ??= value
      timeUpstreamFetch()

      server.middlewares.use('/api', async (req, res, next) => {
        const startedAt = performance.now()
        console.debug(`${paint('[api]', DIM)} ${paint(req.method, CYAN)} ${req.originalUrl} ${paint('…', DIM)}`)
        res.on('finish', () => logTiming('api', req.method, req.originalUrl, res.statusCode, startedAt))

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
