// a fonte não chegou a responder: rede ou timeout (status 0), 429 ou 5xx. É "fora do ar", não recusa
export function isUnavailable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}
