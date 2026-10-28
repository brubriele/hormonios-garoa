import { HttpClient, HttpMethod, type IHttpRequest } from "../../clients/http-client";
import { UpstreamResponseError } from "../../errors/infra-error";
import type { IClientResponse } from "../../interfaces/client-response";
import { isUnavailable } from "../../lib/upstream";
import { type ISessionTokens, LoginResponse } from "./responses/login.response";
import { TransicionaisUrlCollection } from "./url-collection";

// login que não chegou a uma resposta útil (rede, timeout, 429, 5xx): o repo trata como "fora do ar"
interface ISessionTokensResult {
  tokens: ISessionTokens;
}

interface ISessionFailureResult {
  failure: IClientResponse<never>;
}

type ISessionResult = ISessionTokensResult | ISessionFailureResult;

// token de membro do Transicionais (E2.6). Login, refresh e o reenvio depois de um 401 ficam aqui (R10)
export class TransicionaisSession {
  private tokens: ISessionTokens | null = null; // E2.6

  constructor(private readonly httpClient: HttpClient) {}

  // chamada autenticada: num 401 (ou num status de renewOn), renova (ou entra de novo) e tenta uma vez mais
  async request<T>(input: IHttpRequest, renewOn: readonly number[] = [401]): Promise<IClientResponse<T>> {
    const current = await this.currentTokens();

    if ("failure" in current) {
      return current.failure;
    }

    const first = await this.send<T>(input, current.tokens.access);

    if (!renewOn.includes(first.status)) {
      return first;
    }

    const renewed = await this.renew(current.tokens);

    if ("failure" in renewed) {
      return renewed.failure;
    }

    return this.send<T>(input, renewed.tokens.access);
  }

  private send<T>(input: IHttpRequest, access: string): Promise<IClientResponse<T>> {
    return this.httpClient.request<T>({ ...input, headers: { ...input.headers, authorization: `Bearer ${access}` } });
  }

  private async currentTokens(): Promise<ISessionResult> {
    if (this.tokens) {
      return { tokens: this.tokens };
    }

    return this.login();
  }

  // tenta o refresh; se falhar, login de novo
  private async renew(previous: ISessionTokens): Promise<ISessionResult> {
    const response = await this.httpClient.request<unknown>({
      method: HttpMethod.Post,
      url: TransicionaisUrlCollection.refreshToken(),
      headers: { authorization: `Bearer ${previous.refresh}` },
    });

    if (isUnavailable(response.status)) {
      return { failure: { status: response.status, error: response.error } };
    }

    if (response.error || response.data === undefined) {
      this.tokens = null;
      return this.login();
    }

    this.tokens = LoginResponse.toDomain(response.data, "refreshToken");

    return { tokens: this.tokens };
  }

  private async login(): Promise<ISessionResult> {
    const username = process.env.TRANSICIONAIS_USER;
    const password = process.env.TRANSICIONAIS_PASSWORD;

    if (!username || !password) {
      // check-ignore throw-error: env ausente é configuração (E7), não falha do Transicionais
      throw new Error("TRANSICIONAIS_USER or TRANSICIONAIS_PASSWORD is not set");
    }

    const response = await this.httpClient.request<unknown>({
      method: HttpMethod.Post,
      url: TransicionaisUrlCollection.login(),
      body: { username, password }, // uma organização só: entra direto nela
    });

    if (isUnavailable(response.status)) {
      return { failure: { status: response.status, error: response.error } };
    }

    // 400/404: credencial ou organização errada; é configuração, não queda
    if (response.error || response.data === undefined) {
      throw new UpstreamResponseError("login", response.status, response.error?.message);
    }

    this.tokens = LoginResponse.toDomain(response.data, "login");

    return { tokens: this.tokens };
  }
}
