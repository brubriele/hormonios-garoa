// Chama uma rota /api/cron/* como o Worker faz (Authorization: Bearer <CRON_SECRET>).
// Uso: node scripts/cron.mjs <event|sync> [--type=<tipo>] [BFF_URL]
//      yarn cron:event [BFF_URL]                → GET /api/cron/event
//      yarn cron:sync --type=nextEvent [BFF_URL] → GET /api/cron/sync?type=nextEvent
//      tipos do sync: nextEvent, stock, booking
// BFF_URL padrão: BFF_URL do .env.local ou http://localhost:5173
import { existsSync } from 'node:fs'

const ROUTES = ['event', 'sync']
const SYNC_TYPES = ['nextEvent', 'stock', 'booking']

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file) // não sobrescreve o que já está no ambiente
}

const route = process.argv[2]

if (!ROUTES.includes(route)) {
  console.error(`Rota de cron inválida: ${route ?? '(vazia)'}. Use uma de: ${ROUTES.join(', ')}`)
  process.exit(1)
}

const args = process.argv.slice(3)
const type = args.find((arg) => arg.startsWith('--type='))?.slice('--type='.length)
const baseUrl = (args.find((arg) => !arg.startsWith('--')) ?? process.env.BFF_URL ?? 'http://localhost:5173').replace(/\/$/, '')

if (route === 'sync' && !SYNC_TYPES.includes(type)) {
  console.error(`--type inválido: ${type ?? '(vazio)'}. Use um de: ${SYNC_TYPES.join(', ')}`)
  process.exit(1)
}
const secret = process.env.CRON_SECRET

if (!secret) {
  console.error('CRON_SECRET não está definido (.env.local)')
  process.exit(1)
}

const url = `${baseUrl}/api/cron/${route}${route === 'sync' ? `?type=${type}` : ''}`
const startedAt = Date.now()
const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } })
const text = await response.text()

console.log(`GET ${url} → ${response.status} (${Date.now() - startedAt} ms)`)
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2))
} catch {
  console.log(text)
}

if (!response.ok) process.exit(1)
