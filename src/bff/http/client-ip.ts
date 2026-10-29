// primeiro IP do x-forwarded-for que a Vercel repassa (R4 de bff-fase-2.md)
export function clientIp(request: Request): string | null {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return first ? first : null;
}
