import Link from "next/link";

export default function NoteNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
      <p className="text-text">Nota não encontrada.</p>
      <Link href="/" className="text-sm text-accent hover:underline">
        Voltar para as notas
      </Link>
    </div>
  );
}
