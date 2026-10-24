# Models (`src/serve-utils/models/`)

> Índice: [`README.md`](README.md). Quem cria models: [`repos.md`](repos.md) (no `mapper*`).

## Regras

| # | Regra |
|---|---|
| M1 | Um model por arquivo, com os campos `readonly` no construtor. |
| M2 | O model **se valida no construtor**. Um model que existe é um model válido. |
| M3 | Validação inválida lança `InvalidParameterError` com o nome do campo na mensagem. |
| M4 | String obrigatória não aceita vazia (`trim() === ""`). `typeof` já cobre `null`. |
| M5 | O model não conhece API, Supabase nem HTTP. |

## Exemplo

```ts
// src/serve-utils/models/basic-event.ts
import { InvalidParameterError } from "../errors/app-error";
import type { UUID } from "../interfaces/uuid";

export class BasicEvent {
  constructor(
    readonly id: UUID,
    readonly name: string,
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.name !== "string" || this.name.trim() === "") {
      throw new InvalidParameterError("Field name is invalid");
    }
  }
}
```
