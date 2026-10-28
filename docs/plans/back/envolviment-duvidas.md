# Dúvidas do Envolviment

> Dúvidas não bloqueantes da onda 2 do plano do `Envolviment` (rotas pedem o usecase): o que estava
> em dúvida e o que foi feito.

## Um método privado por usecase

O `switch` do `make` ficaria longo com a montagem dentro de cada `case`. Feito: o `make` cuida do
cache e chama `build(token)`, que tem o `switch` (EV4); cada `case` devolve um método privado
(`findingPublicEventUsecase()`, `creatingOrUpdatingAttendanceUsecase()`...) que monta o usecase com
um `const` por dependência (EV6). `CreatingOrUpdateUserUsecase` e `FindingUserUsecase` são montados
no método do `CreatingOrUpdatingAttendanceUsecase`, sem token.

## Campos dos getters

Os getters estáticos (EV5) guardam a instância num campo estático opcional com `_` na frente
(`_httpClient`, `_transicionaisRepo`...), porque o getter já usa o nome sem `_`. Os getters que
dependem de outro só leem a dependência dentro do `if (!this._x)`, para não criar nada além do
necessário (EV2).

## Comentário do campo `tokens` na session

O `let tokens` tinha o comentário "memória da instância (E2.6)". No campo da classe ficou só
`// E2.6` (citar a regra). Os outros comentários do `session.ts` são legado e ficaram como estavam.

## `createdAt` no `CreatingOrUpdatingAttendanceUsecase`

O `new Date().toISOString()` do `toAttendance` (G10) virou `const now = new Date()` e
`now.toISOString()`. O `Date` é criado sempre, mesmo quando a presença já existe e o `createdAt`
vem dela; o resultado é o mesmo.
