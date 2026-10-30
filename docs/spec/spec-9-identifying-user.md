# spec-9 — identifying-user

> **Concluído em 2026-10-30.** Tarefa: [`plans/back/T9-identifying-user.md`](../plans/back/T9-identifying-user.md).
> Muda a spec-8 D5–D7 e E1: a pessoa era lida duas vezes na reserva.

## Desenho

```
 PRESENÇA      POST /api/membros/reservas (sem groupId; com ou sem aparelho reconhecido)
               CreatingOrUpdatingAttendanceUsecase
                 FindingInternalEventUsecase(atual)          o ensaio, todas as presenças
                 IdentifyingUserUsecase
                   FindingUserUsecase                        aparelho, e-mail ou e-mail mascarado + hash
                   CreatingOrUpdateUserUsecase               só se a pessoa é nova ou mudou
                 grava a presença ──► cookie do aparelho

 INSTRUMENTO   POST /api/membros/reservas (com groupId; aparelho reconhecido obrigatório)
               CreatingOrUpdatingAttendanceUsecase
                 FindingUserBookingUsecase                   o ensaio e a pessoa, sem comparar e-mail
                 confere vagas ──► grava a presença com o instrumento

 FRONT         instrumento direto, sem presença: presença ──► instrumento (duas chamadas)
```

## A. Identificar a pessoa

| # | Regra |
|---|---|
| A1 | `IdentifyingUserUsecase` (novo) orquestra o `FindingUserUsecase` e o `CreatingOrUpdateUserUsecase`. Entrada: um command com a pessoa (domain `User`), o id do aparelho e o `emailHash`. Devolve a pessoa certa. O `FindingUserUsecase` recebe o mesmo command. |
| A2 | A pessoa certa é: a do aparelho, se o e-mail (completo, ou mascarado com o hash) bate; senão, a do e-mail; senão, uma nova. |
| A3 | Só grava (e envia ao Transicionais) quando a pessoa é nova ou mudou. A decisão "mudou?" é do `IdentifyingUserUsecase`. "Mudou" é nome ou pronome. Pessoa pendente sem mudança não é reenviada aqui: o reenvio fica com o job. |
| A4 | O `CreatingOrUpdateUserUsecase` volta a só gravar e enviar, sem ler a pessoa (desfaz a spec-8 E1). Os webhooks gravam sempre, como antes da T8. |
| A5 | O `IdentifyingUserUsecase` é, na prática, um usecase de autenticação. Nos diagramas dos outros usecases ele aparece fechado, sem detalhe: uma seta de ida e uma de volta. O detalhe dele fica numa doc de usecase própria, em `docs/usecases/autenticacao.md`. |

## B. Reserva

| # | Regra |
|---|---|
| B1 | Presença (sem `groupId`): o `CreatingOrUpdatingAttendanceUsecase` lê o ensaio pelo `FindingInternalEventUsecase` (atual) e a pessoa pelo `IdentifyingUserUsecase`. A rota grava o cookie do aparelho. |
| B2 | Instrumento (com `groupId`): exige o aparelho reconhecido. A pessoa e o ensaio vêm do `FindingUserBookingUsecase`, sem comparar o e-mail. Sem o aparelho reconhecido, responde 404 `NOT_FOUND_ERROR` (não 401, que o front trata como sessão da Produção). Nome, pronome e e-mail da folha são ignorados: o instrumento vai para a pessoa do aparelho. |
| B3 | A pessoa é lida uma vez por chamada (resolve a spec-8 C4). |

## C. Minhas reservas

| # | Regra |
|---|---|
| C1 | O `FindingUserBookingUsecase` exige o aparelho reconhecido e devolve o domain `UserBooking` (o ensaio e a pessoa). `GET /api/membros` usa só a pessoa. A entrada continua `{ userId }`. |

## Fora do escopo

- Labels de estado (instrumento já reservado, presença confirmada): [issue #20](https://github.com/brubriele/hormonios-garoa/issues/20).

## Front — T9

Tarefa: [`plans/front/T9-identifying-user.md`](../plans/front/T9-identifying-user.md). As telas e
os textos são os de hoje.

| # | Regra |
|---|---|
| F1 | Instrumento direto, sem aparelho reconhecido: o front chama a presença e, com o cookie, o instrumento. O fluxo ideal continua presença → instrumento. |
