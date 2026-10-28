import type { IClientResponse } from "../interfaces/client-response";
import type { IHttpClient } from "../interfaces/IHttpClient";

const DISABLED_STATUS = 503;

// K4
export class FakeHttpClient implements IHttpClient {
  async get<T>(): Promise<IClientResponse<T>> {
    return this.request<T>();
  }

  async request<T>(): Promise<IClientResponse<T>> {
    return { status: DISABLED_STATUS, error: { message: "Transicionais disabled" } };
  }
}
