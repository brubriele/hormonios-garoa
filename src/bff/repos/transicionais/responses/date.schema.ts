import { z } from "zod";

// data que o Date.parse entende (ISO, com ou sem hora), como o Transicionais manda nos campos *At
export const DateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
