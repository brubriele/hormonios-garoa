# Usecases (`src/serve-utils/usecases/`)

> Índice: [`README.md`](README.md). Usa: [`interfaces.md`](interfaces.md), [`errors.md`](errors.md). Quem chama: [`api.md`](api.md).

## Regras

| # | Regra |
|---|---|
| U1 | **Um usecase por rota** de `/api`, num arquivo `kebab-case` com o **gerúndio + objeto** (`finding-event.ts` → `FindingEventUsecase`, `creating-user-booking.ts` → `CreatingUserBookingUsecase`). Quem fala com o Transicionais diz o sentido: `syncing-*` envia (Supabase → Transicionais) e `receiving-*` recebe (Transicionais → Supabase). A reserva e a presença são `Booking` (a linha de `hg_attendances`). O arquivo fica na **pasta do contexto**: `booking/` (o que a pessoa faz: reservar, desfazer, ver as suas), `event/` (o ensaio atual e a Produção) e `sync/` (o que lê ou envia ao Transicionais, com ou sem rota). Contexto novo só com a pessoa de acordo (README, "Ao terminar", item 4). |
| U2 | Recebe os repos **pela interface**, no construtor (`private readonly`). |
| U3 | `execute(input)` só tem o `try/catch`. A lógica fica em `private _execute(input)`, com a mesma assinatura. |
| U4 | `return await this._execute(...)`. **Sem o `await`, o `catch` não pega a rejeição.** |
| U5 | No `catch`: `AppError` é relançado (a rota converte). Outro erro vai para o log (`logger.error({ err: error }, "unexpected error")`, [`lib.md`](lib.md)) e sai como erro genérico. |
| U8 | **A regra de negócio é do usecase**, não do repo: escolher entre itens, decidir pelo estado, orquestrar chamadas e o plano de falha (o `catch` de `UpstreamUnavailableError`). O repo só oferece operações simples ([`repos.md`](repos.md), R12). |
| U6 | Cada passo é um método privado (`find<Fonte><Nome>`) que devolve o que buscou. |
| U7 | Validações são `private validate<Condição>`, logo abaixo do passo que validam. As do usecase todo ficam no começo do `_execute`. |
| U10 | **Todo usecase que recebe `input` o valida inteiro por um schema zod**, porque a rota não valida nada ([`api.md`](api.md), A7): o corpo, o `deviceId`, o `ip`, os models recebidos (`z.instanceof(Booking)`). O schema é `const <Usecase>InputSchema = z.object({...})`, no topo do arquivo, e o `private validateInput(input)`, primeira linha do `_execute`, só chama `validateSchema(<Usecase>InputSchema, input)` (`models/model-schema.ts`, com os schemas comuns `NonBlankSchema`, `UuidSchema`, `CountSchema`...). Vale também para um formato interno conferido antes de ir à fonte (ex.: `CapacityChangeSchema`). Campo que pode faltar é `.optional()`; regra entre campos, `.refine(fn, { path, message })`. Nada de `if (typeof input.x …) throw`. O `check.cjs` acusa usecase com `execute(input)` sem `validateSchema` (`usecase-input-schema`) e `typeof input` (`usecase-manual-validate`). A validação **pelo estado** (o encontro, o estoque, as reservas: `validateBookingOpen`, `validateStocksExist`) continua com `if` e o erro de domínio: é regra de negócio (U8). |
| U9 | **Mapper:** quando a saída de uma rota junta models de **domínios distintos** (ex.: o ensaio e as reservas), ela é montada por um mapper em `usecases/<contexto>/mappers/<nome>.mapper.ts`, **um por arquivo** (uma classe `<Nome>Mapper` com `static toView(...)`). **A saída do mapper é o retorno do usecase, então é model:** uma classe em `models/` (M1–M8: campos `readonly` no construtor e `validate()`), como `EventView`, `CurrentEventSummary` e `StockItem`. O mapper devolve `new EventView(...)`; **nada de interface de saída solta** (`I<Nome>View`) no usecase ou no mapper. O mapper **só formata**: sem regra nem conta. A regra de um domínio (a conta das vagas, `soldOut`) é método do model de origem, que recebe o que precisa (`group.available(attendances)`). O motivo do mapper é um model não importar o model de outro domínio para montar a saída. A rota responde `{ body: <model> }`: o JSON são os campos `readonly` do construtor, então o model de saída não tem campo a mais, getter nem campo privado que mude o JSON. O `check.cjs` acusa mapper fora da pasta (`mapper-location`). |
| U11 | **Um usecase por contexto, com responsabilidade única.** Uma rota que cobre mais de um contexto (ex.: `GET /api/cron/sync`: o próximo ensaio, o estoque e as reservas) recebe o contexto na entrada (`?type=nextEvent`) e chama o usecase dele (`syncing-next-event-pending`, `syncing-stock-pending`, `syncing-booking-pending`); não há usecase que junte os contextos. Usecase sem rota só por reuso (`syncing-user-booking`). **Código parecido entre contextos não é duplicação:** cada um tem a sua regra (o que fazer com cada erro, o lote, a recusa) e evolui sozinho. Não extraia o que é comum entre usecases de contextos diferentes para um helper ou um método compartilhado; um erro novo ou uma inconsistência num contexto não pode virar refatoração nos outros. A G8 (sem helper repetido) vale para os helpers de `lib/`, `repos/parse-response.ts` e `models/model-schema.ts`, não para a regra de um usecase. |

## Exemplo

```ts
// src/serve-utils/usecases/event/finding-event.ts
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { createLogger } from "../lib/logger";
import type { BasicEvent } from "../models/basic-event";
import { NonBlankSchema, validateSchema } from "../models/model-schema";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import type { UUID } from "../interfaces/uuid";

const logger = createLogger("FindingEventUsecase");

const FindingEventInputSchema = z.object({
  id: NonBlankSchema,
});

export interface IFindingEventInput {
  id: UUID;
}

export class FindingEventUsecase {
  constructor(private readonly transicionaisRepo: ITransicionaisRepo) {}

  async execute(input: IFindingEventInput): Promise<BasicEvent> {
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
  private async _execute(input: IFindingEventInput): Promise<BasicEvent> {
    this.validateInput(input);

    return this.findTransicionaisEvent(input.id);
  }

  private validateInput(input: IFindingEventInput) {
    validateSchema(FindingEventInputSchema, input); // U10
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

// src/serve-utils/usecases/event/mappers/event-view.mapper.ts (trecho)
export class EventViewMapper {
  static toView(event: CurrentEvent, attendances: Booking[], stale: boolean): EventView {
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

await new FindingEventUsecase(fakeRepo).execute({ id }); // lança NotFoundError
```
