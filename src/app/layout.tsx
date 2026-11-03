import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Space_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { THEME_SCRIPT } from "@/components/theme";
import "./globals.css";

// Fontes do tema Firelight (Obsidian): Hanken Grotesk no texto e na
// interface, Space Mono no código.
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin", "latin-ext"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Noting",
  description: "Notas pessoais em Markdown",
  applicationName: "Noting",
  // iPhone: abre em tela cheia quando adicionado à tela de início.
  appleWebApp: { capable: true, title: "Noting", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#141414", // trocado pelo script do tema (claro: #fef8f6)
  width: "device-width",
  initialScale: 1,
  // Ocupa a tela toda no iPhone (safe areas tratadas no CSS) e, no Android,
  // encolhe a página quando o teclado abre.
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${hankenGrotesk.variable} ${spaceMono.variable} h-full antialiased`}
      // data-theme é definido pelo script abaixo antes da hidratação.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col text-sm leading-normal">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
