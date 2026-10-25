import type { ISaveVacanciesData } from "../../../interfaces/hormonios";

// jsonb do ocupado: groupId -> taken do instrumento, supportId -> taken do acessório
export interface ITakenParams {
  groups: Record<string, number>;
  supports: Record<string, number>;
}

// parâmetros do rpc gravar_vagas (a trava do vacanciesAt fica na função)
// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
export interface ISaveVacanciesParams {
  p_day_key: string;
  p_vacancies_at: string;
  p_taken: ITakenParams;
}

/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class SaveVacanciesRequest {
  static fromDomain(data: ISaveVacanciesData): ISaveVacanciesParams {
    return {
      p_day_key: data.dayKey,
      p_vacancies_at: data.vacanciesAt,
      p_taken: { groups: data.groups, supports: data.supports },
    };
  }
}
