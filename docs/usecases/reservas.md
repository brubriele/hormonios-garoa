# Reservas

> Atualizado em 2026-10-27. A reserva é a presença da pessoa no ensaio atual, com ou sem
> instrumento.

## Confirmar presença, reservar ou desfazer (CreatingOrUpdatingAttendanceUsecase) — `POST /api/reserva` e `POST /api/reserva/desfazer`

**Telas.** Presença ("Confirmar presença"), a folha de reserva ("Reservar instrumento") e Minhas
reservas ("Desfazer").

**Contexto.** A pessoa diz que vai ao ensaio (só presença, ou com instrumento e acessórios) ou que
não vai.

**Decisão.**
- A pessoa informa e-mail, nome, pronome e se vai. Se vai, pode escolher um instrumento e os
  acessórios dele.
- Cada pessoa tem uma presença por ensaio. Uma nova resposta substitui a anterior.
- Para ir, as reservas precisam estar abertas e precisa haver vaga no ensaio.
- Para reservar instrumento: o grupo precisa estar ativo, os acessórios precisam valer para o
  grupo, a pessoa não pode ter outro instrumento no ensaio, e precisa haver vaga no instrumento,
  nos acessórios e no grupo.
- As vagas são contadas sem a própria pessoa, então ela pode trocar os acessórios.
- Desfazer o instrumento mantém a presença. Desfazer a presença vira "não vou".
- "Não vou" vale mesmo com as reservas fechadas.
- Nome e pronome novos substituem os antigos.
- A reserva é enviada ao Transicionais.

**Consequências.**
- "Não vou" é uma resposta; "nem vi" é não ter resposta.
- Uma reserva recusada não cria a pessoa nem troca o nome dela.
- Quem usa o e-mail de outra pessoa passa a ver e desfazer a reserva dela, até existir login por
  e-mail.

## Ver as minhas reservas (FindingUserBookingUsecase) — `GET /api/minhas-reservas`

**Telas.** Minhas reservas; a Presença e a folha de reserva, que já vêm preenchidas com o e-mail
mascarado, o nome e o pronome.

**Contexto.** A pessoa vê a própria reserva do ensaio atual.

**Decisão.**
- A pessoa é reconhecida pelo aparelho onde reservou.
- Mostra o nome, o pronome, o e-mail mascarado e a reserva dela no ensaio atual.
- Sem reserva feita neste aparelho, avisa que não encontrou.

**Consequências.**
- O e-mail inteiro nunca aparece na tela.

## Descobrir quem está reservando (FindingUserUsecase) — sem rota

**Telas.** Nenhuma diretamente: roda dentro da reserva (Presença, folha de reserva e "Desfazer").

**Contexto.** Antes de reservar, o sistema precisa saber se a pessoa já existe.

**Decisão.**
- Se o aparelho já reservou e o e-mail é o da pessoa (o completo, ou o mascarado que a tela
  mostrou), é ela.
- Senão, procura pelo e-mail, que precisa ser válido. E-mail que ninguém usou é uma pessoa nova.

**Consequências.**
- A pessoa reserva de novo sem redigitar o e-mail inteiro.

## Gravar a pessoa (CreatingOrUpdateUserUsecase) — sem rota

**Telas.** Nenhuma diretamente: roda dentro da reserva e quando uma pessoa chega do Transicionais.

**Contexto.** A pessoa que reserva precisa estar cadastrada aqui e no Transicionais.

**Decisão.**
- Grava a pessoa, nova ou atualizada.
- Cadastra a pessoa no Transicionais e guarda a conta dela lá, que a reserva usa para ser enviada.

**Consequências.**
- O Transicionais reconhece a pessoa pelo e-mail, então cadastrar de novo a cada reserva não cria
  outra pessoa lá.
