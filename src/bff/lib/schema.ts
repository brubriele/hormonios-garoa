import { z } from "zod";
import { InvalidParameterError } from "../errors/app-error";

export const NonBlankSchema = z.string().trim().min(1);

export const UuidSchema = z.guid();

export const CountSchema = z.number().int().min(0);

export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const DateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

// U10
export function validateSchema<T extends z.ZodType>(schema: T, value: unknown, prefix?: string): z.infer<T> {
  const parsed = schema.safeParse(value, { error: () => "is invalid" });

  if (parsed.success) {
    return parsed.data;
  }

  const issue = parsed.error.issues[0];
  const path = issue?.path.filter((key) => typeof key === "string") ?? [];
  const field = [prefix, ...path].filter(Boolean).join(".") || "model";
  const message = issue?.message ?? "is invalid";

  throw new InvalidParameterError(`Field ${field} ${message}`);
}
