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
