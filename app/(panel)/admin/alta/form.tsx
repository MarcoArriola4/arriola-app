"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BookOpen, Building2, PenTool, Wrench, CalendarCheck, Lightbulb, Megaphone, MessageSquareReply, MoreHorizontal, RefreshCw, Store } from "lucide-react";
import { altaServicio, buscarClientes, marcasDeCliente } from "@/app/actions";
import { BANCOS } from "@/lib/catalogos";

type Marca = { id: string; denominacion: string; numeroExpediente: string | null; numeroRegistro: string | null };
type Cliente = { id: string; nombre: string; telefono: string | null; expedientes?: Marca[] };

const SERVICIOS = [
  { id: "MARCA", label: "Registro de marca", icon: Award, nuevo: true },
  { id: "AVISO", label: "Aviso comercial", icon: Megaphone, nuevo: true },
  { id: "NOMBRE_COMERCIAL", label: "Nombre comercial", icon: Store, nuevo: true },
  { id: "PATENTE", label: "Patente", icon: Lightbulb, nuevo: true },
  { id: "MODELO_UTILIDAD", label: "Modelo de utilidad", icon: Wrench, nuevo: true },
  { id: "DISENO_INDUSTRIAL", label: "Diseño industrial", icon: PenTool, nuevo: true },
  { id: "OBRA", label: "Derecho de autor", icon: BookOpen, nuevo: true },
  { id: "EMPRESA", label: "Constitución de empresa", icon: Building2, nuevo: true },
  { id: "CONTESTACION", label: "Contestación de oficio", icon: MessageSquareReply, nuevo: false },
  { id: "DDU", label: "Declaración de uso", icon: CalendarCheck, nuevo: false },
  { id: "RENOVACION", label: "Renovación", icon: RefreshCw, nuevo: false },
  { id: "OTRO", label: "Otro servicio", icon: MoreHorizontal, nuevo: false },
];

// Costo que se pone solo al elegir el servicio (se puede cambiar)
const COSTO_SUGERIDO: Record<string, string> = {
  MARCA: "7400",
  AVISO: "7400",
  CONTESTACION: "3200",
  EMPRESA: "26000",
  DDU: "3200",
  RENOVACION: "7400",
};

