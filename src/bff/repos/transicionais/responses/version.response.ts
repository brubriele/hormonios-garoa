import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

// resposta das escritas em v2/manager-events/details/*: a version nova do encontro
const VersionSchema = z.object({ version: z.number().int() });

export class VersionResponse {
  static toDomain(raw: unknown, operation: string): number {
    return parseResponse(VersionSchema, raw, InfraSource.Transicionais, operation).version;
  }
}
