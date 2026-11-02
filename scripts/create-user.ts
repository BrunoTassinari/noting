/**
 * Cria (ou redefine a senha de) um usuário. O app não tem cadastro público.
 *
 *   npm run create-user -- voce@exemplo.com "sua senha" "Seu nome"
 *
 * Usa DATABASE_URL de .env.local (ou do ambiente).
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Uso: npm run create-user -- <email> <senha> ["Nome"]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("A senha precisa ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  // Import dinâmico: o dotenv precisa rodar antes de abrir a conexão.
  const { auth } = await import("../src/lib/auth");
  const ctx = await auth.$context;
  const normalized = email.trim().toLowerCase();
  const hash = await ctx.password.hash(password);

  const existing = await ctx.internalAdapter.findUserByEmail(normalized);
  if (existing) {
    const credential = await ctx.internalAdapter.findCredentialAccount(
      existing.user.id,
    );
    if (credential) {
      await ctx.internalAdapter.updatePassword(existing.user.id, hash);
    } else {
      await ctx.internalAdapter.linkAccount({
        userId: existing.user.id,
        providerId: "credential",
        accountId: existing.user.id,
        password: hash,
      });
    }
    console.log(`Senha atualizada para ${normalized}.`);
  } else {
    const user = await ctx.internalAdapter.createUser(
      {
        email: normalized,
        name: name ?? normalized.split("@")[0],
        emailVerified: true,
      },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    });
    console.log(`Usuário criado: ${normalized}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