export function FormAlta({ cliente, servicioInicial, vendedores = [] }: { cliente: Cliente | null; servicioInicial?: string; vendedores?: string[] }) {
  const router = useRouter();
  const [elegido, setElegido] = useState<Cliente | null>(cliente);
  const [nuevo, setNuevo] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Cliente[]>([]);
  const [servicio, setServicio] = useState(servicioInicial && SERVICIOS.some((s) => s.id === servicioInicial) ? servicioInicial : "MARCA");
  const [marcas, setMarcas] = useState<Marca[]>(cliente?.expedientes ?? []);
  const [marcaId, setMarcaId] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const def = SERVICIOS.find((s) => s.id === servicio)!;
  const sobreExistente = !def.nuevo && marcaId !== "";

  useEffect(() => {
    if (elegido || nuevo || q.trim().length < 2) return setRes([]);
    const h = setTimeout(() => buscarClientes(q).then(setRes), 250);
    return () => clearTimeout(h);
  }, [q, elegido, nuevo]);

  useEffect(() => {
    if (!elegido) return setMarcas([]);
    if (elegido.expedientes) return setMarcas(elegido.expedientes);
    marcasDeCliente(elegido.id).then(setMarcas);
  }, [elegido]);

  useEffect(() => {
    if (!def.nuevo && marcas.length > 0) setMarcaId(marcas[0].id);
    else setMarcaId("");
  }, [servicio, marcas, def.nuevo]);

  async function enviar(f: FormData) {
    if (!elegido && !nuevo) return setError("Paso 1: elige un cliente o crea uno nuevo.");
    setError("");
    setEnviando(true);
    // Se guarda y luego se abre el cliente desde aquí (sin redirección dentro del guardado, que mostraba la pantalla de error)
    let url: string;
    try {
      url = (await altaServicio(f)).url;
    } catch {
      setError("No se pudo guardar. Revisa los datos e intenta de nuevo.");
      setEnviando(false);
      return;
    }
    router.push(url);
  }

  return (
    <form action={enviar} className="max-w-3xl space-y-4">
      {/* Paso 1 */}
      <Paso n={1} titulo="¿Quién es el cliente?">
        {elegido ? (
          <div className="flex items-center justify-between rounded-lg border border-marca/40 bg-marca-claro px-3 py-2.5 text-sm">
            <span><b>{elegido.nombre}</b> {elegido.telefono && <span className="text-neutral-500">· {elegido.telefono}</span>} <span className="text-neutral-500">· {marcas.length === 1 ? "1 marca" : `${marcas.length} marcas`}</span></span>
            {!cliente && <button type="button" onClick={() => { setElegido(null); setQ(""); }} className="text-xs text-neutral-500 hover:text-black">Cambiar</button>}
            <input type="hidden" name="clienteId" value={elegido.id} />
          </div>
        ) : nuevo ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <L t="Nombre o razón social *"><input name="clienteNombre" required defaultValue={q} className="input" autoFocus /></L>
            <L t="Teléfono"><input name="telefono" className="input" inputMode="tel" placeholder="5512345678" /></L>
            <L t="Correo"><input name="email" type="email" className="input" placeholder="cliente@correo.com" /></L>
            <L t="RFC"><input name="rfc" className="input" /></L>
            <button type="button" onClick={() => setNuevo(false)} className="text-left text-xs text-neutral-500 hover:text-black sm:col-span-2">← Mejor buscar un cliente que ya existe</button>
          </div>
        ) : (
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe el nombre o teléfono del cliente" className="input" autoFocus />
            <ul className="mt-1 overflow-hidden rounded-lg border border-black/10 bg-white empty:hidden">
              {res.map((r) => (
                <li key={r.id}><button type="button" onClick={() => setElegido(r)} className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50">{r.nombre} <span className="text-neutral-400">{r.telefono}</span></button></li>
              ))}
              {q.trim().length >= 2 && (
                <li><button type="button" onClick={() => setNuevo(true)} className="block w-full px-3 py-2 text-left text-sm font-medium text-marca-oscuro hover:bg-neutral-50">+ Es un cliente nuevo: “{q}”</button></li>
              )}
            </ul>
            {q.trim().length < 2 && <button type="button" onClick={() => setNuevo(true)} className="mt-2 text-sm font-medium text-marca-oscuro hover:underline">+ Cliente nuevo</button>}
          </div>
        )}
      </Paso>

      {/* Paso 2 */}
      <Paso n={2} titulo="¿Qué servicio contrató?">
        <input type="hidden" name="servicio" value={servicio} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SERVICIOS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setServicio(id)}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition ${servicio === id ? "border-marca bg-marca-claro font-medium ring-2 ring-marca/25" : "border-black/10 bg-white hover:border-black/25"}`}
            >
              <Icon size={17} className={servicio === id ? "text-marca-oscuro" : "text-neutral-400"} />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3 border-t border-black/5 pt-4">
          {!def.nuevo && (
            <L t="¿Sobre qué marca?">
              <select name="expedienteId" value={marcaId} onChange={(e) => setMarcaId(e.target.value)} className="input">
                {marcas.map((m) => <option key={m.id} value={m.id}>{m.denominacion} · {m.numeroExpediente ?? "s/n"}{m.numeroRegistro ? ` · Reg. ${m.numeroRegistro}` : ""}</option>)}
                <option value="">Otra marca que no está en la app…</option>
              </select>
            </L>
          )}
          {!sobreExistente && (
            <div className="grid gap-3 sm:grid-cols-2">
              <L t={servicio === "EMPRESA" ? "Nombre de la empresa *" : def.nuevo ? `Denominación (${def.label.toLowerCase()}) *` : "Denominación de la marca *"}>
                <input name="denominacion" required className="input" placeholder={servicio === "EMPRESA" ? "MI EMPRESA, S.A. DE C.V." : "MI MARCA"} />
              </L>
              <L t="No. de expediente (si ya se presentó)">
                <input name="numeroExpediente" className="input" placeholder={["PATENTE", "MODELO_UTILIDAD", "DISENO_INDUSTRIAL"].includes(servicio) ? "MX/f/2026/001234" : "3412345"} />
              </L>
              {!def.nuevo && (
                <>
                  <L t="No. de registro"><input name="numeroRegistro" className="input" inputMode="numeric" /></L>
                  <L t="Fecha de concesión"><input type="date" name="fechaConcesion" className="input" /></L>
                </>
              )}
              {def.nuevo && (
                <>
                  <L t="Usuario IMPI del cliente (opcional)"><input name="impiUsuario" className="input" placeholder="correo@cliente.com" /></L>
                  <L t="Contraseña IMPI (opcional, se guarda cifrada)"><input name="impiPassword" className="input" autoComplete="off" /></L>
                </>
              )}
            </div>
          )}
        </div>
      </Paso>

      {/* Paso 3 */}
      <Paso n={3} titulo="Cobro">
        <div className="grid gap-3 sm:grid-cols-3">
          <L t="Costo total"><input key={servicio} name="costo" defaultValue={COSTO_SUGERIDO[servicio] ?? ""} inputMode="numeric" className="input" placeholder="3200" /></L>
          <L t="Pagó (anticipo o total)"><input name="pagado" inputMode="numeric" className="input" placeholder="0" /></L>
          <L t="Fecha"><input type="date" name="fechaContratacion" defaultValue={new Date().toLocaleDateString("en-CA")} className="input" /></L>
          <L t="Banco"><select name="banco" defaultValue="BBVA" className="input">{BANCOS.map((b) => <option key={b}>{b}</option>)}</select></L>
          <L t="Vendió">
            <input name="vendedor" list="lista-vendedores" className="input" placeholder="Nombre de quien vendió" />
            <datalist id="lista-vendedores">{vendedores.map((v) => <option key={v} value={v} />)}</datalist>
          </L>
          <L t="Notas"><input name="notas" className="input" placeholder="Clase 35, factura…" /></L>
        </div>
      </Paso>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={enviando} className="btn-primario px-6 py-2.5 text-base">{enviando ? "Guardando…" : "Dar de alta"}</button>
    </form>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2.5 text-base font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-carbon text-xs text-marca">{n}</span>
        {titulo}
      </h2>
      {children}
    </section>
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
