import { z } from "zod";
import { Event, EventCatalogType, EventVisibility } from "../../domain/Event";
import { EventMapper } from "../../domain/mappers/EventMapper";
import { AppError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger } from "../../lib/logger";
import { CountSchema, NonBlankSchema, validateSchema } from "../../lib/schema";

const logger = createLogger("CreatingInternalEventUsecase");

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const EventBodySchema = z
  .object({
    location: NonBlankSchema,
    whatsappUrl: z.string().nullable(),
    date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    startTime: TimeSchema.nullable(),
    bookingOpen: z.boolean().nullable(),
    groups: z.array(
      z.object({
        id: NonBlankSchema,
        name: NonBlankSchema,
        metadata: z.object({
          active: z.boolean(),
          exclusiveCapacity: CountSchema.nullable(),
        }),
      }),
    ),
    catalog: z.array(
      z.object({
        id: NonBlankSchema,
        name: NonBlankSchema,
        stock: z.object({
          total: CountSchema.nullable(),
          rotative: z.boolean(),
        }),
        metadata: z.object({
          groupIds: z.array(z.string()),
          type: z.enum(EventCatalogType),
        }),
      }),
    ),
    metadata: z.object({
      name: NonBlankSchema,
      categoryId: z.string().nullable(),
      endTime: TimeSchema.nullable(),
      description: z.object({
        visibility: z.enum(EventVisibility),
        description: z.string().nullable(),
        releaseAt: z.string().nullable(),
        membersEarlyAt: z.string().nullable(),
        totalVacancies: CountSchema.nullable(),
      }),
    }),
  })
  .refine(
    (body) => body.catalog.every((item) => item.metadata.groupIds.every((groupId) => body.groups.some((group) => group.id === groupId))),
    { path: ["catalog"], message: "must reference existing groups" },
  )
  .refine(
    (body) => {
      const instruments = body.catalog.filter((item) => item.metadata.type === EventCatalogType.Instrument);
      const groupIds = instruments.flatMap((item) => item.metadata.groupIds);
      const uniqueGroupIds = new Set(groupIds);

      return uniqueGroupIds.size === groupIds.length;
    },
    { path: ["catalog"], message: "must have at most one INSTRUMENT per group" },
  );

const CreatingInternalEventInputSchema = z.instanceof(Event);

export class CreatingInternalEventUsecase {
  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(data: Event): Promise<Event> {
    try {
      return await this._execute(data);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(data: Event): Promise<Event> {
    const valid = this.validateInput(data);
    const event = this.withId(valid);

    return this.createEvent(event);
  }

  private validateInput(data: Event): Event {
    const event = validateSchema(CreatingInternalEventInputSchema, data);
    const json = event.toJson();

    validateSchema(EventBodySchema, json);

    return event;
  }

  private withId(event: Event): Event {
    const id = globalThis.crypto.randomUUID();
    const json = event.toJson();

    return EventMapper.fromData({ ...json, id });
  }

  private async createEvent(event: Event): Promise<Event> {
    return this.hormoniosRepository.createEvent(event);
  }
}
