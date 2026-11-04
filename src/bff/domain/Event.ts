import { type Attendance, AttendanceAnswer } from "./Attendance";
import { SyncStatus } from "./SyncStatus";

// D23
export enum EventVisibility {
  Public = "PUBLIC",
  Private = "PRIVATE",
}

// F2
export enum EventCatalogType {
  Instrument = "INSTRUMENT",
  Accessory = "ACCESSORY",
}

// o contrato geral do Evento que o Hormônios precisa: o que fica no Supabase e o que o repo traduz
// para o Transicionais. Na raiz, o que a tela usa; em metadata, o resto
export class Event {
  readonly name: string;
  readonly categoryId: string | null;
  readonly endTime: string | null;
  readonly description: EventDescription;
  readonly integrationId: number | null;

  constructor(
    readonly id: string, // uuid  // supabraseid,
    readonly location: string,
    readonly whatsappUrl: string | null, // só do Hormônios
    readonly date: string, // YYYY-MM-DD; vazia = a definir
    readonly startTime: string | null, // HH:mm; null = a definir
    readonly isActive: boolean, // spec-8 C1
    readonly groups: EventGroup[], // os grupos (ex.: Tamborim)
    readonly catalog: EventCatalog[], // o que é oferecido
    readonly metadata: EventMetadata,
    readonly goingCount: number = 0, // F5
  ) {
    this.name = metadata.name;
    this.categoryId = metadata.categoryId;
    this.endTime = metadata.endTime;
    this.description = metadata.description;
    this.integrationId = metadata.integrationId;
  }

  // F4
  withAttendances(attendances: Attendance[], withCapacity: boolean): Event {
    const going = attendances.filter(
      (attendance) => attendance.metadata.answer === AttendanceAnswer.Going && attendance.metadata.sync !== SyncStatus.Rejected,
    );
    const groups = this.groups.map((group) => group.withAttendances(going, withCapacity));
    const catalog = this.catalog.map((item) => item.withAttendances(going));

    return new Event(
      this.id,
      this.location,
      this.whatsappUrl,
      this.date,
      this.startTime,
      this.isActive,
      groups,
      catalog,
      this.metadata,
      going.length,
    );
  }

  // o Event inteiro, como fica no jsonb (data)
  toJson() {
    return {
      id: this.id,
      location: this.location,
      whatsappUrl: this.whatsappUrl,
      date: this.date,
      startTime: this.startTime,
      isActive: this.isActive,
      goingCount: this.goingCount,
      groups: this.groups.map((group) => group.toJson()),
      catalog: this.catalog.map((item) => item.toJson()),
      metadata: this.metadata.toJson(),
    };
  }
}

// um item do catálogo: o que é oferecido no encontro (instrumento ou acessório)
export class EventCatalog {
  readonly type: EventCatalogType;
  readonly groupIds: string[];

  constructor(
    readonly id: string,
    readonly name: string,
    readonly stock: EventCatalogStock,
    readonly metadata: EventCatalogMetadata,
  ) {
    this.type = metadata.type;
    this.groupIds = metadata.groupIds;
  }

  // F4
  withAttendances(going: Attendance[]): EventCatalog {
    const used = this.countUsed(going);
    const stock = new EventCatalogStock(this.stock.total, this.stock.rotative, used);

    return new EventCatalog(this.id, this.name, stock, this.metadata);
  }

  private countUsed(going: Attendance[]): number {
    if (this.metadata.type === EventCatalogType.Instrument) {
      const inGroup = going.filter((attendance) => attendance.eventGroup !== null && this.metadata.groupIds.includes(attendance.eventGroup.id));

      return inGroup.length;
    }

    const withItem = going.filter((attendance) => attendance.catalog.some((item) => item.id === this.id));

    return withItem.length;
  }

  toJson() {
    return {
      id: this.id,
      name: this.name,
      stock: this.stock.toJson(),
      metadata: this.metadata.toJson(),
    };
  }
}

// o estoque do item do catálogo
export class EventCatalogStock {
  readonly free: number | null;

