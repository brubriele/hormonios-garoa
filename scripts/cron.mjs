// Chama uma rota /api/cron/* como o Worker faz (Authorization: Bearer <CRON_SECRET>).
// Uso: node scripts/cron.mjs <event|sync> [--type=<tipo>] [BFF_URL]
//      node scripts/cron.mjs --type=webhook --entity=<event|user|validation> --id=<1|uuid> [BFF_URL]
//      yarn cron:webhook --entity=event --id=1 [BFF_URL] → POST /api/webhooks/transicionais (atualiza a base interna)
//      ids: event = id do encontro ou uuid do link público; user = userId da conta; validation = validationId
//      yarn cron:event [BFF_URL]                → GET /api/cron/event
//      yarn cron:sync --type=event [BFF_URL] → GET /api/cron/sync?type=event (reenvia a fila integration_status)
//      tipos do sync: event, user, attendance
// BFF_URL padrão: BFF_URL do .env.local ou http://localhost:5173
import { existsSync } from 'node:fs'

const ROUTES = ['event', 'sync']
const SYNC_TYPES = ['event', 'user', 'attendance']
const WEBHOOK_ENTITIES = ['event', 'user', 'validation']
const WEBHOOK_BODY_KEYS = { event: 'eventId', user: 'userId', validation: 'validationId' }

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file) // não sobrescreve o que já está no ambiente
}

const readArg = (args, name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length)

if (readArg(process.argv.slice(2), 'type') === 'webhook') {
  await callWebhook(process.argv.slice(2))
  process.exit(0)
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

async function callWebhook(args) {
  const entity = readArg(args, 'entity')
  const rawId = readArg(args, 'id')
  const baseUrl = (args.find((arg) => !arg.startsWith('--')) ?? process.env.BFF_URL ?? 'http://localhost:5173').replace(/\/$/, '')

  if (!WEBHOOK_ENTITIES.includes(entity)) {
    console.error(`--entity inválido: ${entity ?? '(vazio)'}. Use um de: ${WEBHOOK_ENTITIES.join(', ')}`)
    process.exit(1)
  }

  if (!rawId) {
    console.error('--id é obrigatório (número do Transicionais ou uuid do link público)')
    process.exit(1)
  }

  const apiKey = process.env.WEBHOOK_API_KEY

  if (!apiKey) {
    console.error('WEBHOOK_API_KEY não está definido (.env.local)')
    process.exit(1)
  }

  const id = /^\d+$/.test(rawId) ? Number(rawId) : rawId
  const url = `${baseUrl}/api/webhooks/transicionais`
  const body = { entity, sendAt: new Date().toISOString(), body: { [WEBHOOK_BODY_KEYS[entity]]: id } }
  const startedAt = Date.now()
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'user-agent': 'cron.mjs', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()

  console.log(`POST ${url} → ${response.status} (${Date.now() - startedAt} ms)`)
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2))
  } catch {
    console.log(text)
  }

  if (!response.ok) process.exit(1)
}
