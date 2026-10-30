import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

const OPERATION = "createEvent";

const CreatedIdSchema = z.number().int().transform(String);

// o contrato só diz `content`: o id pode vir nele (número), em content.id, ou não vir (D18)
const CreatedContentSchema = z
  .union([CreatedIdSchema, z.object({ id: CreatedIdSchema }).transform((content) => content.id)])
  .nullable()
  .catch(null);

const CreatedEventSchema = z.object({ content: CreatedContentSchema }).catch({ content: null });

export class CreatedEventResponse {
  // o id do encontro criado; null = não veio (o usecase o acha pela listagem, D18)
  static toDomain(raw: unknown): string | null {
    return parseResponse(CreatedEventSchema, raw, InfraSource.Transicionais, OPERATION).content;
  }
}
