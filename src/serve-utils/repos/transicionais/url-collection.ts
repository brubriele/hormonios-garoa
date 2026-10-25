export class TransicionaisUrlCollection {
  static readonly AUTH_PATH = "auth";
  static readonly COMMUNITY_PATH = "v2/community/organizations";
  static readonly EVENT_PATH = "v2/manager-events/details";
  static readonly SUPPORT_TYPE_PATH = "v2/manager-support-types";

  // lido na chamada, nao no import: env ausente quebra na hora certa (R2)
  // TRANSICIONAIS_URL já traz o prefixo /apps_nodejs
  private static get apiUrl(): string {
    const url = process.env.TRANSICIONAIS_URL;

    if (!url) {
      throw new Error("TRANSICIONAIS_URL is not set");
    }

    return url.replace(/\/+$/, "");
  }

  // customId da organização do Hormônios no Transicionais (rota pública)
  private static get orgId(): string {
    const orgId = process.env.TRANSICIONAIS_ORG_ID;

    if (!orgId) {
      throw new Error("TRANSICIONAIS_ORG_ID is not set");
    }

    return orgId;
  }

  static login(): string {
    return `${this.apiUrl}/${this.AUTH_PATH}/login`;
  }

  static refreshToken(): string {
    return `${this.apiUrl}/${this.AUTH_PATH}/refresh-token`;
  }

  static publicEvent(externalId: string, dayId: string): string {
    const query = dayId ? `?dayId=${encodeURIComponent(dayId)}` : "";

    return `${this.apiUrl}/${this.COMMUNITY_PATH}/${encodeURIComponent(this.orgId)}/events/${encodeURIComponent(externalId)}${query}`;
  }

  static events(): string {
    return `${this.apiUrl}/${this.EVENT_PATH}`;
  }

  // todos os encontros (Internos também) de startAt em diante: acha o recém-criado
  static eventsFrom(startAt: string): string {
    const query = new URLSearchParams({ startAt, orderBy: "startAt:asc" });

    return `${this.events()}?${query.toString()}`;
  }

  // encontros Públicos que terminam em startAt ou depois, do mais cedo ao mais tarde
  static publicEventsFrom(startAt: string): string {
    const query = new URLSearchParams({ visibility: "PUBLIC", startAt, orderBy: "startAt:asc" });

    return `${this.events()}?${query.toString()}`;
  }

  static eventCategory(id: number): string {
    return `${this.eventById(id)}/category`;
  }

  static deleteEvents(): string {
    return `${this.apiUrl}/${this.EVENT_PATH}/delete`;
  }

  static eventById(id: number): string {
    return `${this.apiUrl}/${this.EVENT_PATH}/${encodeURIComponent(id)}`;
  }

  static eventDays(id: number): string {
    return `${this.eventById(id)}/config-day`;
  }

  static eventGroups(id: number): string {
    return `${this.eventById(id)}/groups`;
  }

  // catálogo da assistência: capacity, groupIds e rotativo (E2.9)
  static supportType(id: number): string {
    return `${this.apiUrl}/${this.SUPPORT_TYPE_PATH}/${encodeURIComponent(id)}`;
  }
}
