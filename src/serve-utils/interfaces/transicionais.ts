import type { EventSnapshot } from "../models/event-snapshot";

// formatos crus da API do Transicionais; nunca saem do repo (nomes do contrato, pelo script da skill)

export type IRawTransicionaisId = number;

export interface IRawErrorBody {
  statusCode?: number;
  key?: string;
  message?: string;
}

// POST auth/login
export interface IRawLogin {
  token: string;
  refresh: string;
}

// POST auth/refresh-token
export interface IRawRefresh {
  token: string;
  refresh: string;
}

export interface IRawEventGroup {
  id: IRawTransicionaisId;
  name: string;
  createdAt?: string;
  externalGroupId?: IRawTransicionaisId; // só no GET público
}

// tipo da assistência: o instrumento emprestado ou um acessório dele (E2.9)
export type IRawSupportKind = "instrumento" | "acessorio";

// configDays[].summary.supports do GET público: a assistência com a capacidade e o ocupado do dia
export interface IRawDaySupport {
  id: IRawTransicionaisId;
  organizationId?: string;
  title: string;
  description: string | null;
  type?: IRawSupportKind | string;
  isActive: boolean;
  capacity: number | null; // null = sem limite
  rotativo: boolean; // a capacidade conta, mas não bloqueia
  requiredForActivity?: boolean;
  createdAt?: string;
  totalSupports?: number;
  occupied: number; // em uso no dia (D19)
  groupIds: IRawTransicionaisId[]; // vazio = vale para todos os grupos
  members?: number;
  guests?: number;
  confirmed?: number;
}

export interface IRawConfigDaySummary {
  supports?: IRawDaySupport[];
}

export interface IRawConfigDay {
  id: IRawTransicionaisId | null; // null = dia ainda não salvo ("disponível")
  isActive: boolean;
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  inMemory?: boolean;
  type?: string;
  weekOfYear?: number;
  dayOfWeek?: number;
  utcDayOfWeek?: number;
  current: string; // YYYY-MM-DD
  eventId?: IRawTransicionaisId;
  summary?: IRawConfigDaySummary; // só no GET público
}

export interface IRawSupportType {
  id: IRawTransicionaisId;
  title: string;
  description?: string | null;
  type?: IRawSupportKind | string;
  isActive?: boolean;
  externalSupportId?: IRawTransicionaisId;
}

// GET v2/manager-support-types/{id}: o catálogo da assistência (capacidade e grupos)
export interface IRawManagerSupportType {
  id: IRawTransicionaisId;
  organizationId?: string;
  title: string;
  description: string | null;
  type?: IRawSupportKind | string; // ainda fora do contrato local (D23)
  isActive: boolean;
  capacity: number | null;
  rotativo: boolean;
  requiredForActivity: boolean;
  groupIds: IRawTransicionaisId[];
  createdAt?: string;
  totalSupports?: number;
  occupied?: number;
}

// corpo do PUT v2/manager-support-types/{id} (SupportTypeUpdateRequest): sempre inteiro, porque
// groupIds omitido faria a assistência valer para a organização inteira
export interface IRawSupportTypeUpdateInput {
  title: string;
  description: string | null;
  isActive: boolean;
  capacity: number | null;
  groupIds: IRawTransicionaisId[];
  rotativo: boolean;
  requiredForActivity: boolean;
  type?: IRawSupportKind | string;
}

export interface IRawVacancy {
  total: number | null; // null = sem limite
  free: number | null;
}

export interface IRawGroupVacancy extends IRawVacancy {
  groupId: IRawTransicionaisId;
  externalGroupId?: IRawTransicionaisId;
}

export interface IRawAnswerWindow {
  open: boolean;
  closed: boolean;
  deadlineAt?: string | null;
  groupRequired?: boolean;
}

export interface IRawEventPublic {
  id: string | number;
  visibility: string;
  publicDescription: string | null;
  releaseAt: string | null;
  membersEarlyAt: string | null;
  guestDeadlineMinutes: number | null;
  supports: IRawSupportType[];
  vacancies: {
    configDayId?: IRawTransicionaisId | null;
    total: IRawVacancy | null;
    groups: IRawGroupVacancy[];
    withoutGroup?: IRawVacancy | null;
  };
  answerWindow?: IRawAnswerWindow;
}

