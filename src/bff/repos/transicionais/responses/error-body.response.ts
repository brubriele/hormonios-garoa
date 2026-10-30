import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import type { ITransicionaisErrorCause } from "../../../interfaces/transicionais";
import { parseResponse } from "../../parse-response";

const OPERATION = "errorBody";

// corpo de erro do Transicionais ({ statusCode, key, message }). A message pode ser um texto ou a
// lista dos campos recusados (REQUEST_ERROR). Fora do formato: sem key e sem message
const ErrorBodySchema = z
  .object({
    key: z.string().optional().catch(undefined),
    message: z.unknown(),
  })
  .catch({ key: undefined, message: undefined });

export type IErrorBody = z.infer<typeof ErrorBodySchema>;

// o corpo do erro como veio, para gravar (D50); sem corpo, null
const ErrorCauseBodySchema = z.unknown().default(null);

export class ErrorBodyResponse {
  // details = o corpo do erro, como o client o guardou (IClientError.details)
  static toDomain(details: unknown): IErrorBody {
    return parseResponse(ErrorBodySchema, details, InfraSource.Transicionais, OPERATION);
  }

  // o erro como veio, sem tradução, para gravar (D50); sem corpo, null
  static toCause(details: unknown, status: number, operation: string): ITransicionaisErrorCause {
    return {
      operation,
      status,
      body: parseResponse(ErrorCauseBodySchema, details, InfraSource.Transicionais, OPERATION),
    };
  }
}
