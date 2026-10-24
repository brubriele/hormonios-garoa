# Usecases (`src/serve-utils/usecases/`)

> Índice: [`README.md`](README.md). Usa: [`interfaces.md`](interfaces.md), [`errors.md`](errors.md). Quem chama: [`api.md`](api.md).

## Regras

| # | Regra |
|---|---|
| U1 | **Um usecase por rota** de `/api`, num arquivo `kebab-case` (`find-event.ts` → `FindEventUsecase`). |
| U2 | Recebe os repos **pela interface**, no construtor (`private readonly`). |
| U3 | `execute(input)` só tem o `try/catch`. A lógica fica em `private _execute(input)`, com a mesma assinatura. |
| U4 | `return await this._execute(...)`. **Sem o `await`, o `catch` não pega a rejeição.** |
| U5 | No `catch`: `AppError` é relançado (a rota converte). Outro erro vai para o log e sai como erro genérico. |
| U6 | Cada passo é um método privado (`find<Fonte><Nome>`) que devolve o que buscou. |
| U7 | Validações são `private validate<Condição>`, logo abaixo do passo que validam. As do usecase todo ficam no começo do `_execute`. |

## Exemplo

```ts
// src/serve-utils/usecases/find-event.ts
import { AppError, InvalidParameterError } from "../errors/app-error";
import type { BasicEvent } from "../models/basic-event";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import type { UUID } from "../interfaces/uuid";

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

      console.error("[FindEventUsecase]", error);
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

## Teste com fake

```ts
const fakeRepo: ITransicionaisRepo = {
  findEvent: async () => null,
  findEventOrFail: async () => { throw new NotFoundError("Event Not Found"); },
};

await new FindEventUsecase(fakeRepo).execute({ id }); // lança NotFoundError
```
