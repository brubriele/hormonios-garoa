# Models (`src/serve-utils/models/`)

> Índice: [`README.md`](README.md). Quem cria models: os responses ([`requests-responses.md`](requests-responses.md), no `toDomain`).

## Regras

| # | Regra |
|---|---|
| M1 | Um model por arquivo, com os campos `readonly` no construtor. |
| M2 | O model **se valida no construtor**, pelo `private validate()`. Um model que existe é um model válido. |
| M3 | **A validação é um schema zod** (`const <Model>Schema = z.object({...})`, no arquivo do model, logo acima da classe), e o `validate()` só chama `validateSchema(<Model>Schema, this, "<prefixo>")` (`models/model-schema.ts`). Fora do formato, ele lança `InvalidParameterError` com o primeiro campo recusado (`Field group.id is invalid`). Nada de `if (typeof …) throw` no model; o `check.cjs` acusa (`model-manual-validate`). |
| M4 | String obrigatória não aceita vazia: `NonBlankSchema`. Os schemas comuns ficam em `models/model-schema.ts` (`NonBlankSchema`, `CountSchema` para estoque, vagas e contagens, `DateOnlySchema` YYYY-MM-DD, `DateTimeSchema` ISO); procure ali antes de escrever outro. Campo opcional do model é `.nullable()`; outro model é `z.instanceof(<Model>)`. |
| M5 | O model não conhece API, Supabase nem HTTP. |
| M6 | **Conjunto fechado de valores é `enum` de string** (`enum BookingSync { Pending = "PENDING", … }`), declarado no arquivo do model que o usa. Nada de união de strings nem de texto solto na comparação (`attendance.sync === BookingSync.Rejected`, e não `=== "REJECTED"`). Sem `const enum` (o esbuild do Vite e da Vercel não o compila entre arquivos). |
| M7 | **Um enum por conceito.** Se o conceito existe no domínio, o enum é o do model, e o response da fonte usa ele (`z.enum(LoanCatalogKind)`), sem um enum com os mesmos valores na pasta da fonte. Só o valor que **não** existe no domínio (ex.: `ValidationAnswer.Tentative` do Transicionais) fica num enum do response/request. A saída de uma rota também usa o enum do model (o `type` do estoque é `LoanCatalogKind`). |
| M9 | **Regra de um domínio é método do model**, mesmo quando ela precisa de outro model como entrada: a conta das vagas é `group.countTaken(attendances)`, `available(attendances)`, `soldOut(attendances)` e `isBelowBookings(capacity, attendances)`. A saída que junta os dois é do mapper ([`usecases.md`](usecases.md), U9). |
| M10 | **A saída de uma rota também é model** (`PublicEvent`, `CurrentEventSummary`, `SummaryStockItem`, `UserBooking`), com as regras M1–M8. O JSON da resposta são os campos `readonly` do construtor: nada de getter ou campo a mais que mude o que sai. |
| M8 | Enum no schema: `z.enum(<Enum>)`. Regra entre campos: `.refine(fn, { path: ["campo"], message: "must be empty without groupId" })`, e a mensagem sai como `Field supportIds must be empty without groupId`. |

## Exemplo

```ts
// src/serve-utils/models/basic-event.ts
import { z } from "zod";
import type { UUID } from "../interfaces/uuid";
import { NonBlankSchema, validateSchema } from "./model-schema";

const BasicEventSchema = z.object({
  name: NonBlankSchema,
});

export class BasicEvent {
  constructor(
    readonly id: UUID,
    readonly name: string,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(BasicEventSchema, this, "basicEvent");
  }
}
```
