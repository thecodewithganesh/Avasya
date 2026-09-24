import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jb",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AVASYA — Relocation Decision Support",
    template: "%s · AVASYA",
  },
  description:
    "Intelligent disaster relocation decision support. AVASYA helps emergency officers assess risk, compare destinations, and record auditable relocation decisions.",
};

/**
 * themeColor is picked up from the persisted theme before paint by the init
 * script below; the static export default keeps metadata valid.
 */
export const viewport: Viewport = {
  themeColor: "#0A111E",
  width: "device-width",
  initialScale: 1,
};

/** Runs before first paint: applies the stored (or system) theme without a flash. */
const themeInit = `(() => {
  try {
    var t = localStorage.getItem("avasya-theme");
    if (t !== "dark" && t !== "light") {
      t = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.dataset.theme = t;
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
