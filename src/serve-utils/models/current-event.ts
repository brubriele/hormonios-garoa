import { z } from "zod";
import type { Booking } from "./booking";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

// a reserva ocupa vaga a mais do que o taken do retrato? No retrato do Transicionais (taken não null),
// só a "vou" local PENDING (a SYNCED já está no taken); no retrato local da fase 1, toda "vou"
function countsOverTaken(taken: number | null, booking: Booking): boolean {
  return booking.isGoing && (taken === null || booking.isLocalOnly);
}

// o que tem estoque no encontro (instrumento ou acessório): a conta das vagas é a mesma
abstract class Stock {
  abstract readonly stockTotal: number | null; // null = sem limite
  abstract readonly taken: number | null; // confirmed do dia no Transicionais (D47); null = retrato local
  abstract readonly rotativo: boolean; // pode passar da capacidade

  // vagas ocupadas pelas reservas do encontro
  abstract countTaken(bookings: Booking[]): number;

  // estoque - ocupado, nunca abaixo de 0; null = sem limite
  available(bookings: Booking[]): number | null {
    return this.stockTotal === null ? null : Math.max(0, this.stockTotal - this.countTaken(bookings));
  }

  // rotativo nunca esgota
  soldOut(bookings: Booking[]): boolean {
    return !this.rotativo && this.available(bookings) === 0;
  }

  // o estoque novo fica abaixo do ocupado? Rotativo pode passar da capacidade (D29)
  isBelowBookings(capacity: number, bookings: Booking[]): boolean {
    return !this.rotativo && capacity < this.countTaken(bookings);
  }
}

const GroupSchema = z.object({
  id: NonBlankSchema,
  name: NonBlankSchema,
  stockTotal: CountSchema.nullable(),
  active: z.boolean(),
  taken: CountSchema.nullable(),
  instrumentSupportId: NonBlankSchema.nullable(),
  rotativo: z.boolean(),
});

// o instrumento do encontro: o grupo do Transicionais com a assistência type='instrumento' dele (E2.9)
export class Group extends Stock {
  constructor(
    readonly id: string, // grupo do Transicionais (o id da reserva)
    readonly name: string, // título da assistência do instrumento
    readonly stockTotal: number | null, // capacity da assistência; null = sem limite
    readonly active: boolean,
    readonly taken: number | null = null, // confirmed do dia no Transicionais (D47); null = retrato local (conta da fase 1)
    // assistência do instrumento. Interna ao BFF, fora das respostas de /api. A reserva com este grupo
    // a manda em supportTypeIds, junto dos acessórios
    readonly instrumentSupportId: string | null = null,
    readonly rotativo: boolean = false, // pode passar da capacidade
  ) {
    super();
    this.validate();
  }

  private validate() {
    validateSchema(GroupSchema, this, "group");
  }

  // o estoque novo do instrumento (o model é imutável)
  withStockTotal(stockTotal: number): Group {
    return new Group(this.id, this.name, stockTotal, this.active, this.taken, this.instrumentSupportId, this.rotativo);
  }

  // num encontro que só existe no local, sem o ocupado do Transicionais (D51)
  withoutTaken(): Group {
    return new Group(this.id, this.name, this.stockTotal, this.active, null, this.instrumentSupportId, this.rotativo);
  }

  // vagas ocupadas: o taken do Transicionais + as "vou" locais PENDING do grupo; no retrato local da
  // fase 1 (taken null), as "vou" do grupo (REJECTED não conta)
  countTaken(bookings: Booking[]): number {
    const local = bookings.filter(
      (booking) => booking.groupId === this.id && countsOverTaken(this.taken, booking),
    );

    return (this.taken ?? 0) + local.length;
  }
}

const SupportSchema = z.object({
  id: NonBlankSchema,
  name: NonBlankSchema,
  stockTotal: CountSchema.nullable(),
  taken: CountSchema.nullable(),
  rotativo: z.boolean(),
  groupIds: z.array(NonBlankSchema),
});

