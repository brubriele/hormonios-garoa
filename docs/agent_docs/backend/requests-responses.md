# Requests e responses (`src/serve-utils/repos/<fonte>/{requests,responses}/`)

> Índice: [`README.md`](README.md). Quem usa: [`repos.md`](repos.md). Cria: [`models.md`](models.md).
> Erros: [`errors.md`](errors.md) (`InvalidResponseError`).

O formato cru de uma fonte (Supabase, Transicionais) não sai da pasta dela. A tradução fica em
classes por finalidade, e o repo só chama:

- **Response:** o que a fonte devolve → model. `XResponse.toDomain(raw)`.
- **Request:** model → o que a fonte recebe (corpo HTTP, parâmetros do rpc). `XRequest.fromDomain(model)`.

O domínio é o que está em `models/`. As duas fontes mapeiam para os mesmos models.

## Regras

| # | Regra |
|---|---|
| RR1 | Um arquivo por finalidade: `responses/<nome>.response.ts` e `requests/<nome>.request.ts`, com a classe `<Nome>Response` / `<Nome>Request` e métodos estáticos. |
| RR2 | **O schema zod é o formato cru.** O tipo vem de `z.infer`, no próprio arquivo. Nada de `IRaw*` em `interfaces/`. |
| RR3 | **O schema faz o trabalho de formato:** obrigatoriedade, defaults (`.default`), normalização (`.transform`), lista não vazia (`.nonempty`), conjunto fechado (`z.enum(<Enum>)`). O `toDomain` só monta o model. Um `?? []`, `?? ""` ou `if (!x) throw` no `toDomain` é sinal de que falta isso no schema. |
| RR4 | Cada campo é `.nullable()` **ou** `.optional()`, nunca os dois. Siga o contrato da fonte. Quando ele não diz, use `.nullable()` e decida o default no schema. |
| RR5 | Todo objeto aninhado é um schema **com nome** (`VacancySchema`, `ConfigDaySchema`). Nada de objeto anônimo dentro de outro. |
| RR6 | **O schema só tem os campos que o `toDomain` lê.** O que a fonte manda a mais é ignorado, e ela pode crescer sem quebrar o Hormônios. |
| RR7 | Valide sempre com `parseResponse(schema, raw, source, operation)` (`repos/parse-response.ts`). Nunca chame `safeParse` direto. Fora do formato, ele lança `InvalidResponseError` com o caminho de cada campo recusado. **Corpo que a fonte manda ao Hormônios** (webhook) valida com `parseInput(schema, raw)`, do mesmo arquivo: fora do formato é pedido inválido, `InvalidParameterError` (400) com o primeiro campo recusado, e não resposta inválida (500). |
| RR8 | Monte o model dentro de `InvalidResponseError.guard(source, operation, () => …)`. Um model que recusa o dado da fonte vira `InvalidResponseError` (500), e não `InvalidParameterError` (400 para a pessoa). |
| RR9 | Um schema usado por mais de um response é exportado de onde nasceu (`UserRowSchema`, `TransicionaisIdSchema`). Não existe pasta de validações: o zod já evita a repetição. |
| RR10 | Id do Transicionais: `repos/transicionais/transicionais-id.ts`, com as duas direções. Na volta, `TransicionaisIdSchema` (número ou texto → `string`); na ida, `numericId(value, field)` (`string` → número positivo; fora disso é bug do Hormônios, `Error`, E7). O domínio só vê `string`. Id interno que só o repo usa (ex.: `id` de manager para as escritas) pode ficar `number`, mas não sai do repo. |
| RR11 | **Tradução de conceitos** (ex.: assistência `type='instrumento'` → `Instrument`, E2.9) fica no response. **Regra de negócio** (qual encontro é o atual, o que fazer se a fonte cair) fica no usecase. Dado ignorado na tradução vai para o log com `warn` ([`lib.md`](lib.md)). |
| RR12 | O request devolve um tipo com nome (`ISaveSnapshotParams`), exportado do arquivo dele. Campo que pode faltar é `?:`, sem `| null`, a não ser que a fonte aceite `null`. |

## Exemplo: response

```ts
// src/serve-utils/repos/supabase/responses/user.response.ts
import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import type { UUID } from "../../../interfaces/uuid";
import { User } from "../../../models/user";
import { parseResponse } from "../../parse-response";

// linha de hg_users (só o que o model usa)
export const UserRowSchema = z.object({
  id: z.guid().transform((id) => id as UUID),
  email: z.string(),
  name: z.string(),
  pronoun: z.string(),
});

export type IUserRow = z.infer<typeof UserRowSchema>;

export class UserResponse {
  static toDomain(raw: unknown, operation: string): User {
    const row = parseResponse(UserRowSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () => UserResponse.fromRow(row));
  }

  // linha já validada (ex.: o hg_users embutido numa reserva)
  static fromRow(row: IUserRow): User {
    return new User(row.id, row.email, row.name, row.pronoun);
  }
}
```

Defaults e normalização no schema (RR3), e não no `toDomain`:

```ts
const ConfigDaySchema = z.object({
  id: TransicionaisIdSchema.nullable(), // null = dia ainda não salvo
  startTime: z.string().nullable().transform((time) => (time ?? "").slice(0, 5)), // null = a definir
  summary: z.object({ supports: z.array(DaySupportSchema) }).default({ supports: [] }),
});

const PublicEventSchema = z.object({
  configDays: z.array(ConfigDaySchema).nonempty(), // configDays[0] já é tipado sem undefined
  public: z.object({ answerWindow: AnswerWindowSchema.optional() }), // só encontro Público
});
```

## Exemplo: request

```ts
// src/serve-utils/repos/supabase/requests/save-snapshot.request.ts (trecho)
export interface ISaveSnapshotParams {
  p_external_id: string;
  p_version: number;
  p_vacancies_at: string;
  p_data: ISnapshotData;
}

export class SaveSnapshotRequest {
  static fromDomain(snapshot: CurrentEventSnapshot): ISaveSnapshotParams {
    return {
      p_external_id: snapshot.externalId,
      p_version: snapshot.version,
      p_vacancies_at: snapshot.vacanciesAt,
      p_data: { /* o retrato sem o whatsappUrl */ },
    };
  }
}
```

## Exemplo: corpo de webhook (`parseInput`)

```ts
// src/serve-utils/repos/transicionais/responses/webhook-envelope.response.ts (trecho)
const envelope = parseInput(WebhookEnvelopeSchema, body); // fora do formato -> InvalidParameterError (400)
```

## Uso no repo

```ts
async findCurrentEvent(): Promise<CurrentEvent | null> {
  const response = await this.supabaseClient.query<unknown>((sdk) =>
    sdk.from("hg_current_event").select("*").eq("id", CURRENT_EVENT_ID).maybeSingle(),
  );

  if (response.error) {
    throw new DatabaseError("findCurrentEvent", response.status, response.error.message);
  }

  return response.data ? CurrentEventResponse.toDomain(response.data) : null;
}
```
