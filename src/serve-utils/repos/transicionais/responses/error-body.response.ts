import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
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

export class ErrorBodyResponse {
  // details = o corpo do erro, como o client o guardou (IClientError.details)
  static toDomain(details: unknown): IErrorBody {
    return parseResponse(ErrorBodySchema, details, InfraSource.Transicionais, OPERATION);
  }
}
