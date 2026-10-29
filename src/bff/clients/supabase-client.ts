import { createClient, type SupabaseClient as Sdk } from "@supabase/supabase-js";
import type { IClientResponse } from "../interfaces/client-response";

interface ISdkResult<T> {
  data: T | null;
  error: { message: string } | null;
  status: number;
}

export class SupabaseClient {
  private sdk?: Sdk;

  // criado na primeira chamada: env ausente quebra na hora certa
  private get client(): Sdk {
    if (!this.sdk) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!url || !key) {
        throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
      }

      this.sdk = createClient(url, key, { auth: { persistSession: false } });
    }

    return this.sdk;
  }

  async query<T>(build: (sdk: Sdk) => PromiseLike<ISdkResult<T>>): Promise<IClientResponse<T>> {
    try {
      const { data, error, status } = await build(this.client);

      if (error) {
        return { status, error: { message: error.message, details: error } };
      }

      return { status, data: data ?? undefined };
    } catch (error) {
      return {
        status: 0,
        error: { message: error instanceof Error ? error.message : "Request failed", details: error },
      };
    }
  }
}
