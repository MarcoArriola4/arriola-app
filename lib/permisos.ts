// Permisos que el administrador puede dar a cada usuario (el administrador siempre puede todo).
export const PERMISOS: Record<string, { txt: string; ayuda: string }> = {
  oficios: { txt: "Mover oficios", ayuda: "Avisé / pagó / trabajado / contestada y registrar notificaciones del IMPI" },
  marcas: { txt: "Editar marcas", ayuda: "Datos de la marca, estatus, notas, acceso IMPI y «Ya no quiere continuar»" },
  cobros: { txt: "Cobros y pagos", ayuda: "Registrar pagos, agregar y editar cobros" },
  contrataciones: { txt: "Editar Contrataciones", ayuda: "Vendedor, estatus del trabajo y nota en la hoja del mes" },
  altas: { txt: "Altas", ayuda: "Dar de alta clientes y servicios, editar datos del cliente" },
  ver_pagos: { txt: "Ver Pagos", ayuda: "Ver el apartado de cobranza por mes y banco" },
  exportar: { txt: "Exportar Excel", ayuda: "Descargar el Excel de Pagos (sin contraseñas del IMPI)" },
  eliminar: { txt: "Eliminar", ayuda: "Borrar marcas, cobros y notificaciones" },
};

export type Permiso = keyof typeof PERMISOS;

/** Permisos efectivos de un usuario: el administrador tiene todos. */
export function listaPermisos(u: { rol: string; permisos?: string | null }) {
  if (u.rol === "ADMIN") return new Set(Object.keys(PERMISOS));
  return new Set((u.permisos ?? "").split(",").map((p) => p.trim()).filter((p) => p in PERMISOS));
}
