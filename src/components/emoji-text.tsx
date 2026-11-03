import {
  Bell,
  BookOpen,
  Briefcase,
  CircleAlert,
  CircleCheck,
  Clapperboard,
  Headphones,
  Lightbulb,
  type LucideIcon,
  NotebookPen,
  Pin,
  Search,
  ShoppingCart,
  Sprout,
  Star,
  Tv,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { type EmojiIconName, emojiInfo, EMOJI_ICON_RE } from "@/lib/emoji-icons";

const ICONS: Record<EmojiIconName, LucideIcon> = {
  BookOpen,
  Search,
  Briefcase,
  CircleAlert,
  Lightbulb,
  Bell,
  Sprout,
  ShoppingCart,
  Star,
  Tv,
  Clapperboard,
  Headphones,
  Pin,
  NotebookPen,
  CircleCheck,
  TriangleAlert,
};

/** Um emoji conhecido como ícone colorido (ou o próprio texto, se não for). */
export function EmojiIcon({ emoji, size = 14 }: { emoji: string; size?: number }) {
  const info = emojiInfo(emoji);
  if (!info) return <>{emoji}</>;
  const Icon = ICONS[info.icon];
  return (
    <span role="img" aria-label={info.label} className="inline-flex align-[-0.15em]" style={{ color: `var(--color-hue-${info.hue})` }}>
      <Icon size={size} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

/** Texto com os emojis conhecidos trocados por ícones coloridos. */
export function EmojiText({ text, size }: { text: string; size?: number }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_ICON_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<EmojiIcon key={m.index} emoji={m[0]} size={size} />);
    last = m.index + m[0].length;
  }
  if (last === 0) return <>{text}</>;
  out.push(text.slice(last));
  return <>{out}</>;
}
