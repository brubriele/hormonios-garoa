# Ensaio

> Atualizado em 2026-10-28.

## Ver o ensaio atual (FindingPublicEventUsecase) — `GET /api/ensaio`

**Telas.** Home (reservas abertas e fechadas), Instrumentos, Minhas reservas e a folha de reserva.

**Contexto.** Qualquer pessoa, sem se identificar, vê o próximo ensaio e o que ainda dá para
reservar.

**Decisão.**
- O ensaio atual é o último criado.
- Sem ensaio aqui, traz o último ensaio aberto ao público no Transicionais, com as reservas
  fechadas e sem o link do grupo. Sem ensaio lá também, ou com o Transicionais fora do ar, avisa
  que não encontrou.
- Mostra local, data, horário, se as reservas estão abertas e o link do grupo.
- Mostra quantas pessoas vão, com e sem instrumento. Presença recusada não conta.
- Mostra quanto de cada instrumento e acessório ainda está livre. Item sem limite ou rotativo não
  mostra número.
- Não mostra quantas vagas sobram em cada grupo.

**Consequências.**
- A conta das vagas é a mesma da Produção e da reserva, então as telas sempre batem.
- Com o banco vazio, o ensaio que está no Transicionais já aparece.
