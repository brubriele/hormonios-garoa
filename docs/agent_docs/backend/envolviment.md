# Envolviment (`src/serve-utils/envolviment/`)

> Índice: [`README.md`](README.md). Quem usa: [`api.md`](api.md) (A2). Usecases: [`usecases.md`](usecases.md) (U12).

## Regras

| # | Regra |
|---|---|
| EV1 | A rota pede o usecase por `Envolviment.make<T>(<Usecase>.token)`. `make` é **estático**: sem `.get()` e sem instância de `Envolviment`. |
| EV2 | **Lazy:** carregar o módulo não cria nada. O 1º `make` de um token monta o usecase e as dependências que ainda não existem; os seguintes devolvem a instância guardada. O SDK do Supabase continua nascendo na 1ª consulta, dentro do `SupabaseClient`. |
| EV3 | **Singleton por instância** (função da Vercel, isolate da Cloudflare). Só entra no `Envolviment` o que não guarda estado de request: client, session, repo e usecase com dependências `private readonly` (G2). |
| EV4 | `make` tem **um `switch (token)`**, um `case <Usecase>.token` por usecase pedido em rota, e o `default` lança `Error` de configuração (E7) com o token. |
| EV5 | Clients, session e repos são **getters estáticos privados**, criados no 1º acesso. Os repos saem tipados pela interface (`IHormoniosRepository`, `ITransicionaisRepo`). |
| EV6 | Cada `case` monta o usecase com um `const` por dependência (G10). O usecase usado só dentro de outro é montado no `case` de quem o usa, sem token. |
| EV7 | Teste com fake não usa o `Envolviment`: monta o usecase pelo construtor ([`usecases.md`](usecases.md), "Teste com fake"). |

## Fluxo

```
api/*.ts
  │  Envolviment.make<FindingPublicEventUsecase>(FindingPublicEventUsecase.token)
  ▼
Envolviment.make(token)
  ├── está no cache?          → devolve
  ├── switch (token)
  │     case <Usecase>.token  → const deps (getters lazy) → new <Usecase>(...)
  │     default               → Error de configuração
  └── guarda no cache e devolve
```

| Momento | O que é criado |
|---|---|
| Carregar o módulo | nada |
| 1º `make` de um usecase | o usecase e as dependências que ainda não existem |
| 1ª consulta ao Supabase | o SDK (`createClient`), dentro do `SupabaseClient` |
| `make` seguintes | nada |

## Uso na rota

```ts
const creatingInternalEventUsecase = Envolviment.make<CreatingInternalEventUsecase>(CreatingInternalEventUsecase.token);
const created = await creatingInternalEventUsecase.execute(event);
```

## Usecase novo pedido por rota

1. `static readonly token = "<NomeDaClasse>"` na classe (U12).
2. Um `case <Usecase>.token` no `make`.
3. Na rota, `Envolviment.make<<Usecase>>(<Usecase>.token)`.
