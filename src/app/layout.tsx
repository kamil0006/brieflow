import type { Metadata, Viewport } from "next";
import { Source_Serif_4, IBM_Plex_Sans } from "next/font/google";
import { ToastHost } from "@/components/Toast";
import { dictionaries } from "@/lib/i18n/dictionary";
import { getLocale } from "@/lib/i18n/locale";
import { getTheme } from "@/lib/theme";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: "Brieflow",
    description: dictionaries[locale].meta.description,
    // iOS: open full-screen from the home screen, like the manifest does elsewhere
    appleWebApp: { capable: true, title: "Brieflow", statusBarStyle: "default" },
  };
}

// browser/OS chrome (address bar, status bar) takes the colour of the
// chosen theme's background
export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return { themeColor: theme === "light" ? "#f7f3e8" : "#0f1216" };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const theme = await getTheme();
  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${sourceSerif.variable} ${plexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col sm:flex-row bg-bg text-text">
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
