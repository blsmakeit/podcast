# Guia de Entrega — MAKEIT OR BREAKIT Podcast Platform

Checklist completo para implementar o projecto na conta do cliente.
Seguir por ordem. Não avançar para a fase seguinte sem completar a anterior.

---

## FASE 0 — Eles fazem (antes de tu começares)

O cliente precisa de criar contas e dar-te acesso. Envia-lhes a mensagem de onboarding e aguarda confirmação de cada item.

- [ ] **GitHub** — criar repo `podcast` na conta da MAKEIT e adicionar `blsmakeit` como colaborador
- [ ] **Netlify** — criar conta em https://app.netlify.com/ com sign-in via GitHub da MAKEIT → Members → upgrade plano → adicionar `blsmakeit`
- [ ] **Render** — criar conta em https://render.com/ com sign-in via GitHub da MAKEIT → Team → Members → upgrade plano → adicionar `blsmakeit`
- [ ] **Neon** — criar conta em https://console.neon.tech/ → criar projecto → adicionar `blsmakeit` como membro
- [ ] **Anthropic** — criar conta em https://console.anthropic.com/ → adicionar `blsmakeit` ou partilhar API key
- [ ] **Voyage AI** — criar organização em https://dashboard.voyageai.com/ → adicionar `blsmakeit` ou partilhar API key
- [ ] **Supadata** — criar conta em https://supadata.ai/ → partilhar API key
- [ ] **Resend** — criar conta em https://resend.com/ → partilhar API key

---

## FASE 1 — Preparar o código para o cliente

Alterações obrigatórias antes de fazer push para o repo deles.

### 1.1 Actualizar CORS — `server/index.ts`

```typescript
// linha ~28 — mudar de:
origin: ["https://media-navigator.netlify.app"]

// para o domínio Netlify do cliente (saber após deploy):
origin: ["https://SITE-DO-CLIENTE.netlify.app"]
```

> Se ainda não sabes o URL, podes temporariamente usar `"*"` e corrigir depois do primeiro deploy.

### 1.2 Actualizar email de contacto — `server/routes.ts`

```typescript
// linha ~379 — mudar de:
to: "contact@make-it.tech"

// para o email do cliente:
to: "EMAIL-DO-CLIENTE@empresa.com"
```

### 1.3 Substituir conhecimento da empresa — `server/knowledge/company.ts`

Este ficheiro define o que o chatbot sabe sobre a empresa. Substituir **todo o conteúdo** pela informação do cliente:
- Nome do programa / podcast
- Nome e bio do host
- Tópicos abordados
- Contactos e redes sociais
- Como ser convidado
- Funcionalidades da plataforma

### 1.4 Mudar a password do backoffice — `client/src/components/backoffice/BackofficeContext.jsx`

```javascript
// procurar 'MIcompany2020' e substituir pela password do cliente
```

### 1.5 Push para o repo do cliente

```bash
# Adicionar o remote do repo do cliente
git remote add client https://github.com/MAKEIT-ORG/podcast.git

# Push da main para o repo deles
git push client main
```

---

## FASE 2 — Configurar o Neon

Fazer tudo isto com o acesso ao Neon do cliente.

### 2.1 Ativar o pgvector

No **Neon SQL Editor**, executar:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2.2 Criar as tabelas

No terminal local, com o `DATABASE_URL` do Neon do cliente no `.env`:

```bash
# Substituir temporariamente o DATABASE_URL no .env pelo do cliente
npm run db:push
```

Cria as 6 tabelas: `podcasts`, `episode_chunks`, `translations`, `generated_content`, `site_settings`, `subscribers`.

### 2.3 Criar o índice de busca semântica

No **Neon SQL Editor**, executar:

```sql
CREATE INDEX ON episode_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);
```

> Este índice é obrigatório para o chatbot funcionar rapidamente.

---

## FASE 3 — Configurar o Render (backend)

### 3.1 Criar o Web Service

1. No Render do cliente → **New** → **Web Service**
2. Ligar ao repo GitHub da MAKEIT → seleccionar `podcast`
3. Configurar:

