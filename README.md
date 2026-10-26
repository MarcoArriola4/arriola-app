# Arriola Abogados · Control de marcas

App web para llevar marcas del IMPI, notificaciones (oficios), pagos y vencimientos, con alertas diarias por correo.

## Apartados

| Apartado | Para qué sirve |
|---|---|
| **Buscador (arriba)** | Por cliente, marca, expediente, registro o teléfono. Siempre abre el perfil del cliente |
| **Inicio** | Notificaciones pendientes por contestar y un resumen de los últimos 7 días |
| **Notificaciones** | Tablero de oficios en plazo: Recibida → Cliente avisado → Pagado / en trabajo → Contestada (vencidas y "No pagó" en apartados aparte) |
| **Contrataciones** | Hoja del mes: quién contrató, quién lo vendió, si ya se trabajó, si pagó completo o en parte y qué falta por hacer. Consecutivo fijo: la más reciente lleva el número más alto (arriba) y la #1 es la primera del mes |
| **Clientes y marcas** | Perfil del cliente (una persona, con sus marcas separadas por titular o razón social): marcas y, aparte, patentes / modelos / diseños industriales; oficios con su paso editable, pagos, historial, acceso IMPI y última actualización de MARCanet. Botones "Ya no quiere continuar" y "Eliminar marca" (admin) |
| **Reporte para el cliente** | En el perfil del cliente (o por titular): estatus de todas sus marcas, último movimiento del IMPI y próximos pasos, listo para imprimir o guardar en PDF |
| **Reportes** | Notificaciones nuevas de cada búsqueda en MARCanet y oficios de meses anteriores aún en plazo; el paso de cada oficio se cambia ahí mismo |
| **Exportar Excel** (admin) | Descarga la pestaña "Pagos" con todo lo de la app, en el mismo formato (A–Z, encabezado en la fila 5, mismos colores) |
| **Pagos** | Cobrado por mes, por banco y pendientes de cobro |
| **Vencimientos** | Declaraciones de uso y renovaciones (con botón para ofrecer por WhatsApp) |
| **Admin** (solo administradores) | Alta de clientes y servicios, alertas por correo y usuarios. Además, editar clientes y cobros dentro del perfil |

## Un solo estatus por expediente (`lib/estado-oficio.ts`)

El paso de un oficio (avisé / pagó / trabajado · pagar en sistema / contestada) se cambia desde el tablero, la ficha de la marca o Reportes,
y se refleja en todos lados: el cobro de la contestación en Contrataciones (por trabajar / pagar en sistema / trabajado), la etapa de la marca
y el historial ("se notificó el …, quedan N días", "se contestó el …"). Al revés también: marcar "Trabajado" en Contrataciones contesta el oficio.

## Reglas de plazos (`lib/plazos.ts`)

- Oficios (anterioridad, requerimiento, impedimento, alegatos y demás): **4 meses** desde la notificación.
- Requerimiento de pago: **5 días hábiles**.
- Alegatos / oposición: **5 días hábiles**, opcional: si no se contesta no pasa nada; queda "En espera del IMPI" (nunca se marca como vencido).
- Negativa: **15 días naturales** para recurso de revisión; si no se presenta, hasta **30 días naturales** para juicio de nulidad (uno u otro). No es definitiva: se le ofrece al cliente.
- Se confirma el acto (revisión perdida): **15 días hábiles** para juicio de nulidad.
- Declaración de uso: **3 años + 3 meses** desde la concesión.
- Renovación: **10 años** desde la concesión.

**Días hábiles:** se descuentan sábados, domingos y los días inhábiles del IMPI (calendario anual y suspensiones publicadas en el DOF). Están en `lib/inhabiles-oficiales.ts` y se administran en **Admin → Días inhábiles**. Al agregar o quitar un día, los plazos se recalculan solos. Los plazos en meses que terminan en día inhábil pasan al siguiente día hábil.

La fecha límite de cada oficio también se puede escribir a mano al registrarlo; esa no se recalcula.

## Uso en esta computadora

```bash
npm install
npm run dev          # abre http://localhost:3000
```

Para volver a cargar el Excel: `npm run importar -- "../Pagos 2026 Actual.xlsx"`. Antes, haz una copia de `prisma/dev.db` en `respaldos/`.

