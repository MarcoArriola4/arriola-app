import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Arriola Abogados · Marcas", template: "%s · Arriola Abogados" },
  description: "Control de marcas, notificaciones del IMPI y pagos",
  applicationName: "Arriolabogados",
  // iPhone: nombre del acceso directo en la pantalla de inicio (el ícono es app/apple-icon.png)
  appleWebApp: { capable: true, title: "Arriolabogados", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#1f1f1f" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
