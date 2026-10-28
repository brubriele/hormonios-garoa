// o encontro atual é o de hoje em diante no fuso de São Paulo (E2.7)
export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

// hoje (YYYY-MM-DD) no fuso pedido
export function today(timeZone: string = SAO_PAULO_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

// YYYY-MM-DD + dias, sem fuso (só a data)
export function addDays(date: string, days: number): string {
  const next = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);

  return next.toISOString().slice(0, 10);
}
