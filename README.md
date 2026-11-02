# Noting

App pessoal de notas em Markdown, no estilo do Obsidian, para usar no
navegador do PC e no celular (PWA).

- **App e backend:** Next.js (App Router). As rotas de servidor e as Server
  Actions são o backend; não há servidor separado.
- **Banco:** Postgres (Neon no plano free), acessado com Drizzle ORM.
- **Login:** Better Auth (e-mail e senha), com sessões guardadas no Postgres.
- **Hospedagem:** Vercel (plano Hobby).

## Rodando localmente

1. Crie um banco Postgres. O jeito mais fácil é um projeto gratuito no
   [Neon](https://neon.tech): Dashboard → **Connect** → copie a connection
   string *pooled*. Um Postgres local também funciona.
2. Copie `.env.example` para `.env.local` e preencha:
   - `DATABASE_URL`: a connection string do passo 1
   - `BETTER_AUTH_SECRET`: gere com `openssl rand -base64 32`
   - `BETTER_AUTH_URL`: `http://localhost:3000`
3. Instale, aplique as migrations e crie seu usuário (não existe cadastro
   público no app):

   ```bash
   npm install
   npm run db:migrate
   npm run create-user -- voce@exemplo.com "uma senha forte" "Seu nome"
   ```

   Rodar `create-user` de novo com o mesmo e-mail redefine a senha.
4. `npm run dev` e abra http://localhost:3000.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Banco: use o mesmo Neon do passo anterior ou crie um pela Vercel
   (**Storage → Neon**), que preenche `DATABASE_URL` sozinha.
3. Em **Settings → Environment Variables**, defina `DATABASE_URL`,
   `BETTER_AUTH_SECRET` (gere um novo, diferente do local) e
   `BETTER_AUTH_URL` (ex.: `https://seu-app.vercel.app`).
4. Aplique as migrations e crie o usuário no banco de produção, rodando
   localmente com o `DATABASE_URL` de produção:

   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate
   DATABASE_URL="postgresql://..." npm run create-user -- voce@exemplo.com "senha"
   ```

## Comandos úteis

| Comando | Para quê |
|---|---|
| `npm run db:migrate` | Aplica as migrations pendentes (rode depois de atualizar o app) |
| `npm run create-user -- email "senha" "Nome"` | Cria usuário ou redefine a senha |
| `npm run reindex-links` | Reconstrói a tabela de links/backlinks a partir dos `[[links]]` |

Para rodar contra o banco de produção, prefixe com `DATABASE_URL="postgresql://..."`.

## Banco de dados

O schema fica em `src/db/schema.ts` e as migrations SQL em `drizzle/`.
Depois de mudar o schema, rode `npm run db:generate` e depois
`npm run db:migrate`.

- `notes(id, user_id, path, title, body, created_at, updated_at)`
  - `path` = pasta (`''` na raiz, ex.: `Projetos/app-notas`)
  - `title` = nome da nota, único por pasta
  - `body` = Markdown puro (arquivo exportado: `path/title.md`)
- `links(from_id, to_id, user_id)`: reconstruída a partir dos `[[links]]`.
- `notes.search_text`: título + corpo sem acentos (coluna gerada), usada
  pela busca Ctrl/Cmd+K. Requer as extensões `unaccent` e `pg_trgm`
  (criadas pela migration; o Neon suporta as duas).
- `user`, `session`, `account`, `verification`: tabelas do Better Auth.

Quem garante o isolamento entre usuários é o servidor: toda consulta filtra
pelo `user_id` da sessão, e o navegador nunca acessa o banco direto.
