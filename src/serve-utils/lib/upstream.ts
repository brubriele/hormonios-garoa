// a fonte não chegou a responder: rede ou timeout (status 0), 429 ou 5xx. É "fora do ar", não recusa
export function isUnavailable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

// a fonte recusou o contrato (400, 409, 422): repetir igual não resolve, precisa de ajuste manual (D50)
export function isBadContract(status: number): boolean {
  return status === 400 || status === 409 || status === 422;
}