// GET v2/community/organizations/{customId}/events/{externalId} e GET v2/manager-events/details/{id}
export interface IRawEventDetails {
  id: IRawTransicionaisId;
  name: string;
  location: string | null;
  startAt: string; // YYYY-MM-DD
  endAt: string; // YYYY-MM-DD
  categoryId: IRawTransicionaisId | null;
  calendarId: string | number | null;
  createdAt: string;
  version: number;
  groups: IRawEventGroup[];
  configDays: IRawConfigDay[];
  public: IRawEventPublic | null; // null = Interno
}

// GET v2/manager-events/details?visibility=PUBLIC (listagem paginada): o encontro atual é o primeiro
export interface IRawEventSummary {
  id: IRawTransicionaisId; // id interno (rotas de manager)
  name: string;
  location: string | null;
  startAt: string;
  endAt: string;
  visibility: string | null;
  categoryId: IRawTransicionaisId | null;
  externalId: string; // o da URL pública (= public.id)
  configDayId: IRawTransicionaisId; // o dia atual (= dayKey)
  groups: IRawEventGroup[]; // ids e nomes dos grupos esperados
}

export interface IRawPage<T> {
  content: T[];
  total: number;
  pages: number;
  hasMore: boolean;
}

// GET público do encontro (?dayId=): grupos, local, o dia (com o summary das assistências), as vagas,
// a janela, as assistências e a version (E2.9; contrato em docs/plans/transicionais/public-event-exemplo.json)
export type IRawPublicEvent = IRawEventDetails;

// corpo de `public` no PUT v2/manager-events/details/{id} (dúvida D4)
export interface IRawEventPublicInput {
  visibility: string;
  publicDescription: string | null;
  releaseAt: string | null;
  membersEarlyAt: string | null;
  guestDeadlineMinutes: number | null;
  supportTypeIds: IRawTransicionaisId[];
  vacancies: {
    total: number | null;
    groups: { groupId: IRawTransicionaisId; total: number | null }[];
  };
}

// resposta das escritas em v2/manager-events/details/*
export interface IRawVersioned {
  version: number;
}

// POST v2/manager-events/details: o contrato só diz `content`; o id pode vir nele ou não (D18)
export interface IRawCreatedEvent {
  content?: IRawTransicionaisId | { id?: IRawTransicionaisId } | null;
}

// encontro atual: o primeiro Público da listagem de manager (E2.7, revista)
export interface IEventRef {
  externalId: string;
  dayId: string; // = dayKey do Hormônios (String(configDayId))
}

// leitura do retrato tem plano de falha: fora do ar não lança (R11)
export type IFindCurrentEventResult =
  | { status: "FOUND"; snapshot: EventSnapshot }
  | { status: "NOT_FOUND" }
  | { status: "UNAVAILABLE" };

// parcial: só o que veio da Produção; o repo grava só o que difere do Transicionais
export interface IUpdateTransicionaisEventData {
  location?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  bookingOpen?: boolean;
}

export interface ITransicionaisRepo {
  // o encontro atual: o primeiro Público da listagem, de hoje em diante
  findCurrentEvent(): Promise<IFindCurrentEventResult>;
  // devolve o encontro depois da escrita (o dia muda quando a data muda)
  updateEvent(ref: IEventRef, data: IUpdateTransicionaisEventData): Promise<IEventRef>;
  // cria o próximo encontro copiando o atual e devolve a referência dele
  createNextEvent(ref: IEventRef): Promise<IEventRef>;
  // encerra o encontro antigo depois do "Encerrar ensaio" (hoje é o delete; dúvida D13)
  closeEvent(ref: IEventRef): Promise<void>;
  // estoque da assistência (E2.9): grava o capacity, mantendo o resto do catálogo dela
  updateSupportCapacity(supportId: string, capacity: number): Promise<void>;
}
