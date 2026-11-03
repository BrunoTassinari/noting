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
   `BETTER_AUTH_URL` (ex.: `https://seu-app.vercel.app`). Opcional:
   `SIGNUP_CODE`, um código de convite que libera "Criar conta" na tela de
   login (sem ela, o cadastro fica desligado).
4. Aplique as migrations e crie o usuário no banco de produção, rodando
   localmente com o `DATABASE_URL` de produção:

   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate
   DATABASE_URL="postgresql://..." npm run create-user -- voce@exemplo.com "senha"
   ```

## Instalar como app (PWA)

Abra o endereço do app (precisa ser HTTPS, como na Vercel) e:

- **iPhone/iPad (Safari):** Compartilhar → **Adicionar à Tela de Início**.
- **Android (Chrome):** menu ⋮ → **Instalar app** (ou o aviso que aparece embaixo).
- **PC (Chrome/Edge):** ícone de instalar na barra de endereço.

O service worker (`public/sw.js`) não guarda notas em cache: elas sempre
vêm do servidor. Sem internet, aparece a página `offline.html`. Ele só é
registrado no build de produção (`npm run build && npm start`).

## Importar seu vault (.md)

Copia as notas de uma pasta de arquivos Markdown (ex.: um vault do
Obsidian) para o app. **Os arquivos originais não são alterados.**

```bash
# 1) Veja o que seria importado, sem gravar nada
DATABASE_URL="postgresql://..." npm run import-vault -- "/caminho/do/vault" --email voce@exemplo.com --dry-run

# 2) Importe de verdade
DATABASE_URL="postgresql://..." npm run import-vault -- "/caminho/do/vault" --email voce@exemplo.com
```

- `Pasta/Sub/Nota.md` vira a nota "Nota" na pasta `Pasta/Sub`.
- Pastas ocultas (`.obsidian`, `.trash`, `.git`) e arquivos que não são
  `.md` (imagens, PDFs) são ignorados e listados no resumo.
- O conteúdo fica igual (frontmatter incluído); só as quebras de linha do
  Windows viram `\n`. A data de modificação do arquivo vira a data da nota.
- Se já existir uma nota com o mesmo nome na mesma pasta, ela é pulada.
  Use `--overwrite` para substituir o conteúdo pelo do arquivo.
- No fim, os links e backlinks são reconstruídos. Pode rodar quantas vezes
  quiser.

## Exportar e backup automático

O caminho inverso do importador: gera uma pasta de `.md` (abre no Obsidian).

```bash
DATABASE_URL="postgresql://..." npm run export-vault -- "/caminho/destino" --email voce@exemplo.com
```

- A nota "Nota" na pasta `Pasta/Sub` vira `Pasta/Sub/Nota.md`, com o
  conteúdo exato e a data de modificação da nota.
- `--mirror` deixa a pasta igual ao app: apaga os `.md` de notas que não
  existem mais. Pastas ocultas (`.git`, `.obsidian`) nunca são tocadas.

### Backup diário no GitHub

A action `.github/workflows/backup.yml` roda todo dia às 03:17 (Brasília),
exporta tudo e faz commit num repositório privado separado. O histórico do
Git desse repositório é o histórico de versões das notas.

1. Crie um repositório **privado** vazio (ex.: `noting-backup`), marcando
   "Add a README" para ele já ter um commit.
2. Crie um token *fine-grained* em GitHub → Settings → Developer settings →
   Personal access tokens, com acesso **só** a esse repositório e permissão
   *Contents: Read and write*.
3. Neste repositório (o do app), em Settings → Secrets and variables →
   Actions:
   - Secrets: `DATABASE_URL` (o mesmo da Vercel) e `BACKUP_REPO_TOKEN`
     (o token do passo 2).
   - Variables: `BACKUP_REPO` = `seu-usuario/noting-backup`. Opcional:
     `BACKUP_EMAIL`, se houver mais de um usuário no app.
4. Em Actions → "Backup das notas" → *Run workflow* para testar na hora.

## Comandos úteis

| Comando | Para quê |
|---|---|
| `npm run db:migrate` | Aplica as migrations pendentes (rode depois de atualizar o app) |
| `npm run create-user -- email "senha" "Nome"` | Cria usuário ou redefine a senha |
| `npm run reindex-links` | Reconstrói a tabela de links/backlinks a partir dos `[[links]]` |
| `npm run import-vault -- <pasta> --email <e-mail>` | Importa uma pasta de `.md` (veja acima) |
| `npm run export-vault -- <pasta> [--mirror]` | Exporta as notas para `.md` (veja acima) |

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
