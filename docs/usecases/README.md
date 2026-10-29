# Usecases

> O que o sistema faz, um usecase por seção, agrupados por domínio. É uma doc para pessoas: sem
> termo técnico. As histórias de cada fase estão em [`plans/back/`](../plans/back/README.md) e
> [`plans/front/`](../plans/front/README.md); o detalhe técnico, em
> [`spec/fase-1.md`](../spec/fase-1.md#como-ficou-2026-10-27) e
> [`spec/fase-2.md`](../spec/fase-2.md#como-ficou-2026-10-27).

## Modelo

```markdown
# <Domínio>

> Atualizado em <AAAA-MM-DD>.

## <O que ele faz, em português> (<NomeDaClasse>) — `<rota>`

**Telas.** As telas que usam o usecase, ou "Nenhuma" e quem chama.

**Contexto.** Uma a três linhas: o problema que ele resolve e quem usa.

**Desenho.** O caminho em ASCII, no formato do desenho da spec: a rota, o usecase, o que ele
confere e as chamadas de repo (`hormoniosRepository`, `transicionaisRepo`), em alto nível, sem descer
ao que o repo faz por dentro.

**Decisão.**
- As regras que o sistema segue.

**Consequências.**
- O que fica mais fácil ou mais difícil, os limites conhecidos e as dúvidas abertas.
```

## Domínios

| Doc | O que cobre |
|---|---|
| [`ensaio.md`](ensaio.md) | Ver o ensaio atual |
| [`producao.md`](producao.md) | Ver, criar e editar o ensaio na Produção |
| [`reservas.md`](reservas.md) | Confirmar presença, reservar, desfazer e ver as minhas reservas |
| [`sincronizacao.md`](sincronizacao.md) | Manter o ensaio, as pessoas e as presenças iguais no Transicionais |

## Retrato dos endpoints

> Atualizado em 2026-10-28. Quem chama cada rota, o que ela faz e para onde vai. Hormônios = a base
> do Hormônios; Transicionais = o sistema da organização, onde estão os grupos, os instrumentos e
> os acessórios.

```
QUEM CHAMA          ROTA                                O QUE FAZ                          VAI PARA
──────────          ────                                ─────────                          ────────
Pessoa ──────────►  GET  /api/ensaio ─────────────────► vê o ensaio atual ───────────────► Hormônios
(sem se                                                  base vazia: traz o último ──────► Transicionais
 identificar)                                            ensaio aberto ao público
                    POST /api/reserva ────────────────► confirma presença e reserva ────► Hormônios
                    POST /api/reserva/desfazer ───────► desfaz (vira "não vou")            └─► envia ► Transicionais
                    GET  /api/minhas-reservas ────────► vê as próprias reservas ────────► Hormônios

Produção ────────►  POST /api/admin/entrar ───────────► entra com a chave da Produção
(com a chave)       GET  /api/admin/ensaio ───────────► vê o ensaio, quem vai e o estoque ► Hormônios
                    PUT  /api/admin/ensaio ───────────► edita o ensaio e o estoque ─────► Hormônios
                                                                                           └─► envia o estoque ► Transicionais
                    POST /api/admin/novo-ensaio ──────► encerra e cria o próximo ───────► Hormônios
                                                                                           └─► cria o encontro ► Transicionais

Transicionais ───►  POST /api/webhooks/transicionais ─► avisa que um encontro, uma ─────► Hormônios
(com a chave                                             pessoa ou uma presença mudou
 do aviso)                                               lá; traz o que mudou ◄────────── Transicionais

Agendador ───────►  GET  /api/cron/sync ──────────────► reenvia o que ficou pendente ───► Transicionais
(com a chave         ?type=event|user|attendance         (ensaios, pessoas ou presenças)
 do cron)
```

- O envio ao Transicionais nunca faz a tela esperar nem falhar: se ele estiver fora do ar, fica
  pendente e o agendador reenvia ([`sincronizacao.md`](sincronizacao.md)).
- Grupos, instrumentos e acessórios são cadastrados no Transicionais. O Hormônios só lê e ajusta o
  estoque.
