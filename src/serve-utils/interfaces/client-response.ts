// resposta padrão de todo client (ver clients.md)
export interface IClientError {
  message: string;
  details?: unknown;
}

export interface IClientResponse<T> {
  status: number; // status HTTP; 0 quando não houve resposta
  data?: T;
  error?: IClientError;
}
