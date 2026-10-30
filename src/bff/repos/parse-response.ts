import type { z } from "zod";
import { InvalidParameterError } from "../errors/app-error";
import { type InfraSource, InvalidResponseError } from "../errors/infra-error";

// valida a resposta de uma fonte pelo schema do response; fora do formato -> InvalidResponseError
export function parseResponse<T extends z.ZodType>(
  schema: T,
  raw: unknown,
  source: InfraSource,
  operation: string,
): z.infer<T> {
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    throw InvalidResponseError.fromZod(source, operation, parsed.error);
  }

  return parsed.data;
}

// valida um corpo que a fonte manda ao Hormônios (webhook): fora do formato é pedido inválido (400),
// e não resposta inválida (500). A mensagem diz o primeiro campo recusado
export function parseInput<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") || "body";

    throw new InvalidParameterError(`Field ${field} is invalid`);
  }

  return parsed.data;
}