Cómo se lee el Excel:
- **Col. X** ("¿Qué contestó la autoridad?"): el oficio (Ant, Imp, Req, Alegatos, Negativa, Se confirma el acto, Req de pago) y su fecha.
- **Col. I y J** (costo y pago): si J trae otra cantidad, el servicio se pagó en **2 partes** (total = I + J). Cada parte está pagada si su celda está en verde; en blanco o rojo, no.
- **Col. O–T** (Christian, Montse, Zaira, IMPI otros, S, Marco): la que tiene marca es **quién lo vendió**.
- **Col. H** ("Trabajado"), según el color: 🟩 verde = ya se trabajó (con fecha) → *Contestada* · 🟪 morado/rosa = falta trabajarlo → *En trabajo* (o *Esperando pago* si no hay pago) · 🟦 azul = lo sube el cliente · 🟥 rojo = problema / no se presentó → *No pagó*.
- Un oficio sin fila de trabajo queda como *Falta avisar al cliente*.
- Lo que se crea o se mueve en la app (notificaciones, cobros, pagos, historial) **no se sobrescribe** al reimportar.

El primer usuario administrador (correo en `ADMIN_EMAIL`) queda en `CREDENCIALES-INICIALES.txt`. Cambia la contraseña en Configuración y luego borra ese archivo.

## Actualización automática con MARCanet (IMPI)

Cada noche se consulta en MARCanet (consulta pública del IMPI) cada expediente activo y, por turnos, el resto (~150 por noche).
Solo se abren las lupas de **"Solicitud de registro"** y **"Recurso de revisión"**; lo de fecha más reciente entre oficios (IMPI) y promociones/recursos (despacho) es la **última actualización** de la marca.
Se guardan los oficios con su **fecha real de notificación**, las promociones (contestaciones presentadas) y los trámites (DDU, renovaciones, recursos):

- Oficio notificado que la app no tenía → tarjeta nueva en *Notificaciones* (fuente MARCanet) y aviso en el correo diario.
- Tarjeta del Excel que coincide con un oficio → se liga al número de oficio y se corrige la fecha y el plazo (✓ IMPI).
- Promoción ligada al oficio (o recurso de revisión después de una negativa) → la tarjeta pasa a *Contestada*.
- Oficio emitido pero aún sin notificar → "Aún no notificado" (el plazo no corre).
- Las consultas van despacio (3 s entre solicitudes). MARCanet tiene una **cuota de peticiones**: cuando avisa que se superó, la corrida espera los 10 minutos que pide y continúa. Si pide captcha o falla 10 veces seguidas, se detiene.
- La corrida nocturna dura máximo 5 horas; lo prioritario (oficios en curso, luego expedientes en trámite) va primero y lo que no alcance queda para la noche siguiente.

```bash
npm run marcanet                  # corrida completa (la que se programa cada noche)
npm run marcanet -- 3384695       # uno o varios expedientes
```

La revisión automática corre en GitHub Actions (`.github/workflows/marcanet.yml`): búsqueda completa sin parar en bloques de 6 h, luego espera 15 días revisando a diario los oficios en curso.

## Patentes y diseños

`npx tsx --env-file=.env.production.local scripts/importar-patentes.ts "../Pagos 2026 Actual.xlsx"` importa la pestaña "Patente - Modelos de Utilidad" (MX/a = patente, MX/u = modelo de utilidad, MX/f = diseño industrial).

## Publicar en línea (pendiente)

1. **Base de datos:** crear una base PostgreSQL gratuita (Neon o Supabase) y cambiar `provider = "postgresql"` en `prisma/schema.prisma`.
2. **Hosting:** subir a Vercel y configurar las variables de `.env`: `DATABASE_URL`, `AUTH_SECRET`, `CREDENTIALS_KEY` (usar la misma, si no, las contraseñas IMPI ya cifradas no se podrán leer), `CRON_SECRET` y `APP_URL`.
3. **Correo:** crear una cuenta en Resend, verificar el dominio y poner `RESEND_API_KEY` y `ALERTAS_FROM`.
4. El resumen diario se envía solo a las 7:00 (hora de CDMX) con `vercel.json`.

## Seguridad

- Las contraseñas IMPI de los clientes se guardan **cifradas** (AES-256-GCM) y solo se muestran a usuarios con sesión iniciada, con el botón del ojo.
- `.env`, la base local y `CREDENCIALES-INICIALES.txt` están fuera de git.
