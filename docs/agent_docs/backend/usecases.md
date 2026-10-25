# Usecases (`src/serve-utils/usecases/`)

> Índice: [`README.md`](README.md). Usa: [`interfaces.md`](interfaces.md), [`errors.md`](errors.md). Quem chama: [`api.md`](api.md).

## Regras

| # | Regra |
|---|---|
| U1 | **Um usecase por rota** de `/api`, num arquivo `kebab-case` (`find-event.ts` → `FindEventUsecase`). |
| U2 | Recebe os repos **pela interface**, no construtor (`private readonly`). |
| U3 | `execute(input)` só tem o `try/catch`. A lógica fica em `private _execute(input)`, com a mesma assinatura. |
| U4 | `return await this._execute(...)`. **Sem o `await`, o `catch` não pega a rejeição.** |
| U5 | No `catch`: `AppError` é relançado (a rota converte). Outro erro vai para o log (`logger.error({ err: error }, "unexpected error")`, [`lib.md`](lib.md)) e sai como erro genérico. |
| U8 | **A regra de negócio é do usecase**, não do repo: escolher entre itens, decidir pelo estado, orquestrar chamadas e o plano de falha (o `catch` de `UpstreamUnavailableError`). O repo só oferece operações simples ([`repos.md`](repos.md), R12). |
| U6 | Cada passo é um método privado (`find<Fonte><Nome>`) que devolve o que buscou. |
| U7 | Validações são `private validate<Condição>`, logo abaixo do passo que validam. As do usecase todo ficam no começo do `_execute`. |
| U9 | **Mapper:** quando a saída de uma rota junta models de **domínios distintos** (ex.: o ensaio e as reservas), ela é montada por um mapper em `usecases/mappers/<nome>.mapper.ts`, **um por arquivo** (uma classe `<Nome>Mapper` com `static toView(...)`). **A saída do mapper é o retorno do usecase, então é model:** uma classe em `models/` (M1–M8: campos `readonly` no construtor e `validate()`), como `EventView`, `AdminSummary` e `StockItem`. O mapper devolve `new EventView(...)`; **nada de interface de saída solta** (`I<Nome>View`) no usecase ou no mapper. O mapper **só formata**: sem regra nem conta. A regra de um domínio (a conta das vagas, `soldOut`) é método do model de origem, que recebe o que precisa (`group.available(attendances)`). O motivo do mapper é um model não importar o model de outro domínio para montar a saída. A rota responde `{ body: <model> }`: o JSON são os campos `readonly` do construtor, então o model de saída não tem campo a mais, getter nem campo privado que mude o JSON. O `check.cjs` acusa mapper fora da pasta (`mapper-location`). |

## Exemplo

```ts
// src/serve-utils/usecases/find-event.ts
import { AppError, InvalidParameterError } from "../errors/app-error";
import { createLogger } from "../lib/logger";
import type { BasicEvent } from "../models/basic-event";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import type { UUID } from "../interfaces/uuid";

const logger = createLogger("FindEventUsecase");

export interface IFindEventInput {
  id: UUID;
}

export class FindEventUsecase {
  constructor(private readonly transicionaisRepo: ITransicionaisRepo) {}

  async execute(input: IFindEventInput): Promise<BasicEvent> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error; // erro conhecido: a rota converte em status + key
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // mesma assinatura do execute, apenas para encapsular
  private async _execute(input: IFindEventInput): Promise<BasicEvent> {
    this.validateInput(input);

    return this.findTransicionaisEvent(input.id);
  }

  private validateInput(input: IFindEventInput) {
    if (!input.id) {
      throw new InvalidParameterError("Field id is required");
    }
  }

  private async findTransicionaisEvent(id: UUID): Promise<BasicEvent> {
    const event = await this.transicionaisRepo.findEventOrFail({ id });

    // this.validate{Condition}(event) // validacao especifica deste passo

    return event;
  }
}
```

## Exemplo: mapper (U9)

```ts
// src/serve-utils/models/event-instrument.ts (trecho): a saída é model
export class EventInstrument {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly available: number | null, // null = sem limite
    readonly soldOut: boolean,
  ) {
    this.validate();
  }
  // private validate() { ... } (M2, M3)
}

// src/serve-utils/usecases/mappers/event-view.mapper.ts (trecho)
export class EventViewMapper {
  static toView(event: CurrentEvent, attendances: Attendance[], stale: boolean): EventView {
    return new EventView(
      event.dayKey,
      // ...
      event.groups
        .filter((group) => group.active)
        .map((group) => new EventInstrument(
          group.id,
          group.name,
          group.available(attendances), // a conta é do model (Group)
          group.soldOut(attendances),
        )),
      stale,
    );
  }
}

// no usecase: devolve o model
return EventViewMapper.toView(event, await this.hormoniosRepo.listByDay(event.dayKey), false);
```

## Teste com fake

```ts
const fakeRepo: ITransicionaisRepo = {
  findEvent: async () => null,
  findEventOrFail: async () => { throw new NotFoundError("Event Not Found"); },
};

await new FindEventUsecase(fakeRepo).execute({ id }); // lança NotFoundError
```
