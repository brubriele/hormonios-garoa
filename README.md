# Hormônios da Garoa — versão editorial / Netlify

Atualização visual e funcional do protótipo, mantendo o projeto no mesmo diretório e adicionando uma rotina Node + NPM + Vite para desenvolvimento local e deploy contínuo.

## O que mudou

- alternativa mobile para o efeito de display: o desktop preserva `clamp`, enquanto telas pequenas usam uma escala proporcional sem `clamp`;
- cabeçalho com botão Produção na mesma linguagem técnica/editorial, sem rounded pill;
- ícone principal redesenhado como doodle de bloco usando rosa, ciano, amarelo e roxo da identidade;
- Mapa de UI/UX transformado em um guia útil para a pessoa participante: **Como reservar seu instrumento**;
- novo **Acervo de Guias** em `guias.html`, com uma ficha para cada instrumento;
- suporte para links de vídeo do Google Drive por instrumento em `guides-data.js`;
- atalho `Guia ↗` dentro da lista de instrumentos;
- navegação mobile com acesso ao Acervo;
- estrutura pronta para Vite e deploy automático no Netlify.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra a URL mostrada pelo Vite, normalmente `http://localhost:5173/`.

Outros comandos:

```bash
npm run build
npm run preview
```

## Vídeos do Google Drive

Abra `guides-data.js` e substitua `videoUrl: ''` pelo link de cada vídeo.

Exemplo:

```js
videoUrl: 'https://drive.google.com/file/d/SEU_ID/view'
```

A página `guias.html?instrument=caixa` mostra o detalhe do instrumento e o botão para abrir o vídeo.

## Netlify + GitHub

O `netlify.toml` já está preparado para:

- Build: `npm run build`
- Publish: `dist`

Depois de conectar o repositório ao Netlify, cada push na branch de produção pode disparar o deploy automaticamente.

## Dados do protótipo

O projeto continua usando `localStorage`, portanto presença, reservas e estoque são locais ao navegador. A evolução para Supabase/PostgreSQL permanece como etapa posterior.
