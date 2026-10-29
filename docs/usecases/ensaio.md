# Ensaio

> Atualizado em 2026-10-28.

## Ver o ensaio atual (FindingPublicEventUsecase) — `GET /api/ensaio`

**Telas.** Home (reservas abertas e fechadas), Instrumentos, Minhas reservas e a folha de reserva.

**Contexto.** Qualquer pessoa, sem se identificar, vê o próximo ensaio e o que ainda dá para
reservar.

**Desenho.**

```
GET /api/ensaio ── FindingPublicEventUsecase
  ▼
hormoniosRepository.findCurrentEvent()            o último criado (fase-1 D2)
  │ não tem
  ├─► transicionaisRepo.findLastPublicEvent()      o último Público de lá (spec-4 A2)
  │     └─ fora do ar ou sem encontro → "não encontrado" (404)
  │   hormoniosRepository.createEvent(…)           reservas fechadas, sem link (spec-4 A3)
  ▼
hormoniosRepository.findEventAttendance(event)
  ▼
conta quem vai e o que está livre ──► resposta
```

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
