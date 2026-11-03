import { WidgetType } from "@codemirror/view";
import {
  Bell,
  BookOpen,
  Briefcase,
  CircleAlert,
  CircleCheck,
  Clapperboard,
  createElement,
  Headphones,
  Lightbulb,
  NotebookPen,
  Pin,
  Search,
  ShoppingCart,
  Sprout,
  Star,
  Tv,
  TriangleAlert,
  type IconNode,
} from "lucide";
import type { EmojiIconName } from "@/lib/emoji-icons";

const NODES: Record<EmojiIconName, IconNode> = {
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

/** Emoji desenhado como ícone de contorno colorido (o texto continua o emoji). */
export class EmojiIconWidget extends WidgetType {
  constructor(
    readonly icon: EmojiIconName,
    readonly hue: string,
    readonly label: string,
  ) {
    super();
  }
  eq(o: EmojiIconWidget) {
    return o.icon === this.icon && o.hue === this.hue;
  }
  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "cm-emoji-icon";
    wrap.style.color = `var(--color-hue-${this.hue})`;
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", this.label);
    const svg = createElement(NODES[this.icon]);
    svg.setAttribute("width", "1.05em");
    svg.setAttribute("height", "1.05em");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("aria-hidden", "true");
    wrap.append(svg);
    return wrap;
  }
}
