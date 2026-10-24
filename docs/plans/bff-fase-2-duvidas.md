# Dúvidas da implementação da fase 2

> Registradas durante as ondas de [`bff-fase-2-implementacao.md`](bff-fase-2-implementacao.md).
> Cada dúvida diz o que foi decidido para seguir. A Bea confirma ou troca depois.

| # | Onda | Dúvida | O que foi feito para seguir | Resposta da Bea |
|---|---|---|---|---|
| D1 | 1 | Como "abrir/fechar reservas" (`bookingOpen`) é gravado no Transicionais: `releaseAt`, prazo (`guestDeadlineMinutes`), `public: null` ou outro campo? | A onda 2 escolhe pelo contrato e registra aqui. | |
| D2 | 1 | "Encerrar ensaio": o que acontece com o encontro antigo no Transicionais (fica como está, desativa o dia?) e em que período e ciclo o novo é criado? | A onda 2 cria o novo no período ativo e no ciclo do atual, e não mexe no antigo. | |
| D3 | 1 | O contrato publicado ainda não tem a escrita como convidado pelo token de membro (setup, item 6), o pronome e os webhooks. | O código segue o setup e `bff-fase-2.md`. A onda 3 confere numa chamada real, se houver `.env.local`. | |
