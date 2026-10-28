import { HttpClient } from "../clients/http-client";
import { SupabaseClient } from "../clients/supabase-client";
import type { IHormoniosRepository } from "../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
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

export class Envolviment {
  private static readonly usecases = new Map<string, unknown>();

  private static _httpClient?: HttpClient;
  private static _supabaseClient?: SupabaseClient;
  private static _transicionaisSession?: TransicionaisSession;
  private static _hormoniosRepository?: IHormoniosRepository;
  private static _transicionaisRepo?: ITransicionaisRepo;

  // EV1, EV2
  static make<T>(token: string): T {
    const cached = this.usecases.get(token);

    if (cached) {
      return cached as T;
    }

    const usecase = this.build(token);

    this.usecases.set(token, usecase);

    return usecase as T;
  }

  // EV4, EV6
  private static build(token: string): unknown {
    switch (token) {
      case FindingPublicEventUsecase.token:
        return this.findingPublicEventUsecase();
      case FindingUserBookingUsecase.token:
        return this.findingUserBookingUsecase();
      case CreatingOrUpdatingAttendanceUsecase.token:
        return this.creatingOrUpdatingAttendanceUsecase();
      case FindingInternalEventUsecase.token:
        return this.findingInternalEventUsecase();
      case CreatingInternalEventUsecase.token:
        return this.creatingInternalEventUsecase();
      case UpdatingInternalEventUsecase.token:
        return this.updatingInternalEventUsecase();
      case JobUsecase.token:
        return this.jobUsecase();
      case WebhookUsecase.token:
        return this.webhookUsecase();
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

  private static creatingOrUpdatingAttendanceUsecase(): CreatingOrUpdatingAttendanceUsecase {
    const hormoniosRepository = this.hormoniosRepository;
    const transicionaisRepo = this.transicionaisRepo;
    const creatingOrUpdateUserUsecase = new CreatingOrUpdateUserUsecase(hormoniosRepository, transicionaisRepo);
    const findingUserUsecase = new FindingUserUsecase(hormoniosRepository);

    return new CreatingOrUpdatingAttendanceUsecase(
      hormoniosRepository,
      transicionaisRepo,
      creatingOrUpdateUserUsecase,
      findingUserUsecase,
    );
  }

  private static findingInternalEventUsecase(): FindingInternalEventUsecase {
    const hormoniosRepository = this.hormoniosRepository;
    const transicionaisRepo = this.transicionaisRepo;

    return new FindingInternalEventUsecase(hormoniosRepository, transicionaisRepo);
  }

  private static creatingInternalEventUsecase(): CreatingInternalEventUsecase {
    const hormoniosRepository = this.hormoniosRepository;
    const transicionaisRepo = this.transicionaisRepo;

    return new CreatingInternalEventUsecase(hormoniosRepository, transicionaisRepo);
  }

  private static updatingInternalEventUsecase(): UpdatingInternalEventUsecase {
    const hormoniosRepository = this.hormoniosRepository;

    return new UpdatingInternalEventUsecase(hormoniosRepository);
  }

  private static jobUsecase(): JobUsecase {
    const transicionaisRepo = this.transicionaisRepo;
    const hormoniosRepository = this.hormoniosRepository;

    return new JobUsecase(transicionaisRepo, hormoniosRepository);
  }

  private static webhookUsecase(): WebhookUsecase {
    const transicionaisRepo = this.transicionaisRepo;
    const hormoniosRepository = this.hormoniosRepository;

    return new WebhookUsecase(transicionaisRepo, hormoniosRepository);
  }

  // EV5
  private static get httpClient(): HttpClient {
    this._httpClient ??= new HttpClient();

    return this._httpClient;
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

  private static get hormoniosRepository(): IHormoniosRepository {
    if (!this._hormoniosRepository) {
      const supabaseClient = this.supabaseClient;

      this._hormoniosRepository = new HormoniosRepository(supabaseClient);
    }

    return this._hormoniosRepository;
  }

  private static get transicionaisRepo(): ITransicionaisRepo {
    if (!this._transicionaisRepo) {
      const httpClient = this.httpClient;
      const transicionaisSession = this.transicionaisSession;

      this._transicionaisRepo = new TransicionaisRepo(httpClient, transicionaisSession);
    }

    return this._transicionaisRepo;
  }
}
