# Hormônios da Garoa

Interface web do sistema de apoio aos ensaios do Bloquinho Hormônios da Garoa.

O projeto é o **frontend oficial** está em evolução para deixar de depender de `localStorage` e passar a consumir o backend do Bloco Manager.

## Links do projeto

- **GitHub:** [hormonios-garoa](https://github.com/brubriele/hormonios-garoa)
- **Vercel — produção:** [https://hormonios-garoa.vercel.app/](https://hormonios-garoa.vercel.app/)
- **GitHub Projects — Desenvolvimento:** https://github.com/users/brubriele/projects/6

> As URLs de GitHub e Vercel acima devem ser preenchidas com os endereços oficiais do repositório e do projeto Vercel.

---

## Visão geral

O Hormônios da Garoa é uma aplicação mobile-first para apoiar a organização dos ensaios, com foco em:

- confirmação de presença;
- escolha e reserva de instrumentos;
- visualização da disponibilidade;
- área de Produção;
- acervo de guias de estudo por instrumento;
- vídeos de apoio hospedados no Google Drive;
- controle futuro de abertura/fechamento das reservas;
- integração com o backend do Bloco Manager.

A interface mantém uma linguagem editorial própria, inspirada na identidade visual do Bloquinho, com uso de rosa, ciano, amarelo, roxo, creme e preto.

---

# Arquitetura do Frontend

## Stack atual

- HTML
- CSS
- JavaScript
- Vite
- Node.js / NPM
- Vercel

O frontend atualmente é uma aplicação multipágina sem framework de UI.

O Vite é utilizado principalmente como ferramenta de desenvolvimento e build.

### Entradas do Vite

O arquivo `vite.config.js` define três entradas:

```text
index.html   → aplicação principal
flow.html    → mapa/fluxo de UX
guias.html   → acervo de guias
```

O build gera a versão estática para publicação.

## Estrutura principal

```text
hormonios-garoa/
│
├── index.html
├── app.js
├── styles.css
│
├── guias.html
├── guias.js
├── guides-data.js
│
├── flow.html
│
├── vite.config.js
├── package.json
├── package-lock.json
├── vercel.json
│
├── bundle-atual.txt
└── README.md
```

### Responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Interface principal |
| `app.js` | Estado e interações da aplicação |
| `styles.css` | Identidade visual, layout e responsividade |
| `guias.html` | Acervo de guias |
| `guias.js` | Interações da página de guias |
| `guides-data.js` | Conteúdo e links dos guias |
| `flow.html` | Fluxo de funcionamento/UX |
| `vite.config.js` | Configuração do build multipágina |
| `vercel.json` | Configuração mínima do deploy |

---

# Estado atual da arquitetura

Neste momento, o frontend ainda utiliza `localStorage` para dados do protótipo.

Isso inclui, principalmente:

- presença;
- reservas;
- estoque;
- identidade local do participante.

Portanto, os dados ainda são locais ao navegador e **não são compartilhados entre dispositivos**.

Essa camada será substituída progressivamente pela API do Bloco Manager.

## Arquitetura alvo

```text
┌───────────────────────────────┐
│       Hormônios da Garoa      │
│          Frontend             │
│                               │
│ HTML · CSS · JavaScript · Vite│
└───────────────┬───────────────┘
                │ HTTPS / API
                ▼
┌───────────────────────────────┐
│       Bloco Manager API       │
│                               │
│ NestJS · TypeScript · JWT     │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│            MariaDB            │
└───────────────────────────────┘
```

O frontend não terá acesso direto ao banco de dados.

---

# Desenvolvimento local

Instalar dependências:

```bash
npm install
```

Executar:

```bash
npm run dev
```

Normalmente o Vite estará disponível em:

```text
http://localhost:5173/
```

Build:

```bash
npm run build
```

Preview do build:

```bash
npm run preview
```

---

# Deploy

## Vercel

O Vercel é o ambiente oficial de publicação do frontend.

O fluxo de desenvolvimento é:

```text
VS Code
   │
   │ git commit
   ▼
GitHub
   │
   │ push
   ▼
Vercel
   │
   ├── Preview
   │
   └── Production
```

Cada alteração enviada ao repositório conectado ao Vercel pode gerar um novo deployment.

O arquivo `vercel.json` atualmente mantém uma configuração simples de URLs limpas:

```json
{
  "cleanUrls": true
}
```

### Regra de deploy

Não fazemos upload manual dos arquivos para o Vercel.

O fluxo esperado é:

```bash
git add .
git commit -m "tipo: descrição"
git push
```

O Vercel recebe o novo commit e executa o deploy automaticamente.

## Netlify

O projeto possui atualmente um `netlify.toml` legado.

**Netlify não é mais o ambiente oficial de deploy do frontend.**

O arquivo pode permanecer temporariamente para referência/histórico, mas novas configurações de deploy devem considerar o Vercel como ambiente oficial.

---

# Fluxo de branches

A branch principal é:

```text
main
```

Novas funcionalidades devem ser desenvolvidas em branches específicas:

```text
feature/nome-da-feature
```

Correções:

```text
fix/nome-do-problema
```

Exemplo:

```bash
git switch main
git pull origin main

git switch -c feature/api-integration
```

Depois:

```bash
git add .
git commit -m "feat: add API integration layer"
git push -u origin feature/api-integration
```

A entrada em `main` deve ocorrer por Pull Request quando houver revisão do time.

---

# GitHub Projects

O planejamento oficial do desenvolvimento está no GitHub Projects:

**Hormônios da Garoa — Desenvolvimento**

https://github.com/users/brubriele/projects/6

O Project será a fonte de acompanhamento do roadmap e deve organizar as Issues e Pull Requests do projeto.

Fluxo sugerido:

```text
Backlog
   ↓
A fazer
   ↓
Em desenvolvimento
   ↓
Em revisão
   ↓
Em teste
   ↓
Concluído
```

Cada funcionalidade relevante deve preferencialmente ter uma Issue associada e ser vinculada ao Project.

---

# Roadmap

## 0. Fundação do frontend — concluído

- [x] Identidade visual do Bloquinho
- [x] Layout mobile-first
- [x] Fluxo de presença
- [x] Fluxo de escolha de instrumento
- [x] Acervo de guias
- [x] Vídeos de estudo via Google Drive
- [x] Área de Produção inicial
- [x] Projeto organizado com Vite
- [x] GitHub como repositório oficial
- [x] Vercel como deploy oficial
- [x] GitHub Project para gestão do desenvolvimento

---

## 1. Integração com o backend — próxima fase

**Objetivo:** criar a fundação para o frontend conversar com o Bloco Manager.

- [ ] Mapear endpoints existentes
- [ ] Definir URL/configuração da API
- [ ] Criar cliente HTTP do frontend
- [ ] Definir tratamento de erros
- [ ] Definir estados de loading/erro
- [ ] Testar primeira chamada real à API

**Branch inicial:**

```text
feature/api-integration
```

---

## 2. Ensaios e calendário

**Objetivo:** substituir dados locais por dados reais do backend.

- [ ] Buscar ensaio atual
- [ ] Buscar próximo ensaio
- [ ] Buscar data/horário/local
- [ ] Criar estado de ensaio no frontend
- [ ] Preservar histórico de ensaios
- [ ] Remover dependência local para dados de ensaio

---

## 3. Presença

- [ ] Integrar confirmação de presença
- [ ] Integrar cancelamento
- [ ] Persistir presença no backend
- [ ] Refletir estado atual no frontend
- [ ] Validar comportamento entre dispositivos

---

## 4. Instrumentos

- [ ] Mapear modelo de instrumentos
- [ ] Criar cadastro/estoque de instrumentos no backend
- [ ] Buscar disponibilidade pela API
- [ ] Exibir disponibilidade no frontend
- [ ] Integrar escolha de instrumento

---

## 5. Reservas

- [ ] Criar domínio de reservas no backend
- [ ] Criar endpoint de reserva
- [ ] Criar endpoint de cancelamento
- [ ] Criar consulta de minhas reservas
- [ ] Garantir concorrência/transação no backend
- [ ] Integrar reserva no frontend
- [ ] Testar cenário de último instrumento disponível

---

## 6. Controle de disponibilidade pela Produção

**Objetivo:** permitir que Produção controle quando a reserva está aberta.

### Reservas fechadas

Mostrar uma experiência informativa:

> Logo mais a gente libera a reserva por aqui!  
> Fique ligade nos informes do grupo HG · Ensaios no WhatsApp. Enquanto isso, você pode conferir as guias de estudo para se aquecer!

### Reservas abertas

Liberar:

- confirmação de presença;
- escolha de instrumento;
- reserva;
- visualização da disponibilidade.

Tasks:

- [ ] Criar `booking_status` no backend
- [ ] Endpoint para abrir reservas
- [ ] Endpoint para fechar reservas
- [ ] Interface de controle na Produção
- [ ] Atualização da experiência pública
- [ ] Testar sincronização entre dispositivos

---

## 7. Autenticação

A autenticação será implementada inicialmente para a área de Produção.

- [ ] Integrar login existente do backend
- [ ] Access token
- [ ] Refresh token
- [ ] Controle de sessão
- [ ] Proteção da área Produção
- [ ] Validação de roles
- [ ] Avaliar OAuth Google
- [ ] Avaliar autenticação de participantes em uma segunda fase

---

## 8. Produção

- [ ] Próximo ensaio
- [ ] Criar/encerrar ensaio
- [ ] Abrir/fechar reservas
- [ ] Gerenciar estoque
- [ ] Visualizar presenças
- [ ] Visualizar reservas
- [ ] Gerenciar instrumentos
- [ ] Controle de acesso por role

---

## 9. Hardening e operação

- [ ] Tratamento consistente de erros
- [ ] Estados offline/rede
- [ ] Feedback de operações
- [ ] Testes de concorrência
- [ ] Testes mobile
- [ ] Testes de acessibilidade
- [ ] Revisão de segurança
- [ ] Documentação de operação
- [ ] Revisão do fluxo de deploy

---

# Princípios de desenvolvimento

### 1. Mobile-first

A experiência principal é pensada primeiro para celular.

### 2. Backend como fonte de verdade

Depois da integração, presença, ensaio, estoque e reservas não devem depender de `localStorage` como fonte definitiva.

### 3. Regra de negócio no backend

Especialmente para reservas:

```text
Frontend
   ↓
solicita reserva
   ↓
Backend valida disponibilidade
   ↓
transação
   ↓
reserva confirmada
```

Nunca confiar somente em uma verificação feita no navegador.

### 4. Evolução incremental

Não migrar toda a aplicação de uma vez.

Cada módulo deve ser integrado e testado separadamente.

### 5. Identidade visual consistente

Novas funcionalidades devem utilizar as cores e a linguagem visual já estabelecidas para o Bloquinho, evitando componentes genéricos que pareçam pertencer a outro produto.

---

# Documentação relacionada

- GitHub Project: https://github.com/users/brubriele/projects/6
- Backend: Bloco Manager
- ADR / documentação de produto e arquitetura: mantidos junto aos materiais do projeto

---

## Status atual

**Frontend:** em desenvolvimento ativo  
**Deploy:** Vercel  
**Backend:** integração em planejamento  
**Persistência atual:** `localStorage`  
**Próxima feature:** camada de integração com a API do Bloco Manager
