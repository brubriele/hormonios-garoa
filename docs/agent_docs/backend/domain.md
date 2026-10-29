# Domains (`src/bff/domain/`)

> Índice: [`README.md`](README.md). Quem cria domains: os responses ([`requests-responses.md`](requests-responses.md), no `toDomain`).

## Regras

| # | Regra |
|---|---|
| M1 | Um domain por arquivo, com os campos `readonly` no construtor. |
| M2 | O domain **se valida no construtor**, pelo `private validate()`. Um domain que existe é um domain válido. |
| M3 | **A validação é um schema zod** (`const <Domain>Schema = z.object({...})`, no arquivo do domain, logo acima da classe), e o `validate()` só chama `validateSchema(<Domain>Schema, this, "<prefixo>")` (`lib/schema.ts`). Fora do formato, ele lança `InvalidParameterError` com o primeiro campo recusado (`Field group.id is invalid`). Nada de `if (typeof …) throw` no domain; o `check.cjs` acusa (`domain-manual-validate`). |
| M4 | String obrigatória não aceita vazia: `NonBlankSchema`. Os schemas comuns ficam em `lib/schema.ts` (`NonBlankSchema`, `CountSchema` para estoque, vagas e contagens, `DateOnlySchema` YYYY-MM-DD, `DateTimeSchema` ISO); procure ali antes de escrever outro. Campo opcional do domain é `.nullable()`; outro domain é `z.instanceof(<Domain>)`. |
| M5 | O domain não conhece API, Supabase nem HTTP. |
| M6 | **Conjunto fechado de valores é `enum` de string** (`enum BookingSync { Pending = "PENDING", … }`), declarado no arquivo do domain que o usa. Nada de união de strings nem de texto solto na comparação (`attendance.sync === BookingSync.Rejected`, e não `=== "REJECTED"`). Sem `const enum` (o esbuild do Vite e da Vercel não o compila entre arquivos). |
| M7 | **Um enum por conceito.** Se o conceito existe no domínio, o enum é o do domain, e o response da fonte usa ele (`z.enum(LoanCatalogKind)`), sem um enum com os mesmos valores na pasta da fonte. Só o valor que **não** existe no domínio (ex.: `ValidationAnswer.Tentative` do Transicionais) fica num enum do response/request. A saída de uma rota também usa o enum do domain (o `type` do estoque é `LoanCatalogKind`). |
| M9 | **Regra de um domínio é método do domain**, mesmo quando ela precisa de outro domain como entrada: a conta das vagas é `group.countTaken(attendances)`, `available(attendances)`, `soldOut(attendances)` e `isBelowBookings(capacity, attendances)`. A saída que junta os dois é do mapper ([`usecases.md`](usecases.md), U9). |
| M10 | **A saída de uma rota também é domain** (`PublicEvent`, `CurrentEventSummary`, `SummaryStockItem`, `UserBooking`), com as regras M1–M8. O JSON da resposta são os campos `readonly` do construtor: nada de getter ou campo a mais que mude o que sai. |
| M8 | Enum no schema: `z.enum(<Enum>)`. Regra entre campos: `.refine(fn, { path: ["campo"], message: "must be empty without groupId" })`, e a mensagem sai como `Field supportIds must be empty without groupId`. |
| M11 | **Montar o domain a partir do dado é um mapper em `domain/mappers/<Nome>Mapper.ts`** (`AttendanceMapper`, `EventMapper`, `UserMapper`), um por domain: `static fromData(data, ...)`, com a entrada `I<Nome>Data` declarada no próprio arquivo (o formato já validado, sem zod). Quem chama: os `responses/` dos repos, os `_requests/` das rotas e os usecases que reconstroem um domain. Os outros domains que ele precisa entram como parâmetro (`fromData(data, event)`). Id que não está no domain recebido é `InvalidCacheStateError` ([`errors.md`](errors.md), E9), não `InvalidParameterError`. Não é o mapper de saída ([`usecases.md`](usecases.md), U9). O `check.cjs` acusa arquivo fora do nome (`mapper-location`). |

## Exemplo

```ts
// src/bff/domain/basic-event.ts
import { z } from "zod";
import type { UUID } from "../interfaces/uuid";
import { NonBlankSchema, validateSchema } from "./domain-schema";

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
