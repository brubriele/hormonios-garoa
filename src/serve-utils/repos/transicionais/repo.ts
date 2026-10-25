import {
  type AppError,
  InvalidParameterError,
  NotFoundError,
  StockBelowReservationsError,
  UpstreamUnavailableError,
} from "../../errors/app-error";
import { HttpClient } from "../../clients/http-client";
import type { IClientResponse } from "../../interfaces/client-response";
import type {
  IEventRef,
  IFindCurrentEventResult,
  IRawConfigDay,
  IRawCreatedEvent,
  IRawDaySupport,
  IRawErrorBody,
  IRawEventDetails,
  IRawEventPublic,
  IRawEventPublicInput,
  IRawEventSummary,
  IRawManagerSupportType,
  IRawPage,
  IRawPublicEvent,
  IRawSupportTypeUpdateInput,
  IRawVersioned,
  ITransicionaisRepo,
  IUpdateTransicionaisEventData,
} from "../../interfaces/transicionais";
import { CurrentEvent, Group, Support } from "../../models/current-event";
import { EventSnapshot } from "../../models/event-snapshot";
import { TransicionaisSession } from "./session";
import { TransicionaisUrlCollection } from "./url-collection";

// reservas abertas/fechadas pelo prazo do convidado (dúvida D1)
const BOOKING_OPEN_DEADLINE_MINUTES = 0; // até o início do dia
// o máximo da API (30 dias antes do início): fecha enquanto o encontro estiver a até 30 dias (D1)
const BOOKING_CLOSED_DEADLINE_MINUTES = 43200;

// o encontro atual é o primeiro Público da listagem de manager, de hoje em diante (E2.7, revista)
const TIME_ZONE = "America/Sao_Paulo";

// "Encerrar ensaio" (dúvida D2)
const NEXT_EVENT_DAYS = 7;
const NEXT_EVENT_LOCATION = "A definir";

// key do Transicionais -> AppError do Hormônios, nas ações da Produção (R11)
const TRANSICIONAIS_ERRORS: Record<string, () => AppError> = {
  EXTERNAL_GROUP_CAPACITY_BELOW_TAKEN: () => new StockBelowReservationsError("Stock is below its reservations"),
  EXTERNAL_CAPACITY_BELOW_TAKEN: () => new StockBelowReservationsError("Stock is below its reservations"),
  EVENT_NOT_FOUND: () => new NotFoundError("Current event Not Found"),
  EXTERNAL_EVENT_NOT_FOUND: () => new NotFoundError("Current event Not Found"),
  SUPPORT_TYPE_NOT_FOUND: () => new NotFoundError("Support Not Found"),
};

// assistência do instrumento e acessório (E2.9)
const SUPPORT_INSTRUMENT = "instrumento";
const SUPPORT_ACCESSORY = "acessorio";

// EVENT_VERSION_CONFLICT: o repo lê a versão de novo e tenta uma vez mais
class VersionConflictError extends Error {}

function isUnavailable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

function errorKey(response: IClientResponse<unknown>): string | undefined {
  const details = response.error?.details;

  if (!details || typeof details !== "object") {
    return undefined;
  }

  return (details as IRawErrorBody).key;
}

// hoje (YYYY-MM-DD) no fuso de São Paulo
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}

