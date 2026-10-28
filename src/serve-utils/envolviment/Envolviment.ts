import { FakeHttpClient } from "../clients/FakeHttpClient";
import { HttpClient } from "../clients/http-client";
import { SupabaseClient } from "../clients/supabase-client";
import type { IHormoniosRepository } from "../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import { isTransicionaisEnabled } from "../lib/upstream";
import { HormoniosRepository } from "../repos/supabase/HormoniosRepository";
import { TransicionaisRepo } from "../repos/transicionais/repo";
import { TransicionaisSession } from "../repos/transicionais/session";
import { CreatingOrUpdateUserUsecase } from "../usecases/booking/CreatingOrUpdateUserUsecase";
import { CreatingOrUpdatingAttendanceUsecase } from "../usecases/booking/CreatingOrUpdatingAttendanceUsecase";
import { FindingUserBookingUsecase } from "../usecases/booking/FindingUserBookingUsecase";
import { FindingUserUsecase } from "../usecases/booking/FindingUserUsecase";
import { CreatingInternalEventUsecase } from "../usecases/event/CreatingInternalEventUsecase";
import { FindingInternalEventUsecase } from "../usecases/event/FindingInternalEventUsecase";
import { FindingPublicEventUsecase } from "../usecases/event/FindingPublicEventUsecase";
import { UpdatingInternalEventUsecase } from "../usecases/event/UpdatingInternalEventUsecase";
import { JobUsecase } from "../usecases/job/JobUsecase";
import { WebhookUsecase } from "../usecases/sync/WebhookUsecase";

enum TransicionaisState {
  On = "on",
  Off = "off",
}

export class Envolviment {
  private static readonly usecases = new Map<string, unknown>();

  // EV8
  private static readonly transicionaisTokens = new Set<string>([
    CreatingOrUpdatingAttendanceUsecase.token,
    FindingInternalEventUsecase.token,
    CreatingInternalEventUsecase.token,
    JobUsecase.token,
    WebhookUsecase.token,
  ]);

  private static _httpClient?: HttpClient;
  private static _fakeHttpClient?: FakeHttpClient;
  private static _supabaseClient?: SupabaseClient;
  private static _transicionaisSession?: TransicionaisSession;
  private static _fakeTransicionaisSession?: TransicionaisSession;
  private static _hormoniosRepository?: IHormoniosRepository;
  private static _transicionaisRepo?: ITransicionaisRepo;
  private static _fakeTransicionaisRepo?: ITransicionaisRepo;

  // EV1, EV2, EV8
  static make<T>(token: string): T {
    const state = this.transicionaisState(token);
    const key = state ? `${token}:${state}` : token;
    const cached = this.usecases.get(key);

    if (cached) {
      return cached as T;
    }

    const usecase = this.build(token, state);

    this.usecases.set(key, usecase);

    return usecase as T;
  }

  // EV8
  private static transicionaisState(token: string): TransicionaisState | null {
    if (!this.transicionaisTokens.has(token)) {
      return null;
    }

    const enabled = isTransicionaisEnabled();

    return enabled ? TransicionaisState.On : TransicionaisState.Off;
  }

  // EV4, EV6
  private static build(token: string, state: TransicionaisState | null): unknown {
    switch (token) {
      case FindingPublicEventUsecase.token:
        return this.findingPublicEventUsecase();
      case FindingUserBookingUsecase.token:
        return this.findingUserBookingUsecase();
      case CreatingOrUpdatingAttendanceUsecase.token:
        return this.creatingOrUpdatingAttendanceUsecase(state);
      case FindingInternalEventUsecase.token:
        return this.findingInternalEventUsecase(state);
      case CreatingInternalEventUsecase.token:
        return this.creatingInternalEventUsecase(state);
      case UpdatingInternalEventUsecase.token:
        return this.updatingInternalEventUsecase();
      case JobUsecase.token:
        return this.jobUsecase(state);
      case WebhookUsecase.token:
        return this.webhookUsecase(state);
      default:
        throw new Error(`Envolviment has no usecase for token ${token}`);
    }
  }

  private static findingPublicEventUsecase(): FindingPublicEventUsecase {
    const hormoniosRepository = this.hormoniosRepository;

    return new FindingPublicEventUsecase(hormoniosRepository);
  }

  private static findingUserBookingUsecase(): FindingUserBookingUsecase {
    const hormoniosRepository = this.hormoniosRepository;

    return new FindingUserBookingUsecase(hormoniosRepository);
  }

