# Noting

App pessoal de notas em Markdown, no estilo do Obsidian, para usar no
navegador do PC e no celular (PWA). Next.js (App Router) + Supabase.

## Configuração

1. Crie um projeto no [Supabase](https://supabase.com).
2. Aplique a migration `supabase/migrations/20261102000000_init.sql`:
   - pelo painel: **SQL Editor** → cole o conteúdo do arquivo → **Run**; ou
   - pela CLI: `supabase link --project-ref <ref>` e depois `supabase db push`.
3. Crie seu usuário em **Authentication → Users → Add user**, com e-mail e
   senha e a opção "Auto Confirm User" marcada. O app não tem tela de
   cadastro.
4. Recomendado: em **Authentication → Sign In / Providers → Email**,
   desligue "Allow new users to sign up" para ninguém mais criar conta.
5. Copie `.env.example` para `.env.local` e preencha com os valores de
   **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (a chave pública anon/publishable)

## Rodando

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Sem sessão, você é levado para `/login`.

## Modelo de dados

- `notes(id, user_id, path, title, body, created_at, updated_at)`
  - `path` = pasta (`''` na raiz, ex.: `Projetos/app-notas`)
  - `title` = nome da nota, único por pasta
  - `body` = Markdown puro (arquivo exportado: `path/title.md`)
- `links(from_id, to_id, user_id)`, reconstruída a partir dos `[[links]]`.

RLS garante que cada usuário só leia e altere os próprios dados.
