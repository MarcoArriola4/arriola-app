import type { Metadata, Viewport } from "next";
import { EB_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Títulos: serif clásica (autoridad de despacho legal)
const garamond = EB_Garamond({ variable: "--font-garamond", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Arriola Abogados · Marcas", template: "%s · Arriola Abogados" },
  description: "Control de marcas, notificaciones del IMPI y pagos",
  applicationName: "Arriolabogados",
  // iPhone: nombre del acceso directo en la pantalla de inicio (el ícono es app/apple-icon.png)
  appleWebApp: { capable: true, title: "Arriolabogados", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#161616" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${garamond.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