  private static creatingOrUpdatingAttendanceUsecase(state: TransicionaisState | null): CreatingOrUpdatingAttendanceUsecase {
    const hormoniosRepository = this.hormoniosRepository;
    const transicionaisRepo = this.transicionaisRepo(state);
    const creatingOrUpdateUserUsecase = new CreatingOrUpdateUserUsecase(hormoniosRepository, transicionaisRepo);
    const findingUserUsecase = new FindingUserUsecase(hormoniosRepository);

    return new CreatingOrUpdatingAttendanceUsecase(
      hormoniosRepository,
      transicionaisRepo,
      creatingOrUpdateUserUsecase,
      findingUserUsecase,
    );
  }

  private static findingInternalEventUsecase(state: TransicionaisState | null): FindingInternalEventUsecase {
    const hormoniosRepository = this.hormoniosRepository;
    const transicionaisRepo = this.transicionaisRepo(state);

    return new FindingInternalEventUsecase(hormoniosRepository, transicionaisRepo);
  }

  private static creatingInternalEventUsecase(state: TransicionaisState | null): CreatingInternalEventUsecase {
    const hormoniosRepository = this.hormoniosRepository;
    const transicionaisRepo = this.transicionaisRepo(state);

    return new CreatingInternalEventUsecase(hormoniosRepository, transicionaisRepo);
  }

  private static updatingInternalEventUsecase(): UpdatingInternalEventUsecase {
    const hormoniosRepository = this.hormoniosRepository;

    return new UpdatingInternalEventUsecase(hormoniosRepository);
  }

  private static jobUsecase(state: TransicionaisState | null): JobUsecase {
    const transicionaisRepo = this.transicionaisRepo(state);
    const hormoniosRepository = this.hormoniosRepository;

    return new JobUsecase(transicionaisRepo, hormoniosRepository);
  }

  private static webhookUsecase(state: TransicionaisState | null): WebhookUsecase {
    const transicionaisRepo = this.transicionaisRepo(state);
    const hormoniosRepository = this.hormoniosRepository;

    return new WebhookUsecase(transicionaisRepo, hormoniosRepository);
  }

  // EV8
  private static transicionaisRepo(state: TransicionaisState | null): ITransicionaisRepo {
    if (state === TransicionaisState.Off) {
      return this.fakeTransicionaisRepo;
    }

    return this.onTransicionaisRepo;
  }

  // EV5
  private static get httpClient(): HttpClient {
    this._httpClient ??= new HttpClient();

    return this._httpClient;
  }

  private static get fakeHttpClient(): FakeHttpClient {
    this._fakeHttpClient ??= new FakeHttpClient();

    return this._fakeHttpClient;
  }

  private static get supabaseClient(): SupabaseClient {
    this._supabaseClient ??= new SupabaseClient();

    return this._supabaseClient;
  }

  private static get transicionaisSession(): TransicionaisSession {
    if (!this._transicionaisSession) {
      const httpClient = this.httpClient;

      this._transicionaisSession = new TransicionaisSession(httpClient);
    }

    return this._transicionaisSession;
  }

  private static get fakeTransicionaisSession(): TransicionaisSession {
    if (!this._fakeTransicionaisSession) {
      const fakeHttpClient = this.fakeHttpClient;

      this._fakeTransicionaisSession = new TransicionaisSession(fakeHttpClient);
    }

    return this._fakeTransicionaisSession;
  }

  private static get hormoniosRepository(): IHormoniosRepository {
    if (!this._hormoniosRepository) {
      const supabaseClient = this.supabaseClient;

      this._hormoniosRepository = new HormoniosRepository(supabaseClient);
    }

    return this._hormoniosRepository;
  }

  private static get onTransicionaisRepo(): ITransicionaisRepo {
    if (!this._transicionaisRepo) {
      const httpClient = this.httpClient;
      const transicionaisSession = this.transicionaisSession;

      this._transicionaisRepo = new TransicionaisRepo(httpClient, transicionaisSession);
    }

    return this._transicionaisRepo;
  }

  // K3
  private static get fakeTransicionaisRepo(): ITransicionaisRepo {
    if (!this._fakeTransicionaisRepo) {
      const fakeHttpClient = this.fakeHttpClient;
      const fakeTransicionaisSession = this.fakeTransicionaisSession;

      this._fakeTransicionaisRepo = new TransicionaisRepo(fakeHttpClient, fakeTransicionaisSession);
    }

    return this._fakeTransicionaisRepo;
  }
}
