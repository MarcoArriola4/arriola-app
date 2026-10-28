"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, KeyRound, Pencil, RefreshCw, Trash2, Users, X } from "lucide-react";
import { buscarClientes, eliminarCliente, unirClientes, eliminarExpediente, marcarDesistio, marcarJuicioNulidad, actualizarCliente, actualizarDesdeMarcanet, actualizarExpediente, cambiarEtapa, unirExpedientes, type ResultadoEdicion, crearServicio, editarServicio, eliminarServicio, guardarCredenciales, registrarAbono, verPasswordImpi } from "@/app/actions";
import { BANCOS, TIPOS_SERVICIO } from "@/lib/catalogos";

export function AccesoImpi({ expedienteId, usuario, tienePassword }: { expedienteId: string; usuario: string | null; tienePassword: boolean }) {
  const [password, setPassword] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState("");

  const copiar = (t: string, cual: string) => {
    navigator.clipboard.writeText(t);
    setCopiado(cual);
    setTimeout(() => setCopiado(""), 1500);
  };

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><KeyRound size={14} /> Acceso IMPI del cliente</h2>
        <button onClick={() => setEditando(!editando)} className="text-xs text-neutral-500 hover:text-black">{editando ? "Cancelar" : "Editar"}</button>
      </div>
      {editando ? (
        <form action={async (f) => { await guardarCredenciales(f); setEditando(false); setPassword(null); }} className="space-y-2">
          <input type="hidden" name="id" value={expedienteId} />
          <input name="usuario" defaultValue={usuario ?? ""} placeholder="correo@cliente.com" className="input" />
          <input name="password" type="text" placeholder={tienePassword ? "Nueva contraseña (vacío = no cambiar)" : "Contraseña"} className="input" autoComplete="off" />
          <button className="btn-primario text-xs">Guardar</button>
        </form>
      ) : !usuario && !tienePassword ? (
        <p className="text-sm text-neutral-400">Sin datos de acceso.</p>
      ) : (
        <div className="space-y-2 text-sm">
          {usuario && (
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{usuario}</span>
              <button onClick={() => copiar(usuario, "u")} className="shrink-0 text-neutral-400 hover:text-black" title="Copiar usuario">{copiado === "u" ? <span className="text-xs text-marca-oscuro">Copiado</span> : <Copy size={14} />}</button>
            </div>
          )}
          {tienePassword && (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono">{password ?? "••••••••"}</span>
              <span className="flex shrink-0 gap-2">
                <button
                  onClick={async () => setPassword(password ? null : await verPasswordImpi(expedienteId))}
                  className="text-neutral-400 hover:text-black"
                  title={password ? "Ocultar" : "Mostrar"}
                >
                  {password ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={async () => copiar(password ?? (await verPasswordImpi(expedienteId)) ?? "", "p")}
                  className="text-neutral-400 hover:text-black"
                  title="Copiar contraseña"
                >
                  {copiado === "p" ? <span className="text-xs text-marca-oscuro">Copiado</span> : <Copy size={14} />}
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type Datos = {
  id: string; denominacion: string; tipo: string; numeroExpediente: string | null; numeroRegistro: string | null; etapa: string;
  fechaPresentacion: string; fechaConcesion: string; notas: string;
};

export function EditarExpediente({ e, etapas, tipos }: { e: Datos; etapas: Record<string, string>; tipos: Record<string, string> }) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEdicion | null>(null);
  const [uniendo, setUniendo] = useState(false);
  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="btn w-full justify-center"><Pencil size={14} /> Editar datos del expediente</button>
    );
  }
  return (
    <form
      action={async (f) => {
        const r = await actualizarExpediente(f);
        setResultado(r);
        if (r.ok) setAbierto(false);
      }}
      className="card space-y-3 p-4"
    >
      {resultado && !resultado.ok && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{resultado.mensaje}</p>
          {resultado.conflicto && (
            <>
              <p className="mt-1 text-xs">Si en realidad son la misma marca, puedes unirlas: los cobros, notificaciones e historial de este registro pasan a esa marca y este registro se elimina.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={uniendo}
                  onClick={async () => {
                    if (!confirm(`¿Unir "${e.denominacion}" con "${resultado.conflicto!.denominacion}" (exp. ${resultado.conflicto!.numero})? No se puede deshacer.`)) return;
                    setUniendo(true);
                    const r = await unirExpedientes(e.id, resultado.conflicto!.id);
                    if (r.ok && "clienteId" in r) window.location.href = `/clientes/${r.clienteId}?marca=${r.destinoId}`;
                    setUniendo(false);
                  }}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                >
                  {uniendo ? "Uniendo…" : `Unir con exp. ${resultado.conflicto.numero}`}
                </button>
                <a href={`/expedientes/${resultado.conflicto.id}`} className="btn px-3 py-1.5 text-xs">Ver esa marca</a>
              </div>
            </>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Editar expediente</h2>
        <button type="button" onClick={() => setAbierto(false)} className="text-neutral-400 hover:text-black" aria-label="Cerrar"><X size={16} /></button>
      </div>
      <input type="hidden" name="id" value={e.id} />
      <L t="Denominación"><input name="denominacion" defaultValue={e.denominacion} className="input" required /></L>
      <div className="grid grid-cols-2 gap-2">
        <L t="Tipo"><select name="tipo" defaultValue={e.tipo} className="input">{Object.entries(tipos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
        <L t="Etapa"><select name="etapa" defaultValue={e.etapa} className="input">{Object.entries(etapas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
        <L t="No. expediente"><input name="numeroExpediente" defaultValue={e.numeroExpediente ?? ""} className="input" /></L>
        <L t="No. registro"><input name="numeroRegistro" defaultValue={e.numeroRegistro ?? ""} className="input" /></L>
        <L t="Presentación"><input type="date" name="fechaPresentacion" defaultValue={e.fechaPresentacion} className="input" /></L>
        <L t="Concesión"><input type="date" name="fechaConcesion" defaultValue={e.fechaConcesion} className="input" /></L>
      </div>
      <L t="Notas"><textarea name="notas" defaultValue={e.notas} rows={3} className="input" /></L>
      <button className="btn-primario">Guardar cambios</button>
    </form>
  );
}

export function Abono({ servicioId, restante }: { servicioId: string; restante: number }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <button onClick={() => setAbierto(true)} className="btn px-2 py-1 text-xs">Registrar pago</button>;
  return (
    <form action={async (f) => { await registrarAbono(f); setAbierto(false); }} className="flex items-center justify-end gap-1.5">
      <input type="hidden" name="id" value={servicioId} />
      <input name="monto" defaultValue={restante > 0 ? restante : ""} inputMode="numeric" className="input w-24 py-1 text-xs" />
      <select name="banco" defaultValue="BBVA" className="input w-auto py-1 text-xs">{BANCOS.map((b) => <option key={b}>{b}</option>)}</select>
      <button className="btn-primario px-2 py-1 text-xs">OK</button>
      <button type="button" onClick={() => setAbierto(false)} className="text-neutral-400" aria-label="Cancelar"><X size={14} /></button>
    </form>
  );
}

export function NuevoCobro({ expedienteId }: { expedienteId: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)} className="btn">+ Nuevo cobro</button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16" onClick={() => setAbierto(false)}>
          <form action={async (f) => { await crearServicio(f); setAbierto(false); }} onClick={(ev) => ev.stopPropagation()} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Nuevo cobro</h2>
            <input type="hidden" name="expedienteId" value={expedienteId} />
            <div className="grid grid-cols-2 gap-3">
              <L t="Servicio"><select name="tipo" className="input" defaultValue="CONTESTACION">{Object.entries(TIPOS_SERVICIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
              <L t="Fecha"><input type="date" name="fechaContratacion" defaultValue={new Date().toLocaleDateString("en-CA")} className="input" /></L>
              <L t="Costo"><input name="costo" inputMode="numeric" required className="input" placeholder="3200" /></L>
              <L t="Pagado"><input name="pagado" inputMode="numeric" className="input" placeholder="0" /></L>
              <L t="Banco"><select name="banco" className="input" defaultValue="BBVA">{BANCOS.map((b) => <option key={b}>{b}</option>)}</select></L>
              <L t="Vendió"><input name="vendedor" className="input" placeholder="Nombre de quien vendió" /></L>
            </div>
            <L t="Notas"><input name="notas" className="input" /></L>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="btn">Cancelar</button>
              <button className="btn-primario">Guardar cobro</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{t}</span>
      {children}
    </label>
  );
}

function Modal({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16" onClick={cerrar}>
      <div onClick={(ev) => ev.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 text-left shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button type="button" onClick={cerrar} className="text-neutral-400 hover:text-black" aria-label="Cerrar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

type ServicioEditable = { id: string; tipo: string; fechaContratacion: string; costo: number | null; pagado: number; banco: string | null; origenVenta: string | null; vendedor: string | null; notas: string | null };

/** Solo admin: corregir costo, lo pagado, banco, etc. o eliminar el cobro. */
export function EditarServicio({ s }: { s: ServicioEditable }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)} title="Editar cobro" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-black"><Pencil size={14} /></button>
      {abierto && (
        <Modal titulo="Editar cobro" cerrar={() => setAbierto(false)}>
          <form action={async (f) => { await editarServicio(f); setAbierto(false); }} className="space-y-3">
            <input type="hidden" name="id" value={s.id} />
            <div className="grid grid-cols-2 gap-3">
              <L t="Servicio"><select name="tipo" defaultValue={s.tipo} className="input">{Object.entries(TIPOS_SERVICIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
              <L t="Fecha"><input type="date" name="fechaContratacion" defaultValue={s.fechaContratacion} className="input" /></L>
              <L t="Costo total"><input name="costo" defaultValue={s.costo ?? ""} inputMode="numeric" className="input" /></L>
              <L t="Total pagado"><input name="pagado" defaultValue={s.pagado} inputMode="numeric" className="input" /></L>
              <L t="Banco"><select name="banco" defaultValue={s.banco ?? ""} className="input"><option value="">—</option>{BANCOS.map((b) => <option key={b}>{b}</option>)}</select></L>
              <L t="Vendió"><input name="vendedor" defaultValue={s.vendedor ?? ""} className="input" placeholder="Nombre de quien vendió" /></L>
              <L t="Origen de la venta"><input name="origenVenta" defaultValue={s.origenVenta ?? ""} className="input" /></L>
            </div>
            <L t="Notas"><textarea name="notas" defaultValue={s.notas ?? ""} rows={2} className="input" /></L>
            <div className="flex items-center justify-between pt-1">
              <button
                type="submit"
                formAction={async (f) => { if (confirm("¿Eliminar este cobro? No se puede deshacer.")) { await eliminarServicio(f); setAbierto(false); } }}
                className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
              >
                <Trash2 size={14} /> Eliminar
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAbierto(false)} className="btn">Cancelar</button>
                <button className="btn-primario">Guardar</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

type ClienteEditable = { id: string; nombre: string; telefono: string | null; email: string | null; rfc: string | null; notas: string | null };

export function EditarCliente({ c }: { c: ClienteEditable }) {
  const [abierto, setAbierto] = useState(false);
  const [conflicto, setConflicto] = useState<{ id: string; nombre: string } | null>(null);
  const router = useRouter();
  return (
    <>
      <button onClick={() => setAbierto(true)} className="btn"><Pencil size={14} /> Editar cliente</button>
      {abierto && (
        <Modal titulo="Editar cliente" cerrar={() => setAbierto(false)}>
          {conflicto && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>Ya existe el cliente <b>{conflicto.nombre}</b>. ¿Es la misma persona?</p>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`¿Unir "${c.nombre}" con "${conflicto.nombre}"?\n\nTodas las marcas, cobros, oficios e historial pasan a "${conflicto.nombre}" y "${c.nombre}" se elimina.`)) return;
                  const r = await unirClientes(c.id, conflicto.id);
                  if (r.ok) router.push(`/clientes/${conflicto.id}`);
                }}
                className="btn-primario mt-2"
              >
                Unir con «{conflicto.nombre}»
              </button>
            </div>
          )}
          <form action={async (f) => { const r = await actualizarCliente(f); if (r.ok) setAbierto(false); else setConflicto(r.conflicto ?? null); }} className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <L t="Nombre o razón social"><input name="nombre" defaultValue={c.nombre} required className="input" /></L>
            <div className="grid grid-cols-2 gap-3">
              <L t="Teléfono"><input name="telefono" defaultValue={c.telefono ?? ""} className="input" /></L>
              <L t="RFC"><input name="rfc" defaultValue={c.rfc ?? ""} className="input" /></L>
            </div>
            <L t="Correo"><input name="email" type="email" defaultValue={c.email ?? ""} className="input" /></L>
            <L t="Notas"><textarea name="notas" defaultValue={c.notas ?? ""} rows={3} className="input" /></L>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="btn">Cancelar</button>
              <button className="btn-primario">Guardar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function BotonMarcanet({ expedienteId }: { expedienteId: string }) {
  const [estado, setEstado] = useState<{ cargando: boolean; mensaje?: string; ok?: boolean }>({ cargando: false });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        disabled={estado.cargando}
        onClick={async () => {
          setEstado({ cargando: true });
          const r = await actualizarDesdeMarcanet(expedienteId);
          setEstado({ cargando: false, mensaje: r.mensaje, ok: r.ok });
        }}
        className="btn px-2.5 py-1 text-xs"
      >
        <RefreshCw size={13} className={estado.cargando ? "animate-spin" : ""} /> {estado.cargando ? "Consultando IMPI…" : "Actualizar desde MARCanet"}
      </button>
      {estado.mensaje && <span className={`text-xs ${estado.ok ? "text-marca-oscuro" : "text-red-600"}`}>{estado.mensaje}</span>}
    </span>
  );
}

const COLOR_ETAPA: Record<string, string> = {
  POR_PRESENTAR: "bg-neutral-100 text-neutral-700",
  EN_TRAMITE: "bg-sky-50 text-sky-800",
  CON_OFICIO: "bg-amber-50 text-amber-800",
  CONCEDIDA: "bg-marca-claro text-marca-oscuro",
  NEGATIVA: "bg-red-50 text-red-800",
  EN_JUICIO: "bg-violet-50 text-violet-800",
  ABANDONADA: "bg-neutral-100 text-neutral-500",
};

/** Solo admin: cambia el estatus de la marca desde el mismo encabezado. */
export function CambiarEtapa({ expedienteId, etapa, etapas }: { expedienteId: string; etapa: string; etapas: Record<string, string> }) {
  const [valor, setValor] = useState(etapa);
  const [guardando, setGuardando] = useState(false);
  return (
    <select
      value={valor}
      disabled={guardando}
      title="Cambiar estatus"
      onChange={async (ev) => {
        const nuevo = ev.target.value;
        setValor(nuevo);
        setGuardando(true);
        await cambiarEtapa(expedienteId, nuevo);
        setGuardando(false);
      }}
      className={`w-auto max-w-max cursor-pointer rounded-md border-0 py-0.5 pl-2 pr-7 text-xs font-medium ring-1 ring-black/10 ${COLOR_ETAPA[valor] ?? ""} ${guardando ? "opacity-60" : ""}`}
    >
      {Object.entries(etapas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

/** Botón rojo "Ya no quiere continuar": la marca queda abandonada (ya no es nuestro cliente). Se puede deshacer. */
export function YaNoContinua({ expedienteId, denominacion, activo }: { expedienteId: string; denominacion: string; activo: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        const pregunta = activo
          ? `¿Reactivar "${denominacion}"? Sus oficios cerrados vuelven al tablero.`
          : `¿El cliente ya no quiere continuar con "${denominacion}"?\n\nSolo esta marca quedará como "Abandonada (ya no es nuestro cliente)" y sus oficios saldrán del tablero.`;
        if (confirm(pregunta)) iniciar(() => marcarDesistio(expedienteId, !activo));
      }}
      className={
        activo
          ? "inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_0_3px_rgba(220,38,38,0.25)] hover:bg-red-700"
          : "inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
      }
      title={activo ? "Clic para deshacer" : "Marcar que el cliente ya no quiere continuar con esta marca"}
    >
      {pendiente ? "Guardando…" : activo ? "Ya no quiere continuar ✓" : "Ya no quiere continuar"}
    </button>
  );
}

/**
 * "Se metió juicio de nulidad": el juicio va al Tribunal y no aparece en MARCanet, así que se registra aquí.
 * Con juicio registrado la marca sigue en la revisión con MARCanet aunque hayan pasado más de 2 meses de la negativa.
 */
export function JuicioNulidad({ expedienteId, denominacion, fecha }: { expedienteId: string; denominacion: string; fecha: string | null }) {
  const [pendiente, iniciar] = useTransition();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        if (fecha) {
          if (confirm(`¿Quitar el juicio de nulidad registrado para "${denominacion}"?`)) iniciar(() => marcarJuicioNulidad(expedienteId, null));
          return;
        }
        const f = prompt(`¿Se presentó juicio de nulidad contra la negativa de "${denominacion}"?\n\nFecha de presentación (AAAA-MM-DD):`, hoy);
        if (f && /^\d{4}-\d{2}-\d{2}$/.test(f.trim())) iniciar(() => marcarJuicioNulidad(expedienteId, f.trim()));
        else if (f) alert("Escribe la fecha como AAAA-MM-DD, por ejemplo " + hoy);
      }}
      className={
        fecha
          ? "inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
          : "inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50"
      }
      title={fecha ? "Clic para quitarlo" : "No aparece en MARCanet: regístralo aquí para que la marca se siga revisando"}
    >
      {pendiente ? "Guardando…" : fecha ? `Juicio de nulidad ✓ (${fecha.split("-").reverse().join("/")})` : "¿Se metió juicio de nulidad?"}
    </button>
  );
}

/** Eliminar una marca dada de alta por error (duplicada). No vuelve a aparecer al reimportar el Excel. Solo admin. */
export function EliminarMarca({ expedienteId, denominacion, cobros }: { expedienteId: string; denominacion: string; cobros: number }) {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        const aviso = `¿Eliminar la marca "${denominacion}"?\n\nSe borran también ${cobros} cobro(s), sus oficios y su historial. No se puede deshacer y no se volverá a crear al importar el Excel.`;
        if (!confirm(aviso)) return;
        if (prompt(`Para confirmar escribe ELIMINAR`)?.trim().toUpperCase() !== "ELIMINAR") return;
        iniciar(async () => {
          const r = await eliminarExpediente(expedienteId);
          router.push(`/clientes/${r.clienteId}`);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-400 hover:bg-red-50 hover:text-red-600"
      title="Eliminar esta marca (por ejemplo, si está duplicada)"
    >
      <Trash2 size={13} /> {pendiente ? "Eliminando…" : "Eliminar marca"}
    </button>
  );
}

/** Herramientas del cliente (admin): unirlo con otro cliente (misma persona) o eliminarlo si no tiene marcas. */
export function HerramientasCliente({ c, marcas }: { c: { id: string; nombre: string }; marcas: number }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<{ id: string; nombre: string; telefono: string | null }[]>([]);
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const router = useRouter();

  const buscar = async (t: string) => {
    setQ(t);
    setLista(t.trim().length >= 2 ? (await buscarClientes(t)).filter((x) => x.id !== c.id) : []);
  };

  return (
    <>
      <button onClick={() => setAbierto(true)} className="btn"><Users size={14} /> Unir o eliminar</button>
      {abierto && (
        <Modal titulo="Unir o eliminar cliente" cerrar={() => setAbierto(false)}>
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold">Unir con otro cliente</h3>
              <p className="mb-2 text-xs text-neutral-500">Para cuando es la misma persona registrada dos veces. Las {marcas} marca(s) de «{c.nombre}» (con cobros, oficios e historial) pasan al cliente que elijas y «{c.nombre}» se elimina.</p>
              <input value={q} onChange={(e) => buscar(e.target.value)} placeholder="Busca el cliente que se queda (nombre o teléfono)" className="input" autoFocus />
              <ul className="mt-2 max-h-56 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/[0.07]">
                {lista.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{x.nombre}{x.telefono && <span className="text-xs text-neutral-400"> · {x.telefono}</span>}</span>
                    <button
                      disabled={pendiente}
                      onClick={() => {
                        if (!confirm(`¿Unir «${c.nombre}» con «${x.nombre}»?\n\nSe queda «${x.nombre}» con todas las marcas de ambos. «${c.nombre}» se elimina. No se puede deshacer.`)) return;
                        iniciar(async () => {
                          const r = await unirClientes(c.id, x.id);
                          if (r.ok) router.push(`/clientes/${x.id}`);
                          else setMensaje(r.mensaje ?? "No se pudo unir");
                        });
                      }}
                      className="btn-primario shrink-0 px-2.5 py-1 text-xs"
                    >
                      Unir aquí
                    </button>
                  </li>
                ))}
                {q.trim().length >= 2 && lista.length === 0 && <li className="px-3 py-3 text-xs text-neutral-400">Sin resultados.</li>}
              </ul>
            </section>
            <section className="border-t border-black/5 pt-4">
              <h3 className="text-sm font-semibold text-red-700">Eliminar cliente</h3>
              <p className="mb-2 text-xs text-neutral-500">
                {marcas ? `Tiene ${marcas} marca(s): para eliminarlo primero únelo con otro cliente o elimina sus marcas.` : "No tiene marcas: se puede eliminar."}
              </p>
              <button
                disabled={pendiente || marcas > 0}
                onClick={() => {
                  if (!confirm(`¿Eliminar el cliente «${c.nombre}»? No se puede deshacer.`)) return;
                  iniciar(async () => {
                    const r = await eliminarCliente(c.id);
                    if (r.ok) router.push("/clientes");
                    else setMensaje(r.mensaje ?? "No se pudo eliminar");
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={14} /> Eliminar cliente
              </button>
            </section>
            {mensaje && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{mensaje}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
