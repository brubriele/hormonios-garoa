# Dúvidas da integração do front

## Onda 2: ordem da gravação da pessoa

O passo 2 do pedido diz montar a pessoa e gravar com `createOrUpdateUser`, antes das validações do
`vou`. Gravar antes faria uma reserva recusada (esgotado, fechado) deixar a pessoa criada ou com o
nome trocado. Feito: a pessoa é montada no passo 2 e gravada depois das validações, logo antes da
presença.

## Onda 2: totalVacancies na presença sem grupo

O pedido lista o `totalVacancies` junto das contas "com groupId". Confirmar presença (`vou` sem
grupo) também soma no `goingCount`. Feito: o `totalVacancies` vale para todo `vou` de quem ainda não
estava `vou` (não REJECTED), com ou sem grupo; as contas do instrumento, dos acessórios e do
`capacity` só com grupo.

## Onda 2: supportIds repetidos

Feito: os `supportIds` repetidos viram um só antes de validar e de gravar.

## Onda 2: estoque abaixo das reservas no PUT

A conta agora é a do domain (`withAttendances`), que também conta o item `INSTRUMENT` pelas pessoas
do grupo. Então baixar o `total` de um instrumento abaixo das reservas do grupo passa a dar
`StockBelowReservationsError`, o que antes só valia para os acessórios.

## Onda 3: groupId da presença sem grupo

O `Attendance.toJson()` manda `groupId: this.eventGroup?.id`, então a presença sem grupo chega sem
o campo (`undefined`), não com `null`. Feito: o front testa o `groupId` por verdade
(`x.groupId ? ... : ...`), o que cobre os dois casos.

## Onda 3: description no corpo do PUT

O `metadata.description` do evento é um objeto (`visibility`, `description`, `releaseAt`,
`membersEarlyAt`, `totalVacancies`), e o `EventBodySchema` pede o objeto inteiro. Feito: o corpo
manda o `metadata.description` como veio do `state.admin.event`. Os `groups` vão como vieram (com o
`capacity`, que o zod descarta).

## Onda 3: loadPublic no novo ensaio

Feito como no pedido: `await loadAdmin()`, depois `loadPublic()` sem `await` (ele trata os erros e
renderiza sozinho), `navigate("home")` e o toast.
