# Hormônios da Garoa — versão editorial / Netlify

Versão estática, mobile-first, pronta para publicar no Netlify.

## Stack
- HTML5
- CSS puro
- JavaScript puro
- localStorage
- sem build step

## Arquivos
- `index.html` — aplicação
- `flow.html` — mapa visual da experiência
- `styles.css` — identidade visual editorial
- `app.js` — regras de presença, reservas, estoque e Produção
- `netlify.toml` — configuração mínima de deploy

## Deploy no Netlify
1. Descompacte o ZIP.
2. No Netlify, escolha **Add new site → Deploy manually**.
3. Arraste a pasta do projeto (ou o conteúdo descompactado) para a área de deploy.
4. Não há comando de build.

## Observação
O projeto segue o ADR do protótipo: os dados ficam no `localStorage` e não são compartilhados entre celulares. A senha `garoa` é apenas a proteção de protótipo da área Produção.

O próximo passo de infraestrutura continua sendo Supabase/PostgreSQL, com reserva transacional no backend.
