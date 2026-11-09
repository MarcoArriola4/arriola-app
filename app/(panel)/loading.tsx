// Mientras carga una pantalla: esqueleto con la forma de la página (en lugar de quedarse en blanco)
export default function Cargando() {
  const bloque = "animate-pulse rounded-xl bg-black/[0.06]";
  return (
    <div aria-busy="true" aria-label="Cargando" className="space-y-6">
      <div className="space-y-2 border-b border-linea pb-5">
        <div className={`${bloque} h-9 w-64`} />
        <div className={`${bloque} h-4 w-96 max-w-full`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`${bloque} h-24`} />)}
      </div>
      <div className="card space-y-3 p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`${bloque} h-10`} />)}
      </div>
    </div>
  );
}
