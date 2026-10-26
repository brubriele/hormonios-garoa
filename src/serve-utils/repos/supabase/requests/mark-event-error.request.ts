import type { IMarkEventErrorData } from "../../../interfaces/hormonios";
import type { ITransicionaisErrorCause } from "../../../interfaces/transicionais";

// parâmetros do rpc marcar_erro_retrato (D50)
export interface IMarkEventErrorParams {
  p_manual_retry: boolean;
  p_error_cause: ITransicionaisErrorCause; // jsonb: o erro do Transicionais como veio
}

export class MarkEventErrorRequest {
  static fromDomain(data: IMarkEventErrorData): IMarkEventErrorParams {
    return { p_manual_retry: data.manualRetry, p_error_cause: data.errorCause };
  }
}