| Campo | Valor |
|-------|-------|
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm run start` |
| Node version | `20` |

### 3.2 Adicionar variáveis de ambiente

No Render → **Environment** → adicionar todas:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | Connection string do Neon do cliente |
| `ANTHROPIC_API_KEY` | API key da conta Anthropic do cliente |
| `VOYAGE_API_KEY` | API key da conta Voyage AI do cliente |
| `SUPADATA_API_KEY` | API key da conta Supadata do cliente |
| `RESEND_API_KEY` | API key da conta Resend do cliente |
| `GEMINI_API_KEY` | Opcional — só se quiserem usar Gemini |
| `NODE_ENV` | `production` |

### 3.3 Fazer deploy e copiar o URL

Após deploy bem-sucedido, copiar o URL do Render (ex: `https://podcast-xxx.onrender.com`).
**Guardar este URL — é necessário nos próximos passos.**

---

## FASE 4 — Configurar o Netlify (frontend)

### 4.1 Criar o site

1. No Netlify do cliente → **Add new site** → **Import from Git**
2. Ligar ao repo GitHub da MAKEIT → seleccionar `podcast`
3. Netlify detecta o `netlify.toml` automaticamente — não é necessário configurar o build

### 4.2 Adicionar variável de ambiente

No Netlify → **Site configuration → Environment variables**:

| Variável | Valor |
|----------|-------|
| `VITE_API_URL` | URL do Render da FASE 3 (ex: `https://podcast-xxx.onrender.com`) |

### 4.3 Fazer deploy

Clicar **Deploy site**. Copiar o URL final do Netlify.

### 4.4 Voltar ao Render e corrigir o CORS

Com o URL do Netlify agora conhecido, actualizar `server/index.ts`:

```typescript
origin: ["https://URL-REAL-DO-NETLIFY.netlify.app"]
```

Fazer push → Render faz redeploy automático.

---

## FASE 5 — Pós-deploy: seed e verificação

### 5.1 Fazer seed das traduções PT/EN

```bash
curl -X POST https://URL-DO-RENDER.onrender.com/api/translations/seed
```

Resposta esperada: `{ "success": true, "count": 80 }`

### 5.2 Configurar o Resend — domínio de envio

Na conta Resend do cliente:
1. Adicionar e verificar o domínio do email deles (ex: `empresa.com`)
2. Actualizar o `from` no `server/routes.ts` para usar o domínio verificado:

```typescript
from: "Nome do Podcast <noreply@empresa.com>"
```

### 5.3 Adicionar o primeiro episódio de teste

1. Abrir o site do cliente
2. Footer → 🔒 → entrar com a password do backoffice
3. **+ Add Episode** → testar o auto-extract com um vídeo YouTube
4. Verificar no Neon SQL Editor que os embeddings foram gerados:

```sql
SELECT COUNT(*) FROM episode_chunks;
-- deve retornar > 0
```

### 5.4 Verificar todas as funcionalidades

- [ ] PCB search funciona (pesquisa na home)
- [ ] Chatbot responde (widget bottom-right)
- [ ] Chatbot cita episódio adicionado
- [ ] Formulário de contacto envia email
- [ ] Switch PT/EN funciona
- [ ] Backoffice protegido pela nova password
- [ ] Auto-deploy funciona (fazer um commit de teste e verificar que Netlify e Render fazem redeploy)

---

## FASE 6 — Transferência final

Após tudo verificado e a funcionar:

- [ ] Remover o teu acesso ao Render (se necessário)
- [ ] Remover o teu acesso ao Netlify (se necessário)
- [ ] Remover o teu acesso ao Neon (se necessário)
- [ ] Entregar ao cliente a password do backoffice
- [ ] Entregar ao cliente o `USAGE.md` como guia de utilização
- [ ] Entregar ao cliente o `RAG_CHATBOT.md` como guia técnico

---

## Referência rápida — ficheiros a alterar

| Ficheiro | O que mudar |
|----------|-------------|
| `server/index.ts` | CORS origin → URL Netlify do cliente |
| `server/routes.ts` | Email `to:` → email do cliente |
| `server/knowledge/company.ts` | Todo o conteúdo → info da empresa do cliente |
| `client/src/components/backoffice/BackofficeContext.jsx` | Password admin |

## Referência rápida — variáveis de ambiente no Render

```
DATABASE_URL=postgresql://...neon.tech/...
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=pa-...
SUPADATA_API_KEY=...
RESEND_API_KEY=re_...
GEMINI_API_KEY=...  (opcional)
NODE_ENV=production
```

## Referência rápida — variável no Netlify

```
VITE_API_URL=https://xxx.onrender.com
```
