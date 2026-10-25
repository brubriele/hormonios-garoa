import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

// integer da função migrar_fase1: quantas linhas passaram para o dia novo
const MovedCountSchema = z.number().int().default(0);

export class MovedCountResponse {
  static toDomain(raw: unknown, operation: string): number {
    return parseResponse(MovedCountSchema, raw, InfraSource.Supabase, operation);
  }
}
