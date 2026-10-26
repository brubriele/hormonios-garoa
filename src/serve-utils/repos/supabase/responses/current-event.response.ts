import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { CurrentEvent, Instrument, Accessory } from "../../../models/current-event";
import { parseResponse } from "../../parse-response";

const OPERATION = "findCurrentEvent";

// os campos opcionais com default são os que o retrato local da fase 1 não tem (sem limite, não
// rotativo, vale para todos os grupos). taken só existe no retrato do Transicionais
const InstrumentDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  stockTotal: z.number().int().nullable(), // null = sem limite
  active: z.boolean(),
  taken: z.number().int().default(0), // só no retrato do Transicionais
  instrumentSupportId: z.string().optional().transform((id) => id ?? null), // só no retrato do Transicionais
  rotativo: z.boolean().default(false),
});

const AccessoryDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  stockTotal: z.number().int().nullable().default(null),
  taken: z.number().int().default(0), // só no retrato do Transicionais
  rotativo: z.boolean().default(false),
  groupIds: z.array(z.string()).default([]),
});

// jsonb de hg_current_event.data (o que a função reservar lê)
const CurrentEventDataSchema = z.object({
  dayKey: z.string(),
  date: z.string(),
  time: z.string(),
  location: z.string(),
  bookingOpen: z.boolean(),
  whatsappUrl: z.string(),
  instruments: z.array(InstrumentDataSchema),
  accessories: z.array(AccessoryDataSchema),
});

// linha de hg_current_event (id = 1)
const CurrentEventRowSchema = z.object({
  data: CurrentEventDataSchema,
  external_id: z.string().nullable(), // null = retrato local da fase 1
  fetched_at: z.string().nullable(),
});

export class CurrentEventResponse {
  static toDomain(raw: unknown): CurrentEvent {
    const row = parseResponse(CurrentEventRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () => CurrentEventResponse.fromRow(row));
  }

  private static fromRow(row: z.infer<typeof CurrentEventRowSchema>): CurrentEvent {
    const { data, external_id: externalId, fetched_at: fetchedAt } = row;
    // no retrato local, o ocupado é a conta da fase 1 (taken null)
    const fromTransicionais = externalId !== null;

    return new CurrentEvent(
      data.dayKey,
      data.date,
      data.time,
      data.location,
      data.bookingOpen,
      data.whatsappUrl,
      data.instruments.map(
        (instrument) =>
          new Instrument(
            instrument.id,
            instrument.name,
            instrument.stockTotal,
            instrument.active,
            fromTransicionais ? instrument.taken : null,
            instrument.instrumentSupportId,
            instrument.rotativo,
          ),
      ),
      data.accessories.map(
        (accessory) =>
          new Accessory(
            accessory.id,
            accessory.name,
            accessory.stockTotal,
            fromTransicionais ? accessory.taken : null,
            accessory.rotativo,
            accessory.groupIds,
          ),
      ),
      externalId,
      fetchedAt,
    );
  }
}
