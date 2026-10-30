# Front — T8: hormonios-repo-otimization-event-read-for-event-and-users-attendance

> **Concluído em 2026-10-30.** As telas e os textos são os de hoje: só o novo muda. O detalhe para agente:
> [`spec/spec-8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md`](../../spec/spec-8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md#front--t8).

## Como Produção, quero ver o ensaio atual e o próximo

Alterado em `app.js`: o título "PRÓXIMO ENSAIO" da Produção vira **ENSAIO**, seguido das abas
**ATUAL / PRÓXIMO**. O mesmo formulário (dados, estoque, presenças) carrega um ou o outro.
Sem próximo criado, a aba PRÓXIMO mostra o formulário vazio com a data do atual + 7 dias, o
mesmo horário e o mesmo local, calculados no front.

## Como Produção, quero liberar e fechar as reservas sem mexer no ensaio

Alterado em `app.js`: o botão "Liberar/Fechar reservas" chama o endpoint novo, e não mais o
`PUT /api/admin/ensaio` com `bookingOpen`. O `POST /api/admin/ensaio` deixa de mandar `bookingOpen`.
