/**
 * SHA-256 (hex) do texto em UTF-8, igual ao que o banco calcula com
 * encode(sha256(convert_to(body, 'UTF8')), 'hex'). Retorna null fora de
 * contexto seguro (http sem ser localhost), onde crypto.subtle não existe.
 */
export async function sha256Hex(text: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
