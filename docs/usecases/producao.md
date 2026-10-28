# Produção

> Atualizado em 2026-10-27. Só quem entrou com a chave da Produção usa estes usecases.

## Ver o ensaio com quem vai (FindingInternalEventUsecase) — `GET /api/admin/ensaio`

**Telas.** Produção, ao abrir e depois de entrar com a chave.

**Contexto.** A Produção acompanha o ensaio atual: quem vai, quem reservou o quê e o estoque.

**Decisão.**
- Mostra o ensaio atual com as pessoas e o que cada uma reservou.
- Mostra quantas vagas sobram em cada grupo, além do estoque de cada item.
- Na primeira vez, sem nenhum ensaio, cria um com os grupos e o catálogo padrão do Bloquinho. Se
  não conseguir, avisa que não encontrou.

**Consequências.**
- O projeto novo já abre com um ensaio pronto para a Produção ajustar.

## Criar o próximo ensaio (CreatingInternalEventUsecase) — `POST /api/admin/novo-ensaio`

**Telas.** Produção, no botão "Encerrar ensaio e criar próximo". Também roda sem tela: na primeira
vez que a Produção abre e quando um encontro novo chega do Transicionais.

**Contexto.** Ao fim de um ensaio, a Produção abre o próximo.

**Decisão.**
- O ensaio precisa ter local, data e horários válidos, acessórios só de grupos do ensaio e no
  máximo um instrumento por grupo.
- O ensaio criado passa a ser o atual. O anterior e as presenças dele ficam guardados.
- O ensaio novo começa sem nenhuma presença.
- O ensaio é enviado ao Transicionais. Sem data, o envio espera até ter.

**Consequências.**
- Encerrar não apaga nada: o histórico dos ensaios fica.

## Editar o ensaio (UpdatingInternalEventUsecase) — `PUT /api/admin/ensaio`

**Telas.** Produção: "Salvar ensaio", "Salvar link", "Liberar reservas" / "Fechar reservas" e o
estoque −/+. Também roda sem tela, quando o encontro muda no Transicionais.

**Contexto.** A Produção ajusta o ensaio: data, horário, local, link do grupo, abertura das
reservas, grupos e estoque.

**Decisão.**
- As mesmas regras da criação valem na edição.
- O que não foi informado fica como estava; o que veio em branco é apagado.
- Não dá para tirar um grupo ou item que alguém reservou.
- Não dá para baixar o estoque abaixo das reservas, a não ser num item rotativo.
- Mudanças vindas do Transicionais não mexem no link do grupo nem na abertura das reservas.

**Consequências.**
- Um ensaio que chega do Transicionais fica com as reservas fechadas até a Produção abrir.
- Uma mudança do Transicionais que quebra essas regras é recusada.
