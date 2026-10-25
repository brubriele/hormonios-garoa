import { HttpClient, type IHttpRequest } from "../../clients/http-client";
import type { IClientResponse } from "../../interfaces/client-response";
import type { IRawLogin, IRawRefresh } from "../../interfaces/transicionais";
import { TransicionaisUrlCollection } from "./url-collection";

interface ITokens {
  access: string;
  refresh: string;
}

// login que não chegou a uma resposta útil (rede, timeout, 429, 5xx): o repo trata como "fora do ar"
type ISessionResult = { tokens: ITokens } | { failure: IClientResponse<never> };

let tokens: ITokens | null = null; // memória da instância (E2.6)

function isUnavailable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

// token de membro do Transicionais (E2.6). Login, refresh e o reenvio depois de um 401 ficam aqui (R10)
export class TransicionaisSession {
  constructor(private readonly httpClient: HttpClient) {}

  // chamada autenticada: num 401, renova (ou entra de novo) e tenta uma vez mais
  async request<T>(input: IHttpRequest): Promise<IClientResponse<T>> {
    const current = await this.currentTokens();

    if ("failure" in current) {
      return current.failure;
    }

    const first = await this.send<T>(input, current.tokens.access);

    if (first.status !== 401) {
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
    if (tokens) {
      return { tokens };
    }

    return this.login();
  }

  // tenta o refresh; se falhar, login de novo
  private async renew(previous: ITokens): Promise<ISessionResult> {
    const response = await this.httpClient.request<IRawRefresh>({
      method: "POST",
      url: TransicionaisUrlCollection.refreshToken(),
      headers: { authorization: `Bearer ${previous.refresh}` },
    });

    if (isUnavailable(response.status)) {
      return { failure: { status: response.status, error: response.error } };
    }

    if (response.error || !response.data?.token) {
      tokens = null;
      return this.login();
    }

    tokens = { access: response.data.token, refresh: response.data.refresh };
    return { tokens };
  }

  private async login(): Promise<ISessionResult> {
    const username = process.env.TRANSICIONAIS_USER;
    const password = process.env.TRANSICIONAIS_PASSWORD;

    if (!username || !password) {
      throw new Error("TRANSICIONAIS_USER or TRANSICIONAIS_PASSWORD is not set");
    }

    const response = await this.httpClient.request<IRawLogin>({
      method: "POST",
      url: TransicionaisUrlCollection.login(),
      body: { username, password }, // uma organização só: entra direto nela
    });

    if (isUnavailable(response.status)) {
      return { failure: { status: response.status, error: response.error } };
    }

    // 400/404: credencial ou organização errada; é configuração, não queda
    if (response.error || !response.data?.token) {
      throw new Error(`Transicionais login failed with ${response.status}`);
    }

    tokens = { access: response.data.token, refresh: response.data.refresh };
    return { tokens };
  }
}
