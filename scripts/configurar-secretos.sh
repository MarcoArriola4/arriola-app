#!/bin/zsh
# Guarda en GitHub la conexión de la base de datos para la revisión nocturna de MARCanet.
# (Las llaves de Vercel ya están configuradas.) Lo ejecuta el dueño de las cuentas, una sola vez.
cd "$(dirname "$0")/.." || exit 1

if [ ! -f .env.production.local ]; then
  echo "✗ No encuentro .env.production.local en $(pwd)"
  exit 1
fi

url=$(grep '^DATABASE_URL=' .env.production.local | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$url" ]; then
  echo "✗ .env.production.local no tiene DATABASE_URL"
  exit 1
fi

if printf "%s" "$url" | ~/.local/bin/gh secret set DATABASE_URL --repo MarcoArriola4/arriola-app; then
  echo "✓ Conexión de la base guardada en GitHub"
else
  echo "✗ No se pudo guardar en GitHub (¿sesión de GitHub iniciada?)"
  exit 1
fi

echo "Lanzando una revisión de prueba en GitHub…"
~/.local/bin/gh workflow run marcanet.yml --repo MarcoArriola4/arriola-app && echo "✓ Revisión lanzada. Desde ahora corre sola cada noche a la 1:00 a.m."
