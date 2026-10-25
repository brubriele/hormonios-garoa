// parâmetros do rpc gravar_whatsapp
export interface ISaveWhatsappParams {
  p_url: string;
}

export class SaveWhatsappRequest {
  static fromDomain(url: string): ISaveWhatsappParams {
    return { p_url: url };
  }
}
