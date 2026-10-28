// O id do Transicionais nas duas direções (RR10): o Transicionais usa número; o domínio do Hormônios,
// texto
import { z } from "zod";

// volta (response): número na API, às vezes texto -> string
export const TransicionaisIdSchema = z.union([z.number().int(), z.string().min(1)]).transform(String);

// ida (request): id do Hormônios -> número do Transicionais. Fora disso é bug do Hormônios, não falha
// da fonte (E7)
export function numericId(value: string, field: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    // check-ignore throw-error: id do Hormônios fora do formato é bug (E7), não falha do Transicionais
    throw new Error(`Transicionais ${field} must be a positive integer: ${value}`);
  }

  return id;
}
