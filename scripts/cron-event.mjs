// Chama GET /api/cron/event como o Worker faz (Authorization: Bearer <CRON_SECRET>).
// Uso: yarn cron:event [BFF_URL]   (padrão: BFF_URL do .env.local ou http://localhost:5173)
import { existsSync } from 'node:fs'

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file) // não sobrescreve o que já está no ambiente
}

const baseUrl = (process.argv[2] ?? process.env.BFF_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const secret = process.env.CRON_SECRET

if (!secret) {
  console.error('CRON_SECRET não está definido (.env.local)')
  process.exit(1)
}

const url = `${baseUrl}/api/cron/event`
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
