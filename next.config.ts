import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Excel de contactos del Panel Vendedoras se sube con una server action (el límite por defecto es 1 MB)
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
