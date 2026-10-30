# Back — T9: identifying-user

> **Concluído em 2026-10-30.** O detalhe para agente: [`spec/spec-9-identifying-user.md`](../../spec/spec-9-identifying-user.md).
> Vem da T8: a pessoa era lida duas vezes na reserva.

## Como pessoa, quero confirmar presença e reservar instrumento sem repetir quem eu sou

Criado: o **usecase** `IdentifyingUserUsecase`, que acha a pessoa (aparelho, e-mail ou e-mail
mascarado) pelo `FindingUserUsecase` e só grava pelo `CreatingOrUpdateUserUsecase` quando ela é nova
ou mudou. O **domain** `UserBooking` (o ensaio e a pessoa).

Alterados:
- **usecase** `FindingUserBookingUsecase`: exige o aparelho reconhecido, não compara o e-mail e
  devolve o ensaio e a pessoa;
- **usecase** `CreatingOrUpdatingAttendanceUsecase`: na presença, identifica a pessoa pelo
  `IdentifyingUserUsecase`; no instrumento, usa o `FindingUserBookingUsecase` e exige o aparelho
  reconhecido;
- **usecase** `CreatingOrUpdateUserUsecase`: volta a só gravar e enviar; não lê mais a pessoa.

A pessoa é lida uma vez por chamada. Reservar o instrumento sem ter confirmado presença vira duas
chamadas no front.

## Roadmap

| Seção do README | Item | T9 |
|---|---|---|
| 7. Autenticação | Avaliar autenticação de participantes em uma segunda fase | em parte: a pessoa é identificada pelo aparelho e pelo e-mail num usecase próprio, sem login |
| 3. Presença | Validar comportamento entre dispositivos | mantém: em aparelho novo, a presença acha a pessoa pelo e-mail |

Issues: [#20 Labels de estado e carregamento](https://github.com/brubriele/hormonios-garoa/issues/20)
(não atende, aberta nesta tarefa).