  constructor(
    readonly total: number | null = null,
    readonly rotative: boolean = false,
    readonly used: number = 0,
  ) {
    this.free = this.countFree();
  }

  // F3
  private countFree(): number | null {
    if (this.total === null || this.rotative) {
      return null;
    }

    return Math.max(this.total - this.used, 0);
  }

  toJson() {
    return { total: this.total, rotative: this.rotative, used: this.used, free: this.free };
  }
}

// tudo do item do catálogo que não é utilizado na tela do Hormônios
export class EventCatalogMetadata {
  constructor(
    readonly groupIds: string[],
    readonly type: EventCatalogType,
  ) {}

  toJson() {
    return { groupIds: this.groupIds, type: this.type };
  }
}

// o grupo em si (ex.: Tamborim)
export class EventGroup {
  readonly active: boolean;

  constructor(
    readonly id: string, // grupo do Transicionais (o groupId da reserva)
    readonly name: string,
    readonly metadata: EventGroupMetadata,
    readonly capacity: number | null = null, // vazio quando não ouver ou na visão do membro
  ) {
    this.active = metadata.active;
  }

  // F4
  withAttendances(going: Attendance[], withCapacity: boolean): EventGroup {
    const capacity = this.countCapacity(going, withCapacity);

    return new EventGroup(this.id, this.name, this.metadata, capacity);
  }

  private countCapacity(going: Attendance[], withCapacity: boolean): number | null {
    const exclusiveCapacity = this.metadata.exclusiveCapacity;

    if (!withCapacity || exclusiveCapacity === null) {
      return null;
    }

    const inGroup = going.filter((attendance) => attendance.eventGroup?.id === this.id);

    return Math.max(exclusiveCapacity - inGroup.length, 0);
  }

  toJson() {
    return { id: this.id, name: this.name, capacity: this.capacity, metadata: this.metadata.toJson() };
  }
}

// tudo do grupo que não é utilizado na tela do Hormônios
export class EventGroupMetadata {
  constructor(
    readonly active: boolean,
    readonly exclusiveCapacity: number | null, // vagas de pessoas do grupo na publicação; null = sem limite
  ) {}

  toJson() {
    return { active: this.active, exclusiveCapacity: this.exclusiveCapacity };
  }
}

// supportIds sai dos stocks de groups e accessories; guestDeadlineMinutes sai de bookingOpen (D1)
export class EventDescription {
  constructor(
    readonly visibility: EventVisibility,
    readonly description: string | null,
    readonly releaseAt: string | null,
    readonly membersEarlyAt: string | null,
    readonly totalVacancies: number | null, // null = sem limite
  ) {}

  toJson() {
    return {
      visibility: this.visibility,
      description: this.description,
      releaseAt: this.releaseAt,
      membersEarlyAt: this.membersEarlyAt,
      totalVacancies: this.totalVacancies,
    };
  }
}

// tudo que não é utilizado na tela do Hormônios
export class EventMetadata {
  constructor(
    readonly externalPublicId: string | null, // link público no Transicionais (o id da publicação); null = só local
    readonly integrationId: number | null, // quando ainda não foi integrado
    readonly transicionaisDayId: number | null,
    readonly name: string,
    readonly categoryId: string | null, // o ciclo
    readonly endTime: string | null, // HH:mm; null = a definir
    readonly description: EventDescription,
    readonly version: number | null, // version do encontro no Transicionais
    readonly fetchedAt: string | null, // ISO da última leitura,
    readonly sync: SyncStatus, // D6
    readonly syncError: string | null,
    readonly syncHash: string | null, // D22
    readonly syncedAt: string | null,
  ) {}

  toJson() {
    return {
      externalPublicId: this.externalPublicId,
      integrationId: this.integrationId,
      transicionaisDayId: this.transicionaisDayId,
      name: this.name,
      categoryId: this.categoryId,
      endTime: this.endTime,
      description: this.description.toJson(),
      version: this.version,
      fetchedAt: this.fetchedAt,
      sync: this.sync,
      syncError: this.syncError,
      syncHash: this.syncHash,
      syncedAt: this.syncedAt,
    };
  }
}
