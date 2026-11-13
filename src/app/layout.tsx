import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/print.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { PwaRegister } from "@/components/pwa/Pwa";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.aetherdevsolutions.in"),
  title: {
    default: "AetherDev Solutions | Child Therapy Center Management Software",
    template: "%s | AetherDev Solutions",
  },
  description: "Cloud-based practice management platform for child therapy and development centers — patients, appointments, therapy sessions, billing, HR/payroll and a parent portal.",
  keywords: [
    "child therapy center software",
    "speech therapy clinic management",
    "occupational therapy practice management",
    "ABA therapy software India",
    "child development center ERP",
    "therapy clinic patient management",
  ],
  icons: {
    icon: "/logo.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // Installed-app (PWA) behaviour; the manifest itself is src/app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: "AetherDev",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F7A87",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
