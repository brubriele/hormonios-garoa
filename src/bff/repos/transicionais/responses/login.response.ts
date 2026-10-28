import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

// resposta do POST auth/login e do POST auth/refresh-token (o mesmo formato)
const LoginSchema = z.object({
  token: z.string().min(1),
  refresh: z.string().min(1),
});

// o token de membro do BFF (E2.6): nunca sai da TransicionaisSession (R10)
export interface ISessionTokens {
  access: string;
  refresh: string;
}

export class LoginResponse {
  static toDomain(raw: unknown, operation: string): ISessionTokens {
    const login = parseResponse(LoginSchema, raw, InfraSource.Transicionais, operation);

    return { access: login.token, refresh: login.refresh };
  }
}
