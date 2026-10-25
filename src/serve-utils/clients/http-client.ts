import type { IClientResponse } from "../interfaces/client-response";

export enum HttpMethod {
  Get = "GET",
  Post = "POST",
  Put = "PUT",
  Delete = "DELETE",
}

export interface IHttpRequest {
  method?: HttpMethod; // padrão GET
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number; // padrão 3000 (C7)
}

const DEFAULT_TIMEOUT_MS = 3000;

export class HttpClient {
  async get<T>(url: string, headers?: Record<string, string>): Promise<IClientResponse<T>> {
    return this.request<T>({ url, headers });
  }

  async request<T>(input: IHttpRequest): Promise<IClientResponse<T>> {
    try {
      const response = await fetch(input.url, {
        method: input.method ?? HttpMethod.Get,
        headers: { "content-type": "application/json", ...input.headers },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      const text = await response.text();
      const json: unknown = text ? JSON.parse(text) : undefined; // 204 vem sem corpo

      if (!response.ok) {
        // details traz o corpo do erro ({ key, message } no Transicionais): o repo decide (C3)
        return { status: response.status, error: { message: response.statusText, details: json } };
      }

      return { status: response.status, data: json as T };
    } catch (error) {
      return {
        status: 0,
        error: { message: error instanceof Error ? error.message : "Request failed", details: error },
      };
    }
  }
}