export class TransicionaisRepo implements ITransicionaisRepo {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly session: TransicionaisSession,
  ) {}

  // listagem: só acha o encontro (externalId e o dia). Pública: grupos, local, horário, janela,
  // assistências com o estoque do dia e version (E2.9)
  private mapperSnapshot(
    summary: IRawEventSummary,
    publicEvent: IRawPublicEvent,
    vacanciesAt: string,
  ): EventSnapshot {
    const pub = publicEvent.public;
    const day =
      publicEvent.configDays.find((item) => item.id === summary.configDayId) ?? publicEvent.configDays[0];

    if (!pub) {
      throw new Error("Transicionais public event has no public description");
    }

    if (!day) {
      throw new Error("Transicionais public event has no day");
    }

    // inativa saiu das novas associações (D24)
    const daySupports = (day.summary?.supports ?? []).filter((support) => support.isActive !== false);

    const event = new CurrentEvent(
      String(summary.configDayId),
      day.current.slice(0, 10),
      (day.startTime ?? "").slice(0, 5),
      publicEvent.location ?? summary.location ?? "",
      Boolean(pub.answerWindow?.open) && !pub.answerWindow?.closed,
      "", // whatsappUrl é só do Hormônios: fica o gravado
      this.mapperGroups(publicEvent, daySupports),
      this.mapperSupports(daySupports),
      summary.externalId,
      vacanciesAt,
    );

    return new EventSnapshot(summary.externalId, publicEvent.version, vacanciesAt, event);
  }

  // um grupo por assistência type='instrumento', na ordem do Transicionais. O grupo é o primeiro de
  // groupIds que é grupo do encontro; sem nenhum, o instrumento fica de fora (D21). Todos ativos
  private mapperGroups(publicEvent: IRawPublicEvent, daySupports: IRawDaySupport[]): Group[] {
    const eventGroupIds = new Set((publicEvent.groups ?? []).map((group) => group.id));
    const groups: Group[] = [];

    for (const support of daySupports.filter((item) => item.type === SUPPORT_INSTRUMENT)) {
      const groupId = (support.groupIds ?? []).find((id) => eventGroupIds.has(id));

      if (groupId === undefined) {
        console.error(`[TransicionaisRepo] instrument support ${support.id} has no group of the event`);
        continue;
      }

      // dois instrumentos no mesmo grupo: vale o primeiro (D25)
      if (groups.some((group) => group.id === String(groupId))) {
        console.error(`[TransicionaisRepo] instrument support ${support.id} repeats group ${groupId}`);
        continue;
      }

      groups.push(
        new Group(
          String(groupId),
          support.title,
          support.capacity ?? null,
          true,
          Math.max(0, support.occupied ?? 0),
          String(support.id),
          support.rotativo === true,
        ),
      );
    }

    return groups;
  }

  // os acessórios: assistências type='acessorio', com o grupo a que valem (groupIds vazio = todos)
  private mapperSupports(daySupports: IRawDaySupport[]): Support[] {
    return daySupports
      .filter((support) => support.type === SUPPORT_ACCESSORY)
      .map(
        (support) =>
          new Support(
            String(support.id),
            support.title,
            support.capacity ?? null,
            Math.max(0, support.occupied ?? 0),
            support.rotativo === true,
            (support.groupIds ?? []).map(String),
          ),
      );
  }

  // fora do ar (rede, 429, 5xx, login) devolve UNAVAILABLE (R11)
  async findCurrentEvent(): Promise<IFindCurrentEventResult> {
    const vacanciesAt = new Date().toISOString();

    try {
      const summary = (await this.listPublicEvents())[0];

      if (!summary) {
        return { status: "NOT_FOUND" };
      }

      const response = await this.httpClient.get<IRawPublicEvent>(
        TransicionaisUrlCollection.publicEvent(summary.externalId, String(summary.configDayId)),
      );

      if (response.status === 404) {
        return { status: "NOT_FOUND" };
      }

      if (isUnavailable(response.status)) {
        return { status: "UNAVAILABLE" };
      }

      if (response.error || !response.data) {
        throw new Error(`Transicionais publicEvent failed with ${response.status}: ${errorKey(response)}`);
      }

      return { status: "FOUND", snapshot: this.mapperSnapshotOrFail(summary, response.data, vacanciesAt) };
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        return { status: "UNAVAILABLE" };
      }

      throw error;
    }
  }

  private mapperSnapshotOrFail(
    summary: IRawEventSummary,
    publicEvent: IRawPublicEvent,
    vacanciesAt: string,
  ): EventSnapshot {
    try {
      return this.mapperSnapshot(summary, publicEvent, vacanciesAt);
    } catch (error) {
      throw new Error(`Transicionais event is invalid: ${error instanceof Error ? error.message : error}`);
    }
  }

  // encontros Públicos de hoje em diante; o back já filtra a visibilidade
  private async listPublicEvents(): Promise<IRawEventSummary[]> {
    return this.assertWrite(
      await this.session.request<IRawPage<IRawEventSummary>>({
        url: TransicionaisUrlCollection.publicEventsFrom(today()),
      }),
      "listEvents",
    ).content;
  }

  // escritas: o id interno sai da listagem; o completo de manager só para version, dias e public
  private async findDetailsByRef(ref: IEventRef): Promise<IRawEventDetails> {
    const summary = (await this.listPublicEvents()).find((item) => item.externalId === ref.externalId);

    if (!summary) {
      throw new NotFoundError("Current event Not Found");
    }

    return this.findDetails(summary.id);
  }

  // o primeiro dia ativo de hoje em diante
  private currentDay(details: IRawEventDetails): IRawConfigDay | null {
    const from = today();
    const days = details.configDays
      .filter((day) => day.isActive && day.id !== null && day.current.slice(0, 10) >= from)
      .sort((a, b) => a.current.localeCompare(b.current));

    return days[0] ?? null;
  }

  async updateEvent(ref: IEventRef, data: IUpdateTransicionaisEventData): Promise<IEventRef> {
    try {
      return await this.applyEventUpdate(ref, data);
    } catch (error) {
      if (!(error instanceof VersionConflictError)) {
        throw error;
      }

      return this.applyEventUpdate(ref, data); // lê a versão de novo
    }
  }

  // cria o encontro, o ciclo, os grupos, o dia e o público, copiando o atual (E2.5). O atual sai
  // pelo closeEvent (D2). Falhou depois do POST: apaga o recém-criado e lança (dúvida D16)
  async createNextEvent(ref: IEventRef): Promise<IEventRef> {
    const current = await this.findDetailsByRef(ref);
    const pub = this.requirePublic(current);
    const day = current.configDays.find((item) => String(item.id) === ref.dayId) ?? this.currentDay(current);

    if (!day) {
      throw new Error("Transicionais event has no active day");
    }

    const date = addDays(day.current, NEXT_EVENT_DAYS);
    const created = this.assertWrite(
      await this.session.request<IRawCreatedEvent>({
        method: "POST",
        url: TransicionaisUrlCollection.events(),
        body: { name: current.name, location: NEXT_EVENT_LOCATION, startAt: date, endAt: date },
      }),
      "createEvent",
    );
    const eventId = await this.findCreatedId(created, current.name, date);

    try {
      await this.fillNextEvent(eventId, current, pub, day, date);

      return await this.findCreatedRef(eventId, date);
    } catch (error) {
      await this.deleteCreatedEvent(eventId);
      throw error;
    }
  }

  private async fillNextEvent(
    eventId: number,
    current: IRawEventDetails,
    pub: IRawEventPublic,
    day: IRawConfigDay,
    date: string,
  ): Promise<void> {
    let fresh = await this.findDetails(eventId);

    // o POST não grava o ciclo (o encontro 202 nasceu com o ciclo 1): vai pela rota própria
    if (current.categoryId !== null && fresh.categoryId !== current.categoryId) {
      this.assertWrite(
        await this.session.request<unknown>({
          method: "PUT",
          url: TransicionaisUrlCollection.eventCategory(eventId),
          body: { categoryId: current.categoryId },
        }),
        "updateCategory",
      );
      fresh = await this.findDetails(eventId);
    }

    let version = fresh.version;

    if (current.groups.length > 0) {
      version = this.assertWrite(
        await this.session.request<IRawVersioned>({
          method: "PUT",
          url: TransicionaisUrlCollection.eventGroups(eventId),
          body: { groupId: current.groups.map((group) => group.id), createdAt: fresh.createdAt.slice(0, 10) },
        }),
        "addGroups",
      ).version;
    }

    const newDay = (await this.listDays(eventId)).find((item) => item.current.slice(0, 10) === date);

    if (!newDay) {
      throw new Error(`Transicionais event ${eventId} has no day ${date}`);
    }

    version = await this.saveDays(eventId, version, [
      { ...newDay, isActive: true, startTime: day.startTime, endTime: day.endTime },
    ]);

    await this.saveEvent(eventId, version, {
      public: this.buildPublicInput(pub, current, { bookingOpen: false }),
    });
  }

  // o id vem no corpo do POST; se não vier, é o maior id Interno com o mesmo nome e dia (D18)
  private async findCreatedId(created: IRawCreatedEvent, name: string, date: string): Promise<number> {
    const content = created.content;
    const id = typeof content === "number" ? content : content?.id;

    if (typeof id === "number") {
      return id;
    }

    const events = this.assertWrite(
      await this.session.request<IRawPage<IRawEventSummary>>({ url: TransicionaisUrlCollection.eventsFrom(date) }),
      "listEvents",
    ).content;
    const ids = events
      .filter((item) => item.name === name && item.startAt.slice(0, 10) === date && !item.externalId)
      .map((item) => item.id);

    if (ids.length === 0) {
      throw new Error(`Transicionais created event ${date} Not Found`);
    }

    return Math.max(...ids);
  }

  // não deixa lixo no Transicionais; se nem o delete passar, só registra
  private async deleteCreatedEvent(eventId: number): Promise<void> {
    try {
      await this.deleteEvent(eventId);
    } catch (error) {
      console.error(`[TransicionaisRepo] could not delete event ${eventId}`, error);
    }
  }

  // por enquanto, apaga o encontro (as presenças ficam guardadas no Transicionais). Quando houver
  // o "encerrar" no Transicionais, troca só aqui (dúvida D13)
  async closeEvent(ref: IEventRef): Promise<void> {
    await this.deleteEvent((await this.findDetailsByRef(ref)).id);
  }

  private async deleteEvent(eventId: number): Promise<void> {
    this.assertWrite(
      await this.session.request<unknown>({
        method: "POST",
        url: TransicionaisUrlCollection.deleteEvents(),
        body: { ids: [eventId] },
      }),
      "deleteEvent",
    );
  }

  private async findCreatedRef(eventId: number, date: string): Promise<IEventRef> {
    const created = await this.findDetails(eventId);
    const pub = this.requirePublic(created);
    const day = created.configDays.find((item) => item.current.slice(0, 10) === date);

    if (!day || day.id === null) {
      throw new Error(`Transicionais event ${eventId} has no active day ${date}`);
    }

    // o link público do encontro é o id da descrição pública (dúvida D6)
    return { externalId: String(pub.id), dayId: String(day.id) };
  }

  private async applyEventUpdate(ref: IEventRef, data: IUpdateTransicionaisEventData): Promise<IEventRef> {
    const details = await this.findDetailsByRef(ref);
    const eventId = details.id;
    const days = await this.listDays(eventId);
    const day = days.find((item) => String(item.id) === ref.dayId);

    if (!day) {
      throw new NotFoundError("Current event day Not Found");
    }

    const newDate = data.date !== undefined && data.date !== day.current.slice(0, 10) ? data.date : null;
    const body: Record<string, unknown> = {};

    if (data.location !== undefined) {
      body.location = data.location;
    }

    // o intervalo do encontro passa a cobrir o dia novo (o antigo é desativado, nunca apagado)
    if (newDate) {
      body.startAt = [details.startAt.slice(0, 10), newDate].sort()[0];
      body.endAt = [details.endAt.slice(0, 10), newDate].sort()[1];
    }

    if (data.bookingOpen !== undefined) {
      body.public = this.buildPublicInput(this.requirePublic(details), details, data);
    }

    let version = details.version;

    if (Object.keys(body).length > 0) {
      version = await this.saveEvent(eventId, version, body);
    }

    const startTime = data.time ?? day.startTime;

    if (!newDate) {
      if (data.time !== undefined) {
        await this.saveDays(eventId, version, [{ ...day, startTime }]);
      }

      return ref;
    }

    const target = days.find((item) => item.current.slice(0, 10) === newDate)
      ?? (await this.listDays(eventId)).find((item) => item.current.slice(0, 10) === newDate);

    if (!target) {
      throw new Error(`Transicionais event ${eventId} has no day ${newDate}`);
    }

    await this.saveDays(eventId, version, [
      { ...target, isActive: true, startTime, endTime: day.endTime },
      { ...day, isActive: false },
    ]);

    // o id do dia novo nasce no salvamento
    const saved = (await this.listDays(eventId)).find(
      (item) => item.current.slice(0, 10) === newDate && item.isActive && item.id !== null,
    );

    if (!saved) {
      throw new Error(`Transicionais event ${eventId} did not save day ${newDate}`);
    }

    return { externalId: ref.externalId, dayId: String(saved.id) };
  }

  // public inteiro, copiado do atual, com a abertura pedida. As vagas dos grupos (pessoas por grupo)
  // vão como estão: o estoque é o capacity das assistências (E2.9)
  private buildPublicInput(
    pub: IRawEventPublic,
    details: IRawEventDetails,
    data: Pick<IUpdateTransicionaisEventData, "bookingOpen">,
  ): IRawEventPublicInput {
    const open = data.bookingOpen;

    return {
      visibility: pub.visibility,
      publicDescription: pub.publicDescription,
      releaseAt: open === true ? null : pub.releaseAt,
      membersEarlyAt: open === true ? null : pub.membersEarlyAt,
      guestDeadlineMinutes:
        open === undefined
          ? pub.guestDeadlineMinutes
          : open
            ? BOOKING_OPEN_DEADLINE_MINUTES
            : BOOKING_CLOSED_DEADLINE_MINUTES,
      supportTypeIds: pub.supports.map((support) => support.id), // todas, instrumentos e acessórios
      vacancies: {
        total: pub.vacancies.total?.total ?? null,
        groups: details.groups.map((group) => ({
          groupId: group.id,
          total: pub.vacancies.groups.find((item) => item.groupId === group.id)?.total ?? null,
        })),
      },
    };
  }

  // estoque da Produção (E2.9): GET do catálogo e PUT inteiro, só com o capacity trocado. Sem
  // groupIds, a assistência passaria a valer para a organização inteira
  async updateSupportCapacity(supportId: string, capacity: number): Promise<void> {
    const id = Number(supportId);

    if (!Number.isInteger(id) || id <= 0) {
      throw new InvalidParameterError("Field supportId is invalid");
    }

    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new InvalidParameterError("Field stockTotal is invalid");
    }

    const found = await this.session.request<IRawManagerSupportType>({
      url: TransicionaisUrlCollection.supportType(id),
    });

    if (found.status === 404) {
      throw new NotFoundError("Support Not Found");
    }

    const current = this.assertWrite(found, "findSupportType");
    const body: IRawSupportTypeUpdateInput = {
      title: current.title,
      description: current.description ?? null,
      isActive: current.isActive,
      capacity,
      groupIds: current.groupIds ?? [],
      rotativo: current.rotativo,
      requiredForActivity: current.requiredForActivity,
      ...(current.type === undefined ? {} : { type: current.type }),
    };

    const saved = await this.session.request<unknown>({
      method: "PUT",
      url: TransicionaisUrlCollection.supportType(id),
      body,
    });

    if (saved.status === 404) {
      throw new NotFoundError("Support Not Found");
    }

    // o corpo da resposta não importa (pode vir vazio)
    if (!saved.error && saved.status >= 200 && saved.status < 300) {
      return;
    }

    this.assertWrite(saved, "updateSupportType");
  }

  private requirePublic(details: IRawEventDetails): IRawEventPublic {
    if (!details.public) {
      throw new Error(`Transicionais event ${details.id} is not public`);
    }

    return details.public;
  }

  private async findDetails(eventId: number): Promise<IRawEventDetails> {
    return this.assertWrite(
      await this.session.request<IRawEventDetails>({ url: TransicionaisUrlCollection.eventById(eventId) }),
      "findEventDetails",
    );
  }

  private async listDays(eventId: number): Promise<IRawConfigDay[]> {
    return this.assertWrite(
      await this.session.request<IRawConfigDay[]>({ url: TransicionaisUrlCollection.eventDays(eventId) }),
      "listDays",
    );
  }

  private async saveEvent(eventId: number, version: number, body: Record<string, unknown>): Promise<number> {
    return this.assertWrite(
      await this.session.request<IRawVersioned>({
        method: "PUT",
        url: TransicionaisUrlCollection.eventById(eventId),
        body: { version, ...body },
      }),
      "updateEvent",
    ).version;
  }

  private async saveDays(eventId: number, version: number, days: IRawConfigDay[]): Promise<number> {
    return this.assertWrite(
      await this.session.request<IRawVersioned>({
        method: "PUT",
        url: TransicionaisUrlCollection.eventDays(eventId),
        body: { version, days },
      }),
      "saveDays",
    ).version;
  }

  // ações da Produção: fora do ar -> 503; key conhecida -> AppError; o resto -> Error (R8, R11)
  private assertWrite<T>(response: IClientResponse<T>, operation: string): T {
    if (isUnavailable(response.status)) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }

    const key = errorKey(response);

    if (key === "EVENT_VERSION_CONFLICT") {
      throw new VersionConflictError(`Transicionais ${operation} version conflict`);
    }

    const knownError = key ? TRANSICIONAIS_ERRORS[key] : undefined;

    if (knownError) {
      throw knownError();
    }

    if (response.error || response.data === undefined) {
      // a message do Transicionais diz o campo recusado (REQUEST_ERROR)
      const message = JSON.stringify((response.error?.details as IRawErrorBody | undefined)?.message ?? response.error?.message);

      throw new Error(`Transicionais ${operation} failed with ${response.status}: ${key} ${message}`);
    }

    return response.data;
  }
}
