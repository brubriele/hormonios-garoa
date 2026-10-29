# Produção

> Atualizado em 2026-10-28. Só quem entrou com a chave da Produção usa estes usecases.

## Ver o ensaio com quem vai (FindingInternalEventUsecase) — `GET /api/admin/ensaio`

**Telas.** Produção, ao abrir e depois de entrar com a chave.

**Contexto.** A Produção acompanha o ensaio atual: quem vai, quem reservou o quê e o estoque.

**Desenho.**

```
GET /api/admin/ensaio (chave da Produção) ── FindingInternalEventUsecase
  ▼
hormoniosRepository.findCurrentEvent()
  │ não tem (primeira vez)
  ├─► CreatingInternalEventUsecase                 grupos e catálogo padrão
  ▼
hormoniosRepository.findEventAttendance(event) + findEventUsers(event)
  ▼
conta vagas por grupo e estoque ──► resposta
```

**Decisão.**
- Mostra o ensaio atual com as pessoas e o que cada uma reservou.
- Mostra quantas vagas sobram em cada grupo, além do estoque de cada item.
- Instrumento zerado aparece com 0. O grupo sem instrumento cadastrado no Transicionais não mostra
  instrumento, e o grupo que não está na publicação do encontro lá não aparece.
- Com `?debug=1`, mostra os ids do ensaio no Transicionais e no Hormônios.
- Na primeira vez, sem nenhum ensaio, cria um com os grupos e o catálogo padrão do Bloquinho. Se
  não conseguir, avisa que não encontrou.

**Consequências.**
- O projeto novo já abre com um ensaio pronto para a Produção ajustar.

## Criar o próximo ensaio (CreatingInternalEventUsecase) — `POST /api/admin/novo-ensaio`

**Telas.** Produção, no botão "Encerrar ensaio e criar próximo". Também roda sem tela: na primeira
vez que a Produção abre e quando um encontro novo chega do Transicionais.

**Contexto.** Ao fim de um ensaio, a Produção abre o próximo.

**Desenho.**

```
POST /api/admin/novo-ensaio (chave da Produção) ── CreatingInternalEventUsecase
  ▼
confere local, data, horários, acessórios e instrumentos
  ▼
hormoniosRepository.createEvent(event)            passa a ser o atual
  ▼ sem data → fila pendente
transicionaisRepo.createEvent(event)              nome <nome>#<id>, todos os grupos (spec-4 B9, F1)
  ├─ ok → hormoniosRepository.updateEvent(ids de lá) + fila enviada
  └─ falha → fila pendente (fora do ar) ou parada (recusa)  (fase-2 E1–E5)
```

**Decisão.**
- O ensaio precisa ter local, data e horários válidos, acessórios só de grupos do ensaio e no
  máximo um instrumento por grupo.
- O ensaio criado passa a ser o atual. O anterior e as presenças dele ficam guardados.
- O ensaio novo começa sem nenhuma presença.
- O ensaio é enviado ao Transicionais com todos os grupos abertos para reserva. Sem data, o envio
  espera até ter.
- Lá, o nome do encontro leva o código do ensaio do Hormônios, para achar um no outro.

**Consequências.**
- Encerrar não apaga nada: o histórico dos ensaios fica.

## Editar o ensaio (UpdatingInternalEventUsecase) — `PUT /api/admin/ensaio`

**Telas.** Produção: "Salvar ensaio", "Salvar link", "Liberar reservas" / "Fechar reservas" e o
estoque −/+. Também roda sem tela, quando o encontro muda no Transicionais.

**Contexto.** A Produção ajusta o ensaio: data, horário, local, link do grupo, abertura das
reservas, grupos e estoque.

**Desenho.**

```
PUT /api/admin/ensaio (chave da Produção) ── UpdatingInternalEventUsecase
  ▼
hormoniosRepository.findEvent(id) + findEventAttendance(event)
  ▼
junta com o gravado · confere grupos/itens reservados e estoque
  ▼
hormoniosRepository.updateEvent(event)
  ▼ já está no Transicionais e veio do admin?
transicionaisRepo.updateEvent(event)              o estoque de cada item (spec-4 C1–C3)
  ├─ ok → fila enviada
  └─ falha → fila pendente ou parada, a tela não falha
```

**Decisão.**
- As mesmas regras da criação valem na edição.
- O que não foi informado fica como estava; o que veio em branco é apagado.
- Não dá para tirar um grupo ou item que alguém reservou.
- Não dá para baixar o estoque abaixo das reservas, a não ser num item rotativo.
- Mudanças vindas do Transicionais não mexem no link do grupo nem na abertura das reservas.
- O estoque editado aqui é enviado ao Transicionais. Se ele estiver fora do ar, tenta de novo
  depois.
- Quais grupos o ensaio tem e o cadastro dos instrumentos e acessórios são feitos no Transicionais
  e chegam aqui pela sincronização.

**Consequências.**
- Um ensaio que chega do Transicionais fica com as reservas fechadas até a Produção abrir.
- Uma mudança do Transicionais que quebra essas regras é recusada.
