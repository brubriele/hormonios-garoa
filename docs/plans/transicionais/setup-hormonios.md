# Setup "hormonios" no Transicionais (prompt)

> Registrado em 2026-10-24. Prompt para rodar no repo do Transicionais (bf-back). O dev do
> Transicionais é resetado sempre, e o estado volta pelos setups. Este setup deixa a organização do
> Hormônios pronta para o bff-hormonios da fase 2 ([`../bff-fase-2.md`](../bff-fase-2.md)).
>
> Os nomes e os limites abaixo são os que a tela do Hormônios já mostra. O BFF liga os dois lados
> **pelo nome** (grupos) e **pelo título** (assistências). Se um nome mudar aqui, muda também o
> de-para do BFF.

Cole junto a seção "Webhooks" de [`../bff-fase-2.md`](../bff-fase-2.md).

```
Crie o setup "hormonios" no bf-back, no mesmo padrão dos outros setups de dev. O dev é resetado
sempre, e o estado volta pelos setups, então este precisa ser idempotente: rodar de novo dá o
mesmo resultado, sem duplicar. Ele prepara a organização que o bff-hormonios (cliente externo)
usa pela API. Para o Hormônios, a complexidade do Transicionais é transparente: os nomes, a ordem
e os limites abaixo são os que a tela do Hormônios já mostra, e o BFF liga os dois pelo NOME.

1. Organização
   - "Hormônios da Garoa", customId fixo `hormonios-da-garoa`.
   - Período ativo que cubra pelo menos os próximos 6 meses a partir da data do setup.
   - Ciclo (categoria) "Ensaio".

2. Usuário do BFF
   - Login fixo `hormonios-bff`, papel ADMIN só nessa organização, com a senha padrão dos usuários
     de dev. Ponha na tabela de transicionais-dev-users.md.
   - É o TRANSICIONAIS_USER do BFF. O BFF entra por auth/login e renova pelo refresh.

3. Grupos (naipes): nomes exatos, criados nesta ordem (a tela mostra nesta ordem)
   | Nome             | Vagas |
   |------------------|-------|
   | Caixa            | 6     |
   | Tamborim         | 6     |
   | Surdo de 1ª      | 2     |
   | Surdo de 2ª      | 2     |
   | Surdo de 3ª      | 2     |
   | Agogô            | 4     |
   | Repinique        | 3     |
   | Timbal           | 2     |
   | Alfaia           | 2     |
   | Ganzá (Chocalho) | 5     |

4. Assistências (catálogo da organização): títulos exatos, ativas e sem limite de capacidade
   - "Talabarte"
   - "Baqueta / maçaneta"
   Qualquer grupo pode pedir qualquer uma das duas, e uma reserva pode pedir as duas, nenhuma ou só
   uma.

5. Encontro atual
   - Encontro Público "Ensaio", ciclo "Ensaio", local "A definir".
   - Um dia ativo, na próxima quarta-feira a partir da data do setup, das 19:30 às 22:00. Assim o
     reset nunca deixa o dia no passado.
   - Os 10 grupos esperados, com os limites da tabela como limite de vagas de cada grupo.
   - As 2 assistências oferecidas.
   - Presença SEM instrumento é permitida e SEM limite: escolher grupo é opcional
     (`answerWindow.groupRequired = false`), e quem escolhe "Não se aplica" não tem teto. Se o
     modelo exigir um total, use um total que não limite na prática e documente.
   - Respostas de convidado abertas desde já (lançamento no passado, prazo no dia).
   - `externalId` FIXO entre resets, se der (ex.: `hormonios-ensaio-atual`). Se não der, imprima no
     fim do setup: `CURRENT_EVENT={"customId":"hormonios-da-garoa","externalId":"…","dayId":…}`.
     Esse é o valor que vai para o .env.local do Hormônios.

6. Escrita como convidado com o token do ADMIN (substitui o token SERVICE por enquanto)
   - `POST v2/community/validations/change` aceita o token de membro ADMIN/MANAGER da organização
     para responder EM NOME de um convidado, com `person: { email, name, pronoun }` e
     `idempotencyKey` no corpo, além de `type: ATTENDANCE`, `configDayId`, `status`
     (ATTENDING/DECLINED), `groupId` (opcional = "Não se aplica") e `supportTypeIds`.
   - Acha o convidado pelo e-mail na organização ou cria um: origem "cliente hormonios", e-mail
     pendente, termos e privacidade `NONE`. São exceções à GST-01 e à GST-02: registre em
     docs/app-busines.md antes do código.
   - Um e-mail que já é de membro da organização responde como membro (vale a escala).
   - Mesmas regras e keys da resposta do convidado (VAL-10 a VAL-16, VAL-19, um ingresso por pessoa
     e dia). A mesma `idempotencyKey` com o mesmo corpo devolve a mesma resposta, sem passo novo.
   - Devolve `guestId`, `orderId`, `answer`, `changedAt` e as vagas do dia (`dayVacancies`).
   - Com esse token, aceite o `X-Forwarded-For` que o BFF manda (IP real).
   - e2e: cria convidado e ingresso; reenvio não duplica; grupo cheio dá 409; token de USER ou de
     outra organização dá 403/404.

7. Pronome (T2.6): coluna `pronoun` em v2_profiles e v2_profile_guest, gravada no item 6 e
   mostrada na lista de convidados e na conferência do QR.

8. Webhooks (T2.1–T2.3), assinante por env (URL, `aud` e chave de assinatura). No dev, a URL é
   http://localhost:5173/api/webhooks/transicionais. Eventos `event.updated` e
   `validation.changed`, no formato da seção "Webhooks" de bff-hormonios/docs/plans/bff-fase-2.md
   (colo abaixo). Imprima a chave para ir no TRANSICIONAIS_JWT_KEY do Hormônios.

9. No fim: `yarn openapi:export` e me mande o JSON novo (vira docs/transicionais-api.json no
   Hormônios).
```
