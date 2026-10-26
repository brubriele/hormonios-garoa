import { z } from "zod";
import { InvalidParameterError } from "../errors/app-error";

// texto obrigatório: não aceita vazio nem só espaços (M4)
export const NonBlankSchema = z.string().refine((value) => value.trim() !== "");

// id local (hg_device, reserva)
export const UuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

// estoque, vagas e contagens
export const CountSchema = z.number().int().min(0);

// YYYY-MM-DD
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// data que o Date.parse lê (ISO)
export const DateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

// valida um model (M3) ou a entrada de um usecase (U10) pelo schema: fora do formato ->
// InvalidParameterError com o primeiro campo recusado ("Field group.id is invalid"). A regra entre
// campos (.refine com path e message) usa a própria message: "Field supportIds must be empty without groupId"
export function validateSchema(schema: z.ZodType, value: unknown, prefix?: string): void {
  const parsed = schema.safeParse(value, { error: () => "is invalid" });

  if (parsed.success) {
    return;
  }

  const issue = parsed.error.issues[0];
  const path = issue?.path.filter((key) => typeof key === "string") ?? [];
  const field = [prefix, ...path].filter(Boolean).join(".") || "model";

  throw new InvalidParameterError(`Field ${field} ${issue?.message ?? "is invalid"}`);
}
