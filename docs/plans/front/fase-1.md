# Front — Fase 1: as telas usam o BFF

> Cada história diz o que foi preciso criar em cada camada. O que outra história já criou só é
> citado. O detalhe para agente (ação → rota, mensagens por `key`, regras numeradas):
> [`spec/fase-1.md`](../../spec/fase-1.md#front--fase-1). Rotas: [`../back/fase-1.md`](../back/fase-1.md).

**Camadas:** a tela (`index.html`) → a lógica e o estado (`app.js`) → a rota do BFF. A experiência
é a do protótipo: só muda o que é novo.

## Base: falar com o BFF

Criados em `app.js`: a função `api()` (o `fetch` com JSON e o erro pela `key`), o `state` em
memória, o `run()` (botão ocupado e toast de erro) e o `loadPublic()`, que busca o ensaio e as
minhas reservas juntos. Os estados de carregando e de erro com "Tentar de novo".

## Como pessoa, quero ver o ensaio atual

Criado em `app.js`: o `renderAll()` e a home com reservas abertas ou fechadas
(`updatePublicMode()`), a partir de `GET /api/ensaio`.

Já existia: a home no `index.html`.

## Como pessoa, quero confirmar presença

Criados: o campo e-mail e o `emailHash` escondido no `#presence-form` (`index.html`), e o
`confirmPresence()` (`app.js`), que chama `POST /api/reserva`.

Já existiam: a base e a tela de presença.

## Como pessoa, quero reservar um instrumento

Criados: a lista de instrumentos pelo catálogo (`renderInstruments()`) e a folha com os acessórios
do grupo (`openReserve()` e `reserveInstrument()`), em `app.js`; o `#reserve-accessories` no
`index.html`.

Já existiam: a base e a rota da reserva.

## Como pessoa, quero ver e desfazer as minhas reservas

Criados em `app.js`: o `renderMyReservations()`, a partir de `GET /api/minhas-reservas`, e o
`cancelReservation()`, que chama `POST /api/reserva/desfazer`.

Já existia: a tela "Minhas reservas".

## Como Produção, quero entrar e ver o ensaio

Criados em `app.js`: o login (`adminLogin()`, `POST /api/admin/entrar`) e a Produção
(`loadAdmin()` e `renderAdmin()`, `GET /api/admin/ensaio`), com contadores, estoque e presenças.

Já existia: a tela `#admin`.

## Como Produção, quero editar o ensaio, o estoque e as reservas

Criados em `app.js`: o `updateEvent()`, que manda o ensaio inteiro em `PUT /api/admin/ensaio`, e
as ações que o usam: salvar ensaio, salvar link, abrir e fechar reservas e o estoque −/+.

## Como Produção, quero encerrar o ensaio e criar o próximo

Criado em `app.js`: o `resetRehearsal()`, que chama `POST /api/admin/novo-ensaio` com o ensaio
atual, a data daqui a 7 dias e as reservas fechadas.

Já existiam: o botão "Encerrar ensaio e criar próximo" e a Produção.
