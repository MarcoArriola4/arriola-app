import type { MetadataRoute } from "next";

// Acceso directo en el celular ("Agregar a pantalla de inicio"): ícono con la A del logotipo y el nombre Arriolabogados
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arriolabogados",
    short_name: "Arriolabogados",
    description: "Control de marcas, notificaciones del IMPI y pagos",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1f1f1f",
    theme_color: "#1f1f1f",
    lang: "es-MX",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
