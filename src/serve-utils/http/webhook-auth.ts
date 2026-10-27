import { UnauthorizedError } from "../errors/app-error";
import { digest } from "./cron-auth";

export async function requireWebhookKey(request: Request): Promise<void> {
  const key = process.env.WEBHOOK_API_KEY;

  if (!key) {
    throw new Error("WEBHOOK_API_KEY is not set");
  }

  const [expected, received] = await Promise.all([digest(key), digest(request.headers.get("api-key") ?? "")]);
  let diff = 0;
  expected.forEach((byte, index) => (diff |= byte ^ received[index]));

  if (diff !== 0) {
    throw new UnauthorizedError("Webhook api key required");
  }
}