// acessório: assistência type='acessorio'. Os defaults são os do retrato local da fase 1
// (sem limite, não rotativo, vale para todos os grupos)
export class Support extends Stock {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly stockTotal: number | null = null, // capacity; null = sem limite
    readonly taken: number | null = null, // confirmed do dia no Transicionais (D47); null = retrato local
    readonly rotativo: boolean = false,
    readonly groupIds: string[] = [], // vazio = vale para todos os grupos
  ) {
    super();
    this.validate();
  }

  private validate() {
    validateSchema(SupportSchema, this, "support");
  }

  withStockTotal(stockTotal: number): Support {
    return new Support(this.id, this.name, stockTotal, this.taken, this.rotativo, this.groupIds);
  }

  withoutTaken(): Support {
    return new Support(this.id, this.name, this.stockTotal, null, this.rotativo, this.groupIds);
  }

  appliesTo(groupId: string): boolean {
    return this.groupIds.length === 0 || this.groupIds.includes(groupId);
  }

  // acessórios ocupados, com a mesma regra do grupo: taken + as "vou" locais PENDING com o acessório;
  // no retrato local da fase 1 (taken null), as "vou" com o acessório
  countTaken(bookings: Booking[]): number {
    const local = bookings.filter(
      (booking) => booking.supportIds.includes(this.id) && countsOverTaken(this.taken, booking),
    );

    return (this.taken ?? 0) + local.length;
  }
}

const CurrentEventSchema = z.object({
  dayKey: NonBlankSchema,
  date: z.string(),
  time: z.string(),
  location: z.string(),
  bookingOpen: z.boolean(),
  whatsappUrl: z.string(),
  groups: z.array(z.instanceof(Group)),
  supports: z.array(z.instanceof(Support)),
  externalId: NonBlankSchema.nullable(),
  fetchedAt: z.string().nullable(),
});

export class CurrentEvent {
  constructor(
    readonly dayKey: string, // fase 1: UUID local; fase 2: String(configDayId)
    readonly date: string, // vazia = a definir
    readonly time: string, // vazia = a definir
    readonly location: string,
    readonly bookingOpen: boolean,
    readonly whatsappUrl: string,
    readonly groups: Group[],
    readonly supports: Support[],
    readonly externalId: string | null = null, // encontro no Transicionais; null = retrato local da fase 1
    readonly fetchedAt: string | null = null, // ISO da última leitura do Transicionais
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(CurrentEventSchema, this);
  }

  get isFromTransicionais(): boolean {
    return this.externalId !== null;
  }

  findGroup(id: string): Group | null {
    return this.groups.find((group) => group.id === id) ?? null;
  }

  // acessórios que valem para o instrumento do grupo (groupIds vazio ou com o grupo)
  supportsForGroup(groupId: string): Support[] {
    return this.supports.filter((support) => support.appliesTo(groupId));
  }

  findSupport(id: string): Support | null {
    return this.supports.find((support) => support.id === id) ?? null;
  }

  // o estoque ajustável pela Produção (E2.9): o acessório com o id ou o grupo cujo instrumentSupportId
  // é o id
  findStock(supportId: string): Group | Support | null {
    return this.findSupport(supportId)
      ?? this.groups.find((group) => group.instrumentSupportId === supportId)
      ?? null;
  }

  // o estoque de uma assistência trocado: o acessório com o id ou o grupo cujo instrumentSupportId é o
  // id (E2.9). Usado pelo estoque pendente (D53)
  withStock(supportId: string, stockTotal: number): CurrentEvent {
    return new CurrentEvent(
      this.dayKey,
      this.date,
      this.time,
      this.location,
      this.bookingOpen,
      this.whatsappUrl,
      this.groups.map((group) => (group.instrumentSupportId === supportId ? group.withStockTotal(stockTotal) : group)),
      this.supports.map((support) => (support.id === supportId ? support.withStockTotal(stockTotal) : support)),
      this.externalId,
      this.fetchedAt,
    );
  }

  // o próximo ensaio só no local ("Encerrar ensaio" com o Transicionais fora, D51): o mesmo horário,
  // grupos e assistências, fechado, sem o ocupado de lá e sem encontro no Transicionais
  next(dayKey: string, date: string, location: string): CurrentEvent {
    return new CurrentEvent(
      dayKey,
      date,
      this.time,
      location,
      false,
      this.whatsappUrl,
      this.groups.map((group) => group.withoutTaken()),
      this.supports.map((support) => support.withoutTaken()),
      null,
      this.fetchedAt,
    );
  }

  // as reservas que ocupam vaga no encontro (REJECTED fica de fora)
  goingBookings(bookings: Booking[]): Booking[] {
    return bookings.filter((booking) => booking.isGoing);
  }
}
