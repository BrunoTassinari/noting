// Emojis comuns nas notas (sinalizadores, mídia, listas) desenhados como
// ícones de contorno coloridos, no lugar do emoji do sistema. O texto da
// nota continua com o emoji; só a exibição muda.

export type EmojiIconName =
  | "BookOpen"
  | "Search"
  | "Briefcase"
  | "CircleAlert"
  | "Lightbulb"
  | "Bell"
  | "Sprout"
  | "ShoppingCart"
  | "Star"
  | "Tv"
  | "Clapperboard"
  | "Headphones"
  | "Pin"
  | "NotebookPen"
  | "CircleCheck"
  | "TriangleAlert"
  | "CalendarDays";

/** emoji → ícone + cor (token de matiz do tema). */
export const EMOJI_ICONS: Record<string, { icon: EmojiIconName; hue: string; label: string }> = {
  "📖": { icon: "BookOpen", hue: "fern", label: "livro" },
  "📚": { icon: "BookOpen", hue: "fern", label: "livros" },
  "🔎": { icon: "Search", hue: "cornflower", label: "análise" },
  "🔍": { icon: "Search", hue: "cornflower", label: "análise" },
  "💼": { icon: "Briefcase", hue: "apricot", label: "trabalho" },
  "❗": { icon: "CircleAlert", hue: "ember", label: "importante" },
  "💡": { icon: "Lightbulb", hue: "honey", label: "ideia" },
  "🔔": { icon: "Bell", hue: "coral", label: "lembrança" },
  "🌱": { icon: "Sprout", hue: "fern", label: "hábito" },
  "🛒": { icon: "ShoppingCart", hue: "verdigris", label: "comprar" },
  "⭐": { icon: "Star", hue: "honey", label: "destaque" },
  "📺": { icon: "Tv", hue: "lilac", label: "série" },
  "🎬": { icon: "Clapperboard", hue: "orchid", label: "filme" },
  "🎧": { icon: "Headphones", hue: "cornflower", label: "áudio" },
  "📌": { icon: "Pin", hue: "rose", label: "fixado" },
  "📝": { icon: "NotebookPen", hue: "apricot", label: "anotação" },
  "✅": { icon: "CircleCheck", hue: "fern", label: "feito" },
  "⚠": { icon: "TriangleAlert", hue: "apricot", label: "atenção" },
  "📅": { icon: "CalendarDays", hue: "verdigris", label: "evento" },
  "🗓": { icon: "CalendarDays", hue: "verdigris", label: "evento" },
};

/** Acha os emojis conhecidos (com ou sem o seletor de variação U+FE0F). */
export const EMOJI_ICON_RE = new RegExp(
  `(${Object.keys(EMOJI_ICONS).join("|")})\\uFE0F?`,
  "gu",
);

export function emojiInfo(match: string) {
  return EMOJI_ICONS[match.replace(/️/g, "")] ?? null;
}
