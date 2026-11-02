import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { THEME_SCRIPT } from "@/components/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
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
  themeColor: "#16171b", // trocado pelo script do tema (claro: #f4f4f1)
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
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
