# Front — Fase 2: o Transicionais por trás do BFF

> O Transicionais é transparente para o front: as telas e as rotas são as da fase 1. O detalhe
> para agente: [`spec/fase-2.md`](../../spec/fase-2.md#front--fase-2).

## Como pessoa, quero reservar de novo se o Transicionais recusou a minha reserva

Alterado em `app.js`: o `goingAttendance()` ignora a presença recusada. Minhas reservas, a folha e
a Produção passam a não contar com ela.

## Como time, quero saber se o ensaio já está no Transicionais

Criado em `app.js`: o código do ensaio em modo debug (`?debug=1`), `E-<id>-<id no Transicionais>`
ou `NÃO_INTEGRADO`. No `index.html`, o lugar dele na home (`data-dev-event-code`).
