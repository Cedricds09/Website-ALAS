# PROMPT — Refactor arquitectónico del backend ALAS

> Pega esto tal cual al iniciar la sesión con Claude Code (o el Claude que esté trabajando en tu repo). Incluye contexto, diagnóstico, plan, reglas y entregables. Está pensado para ser autocontenido.

---

## 🧠 Contexto del proyecto

Estoy trabajando en **ALAS**, un sistema web administrativo tipo ERP ligero para gestión de servicios técnicos (instalación, mantenimiento, reparación). Stack actual:

- **Backend:** Node.js + Express 5, SQL Server vía `mssql`, PDFs con `pdfkit`, auth con `bcryptjs`. Sin TypeScript, sin ORM, sin tests.
- **Frontend:** HTML + JS vanilla + CSS plano, servido como estáticos desde el mismo Express. Hay `main.js`, `script.js`, `notes.js`, `pdf.js` al mismo nivel.
- **Base de datos:** SQL Server (tablas `servicios`, `notas`, `usuarios`).
- **Estado:** En desarrollo, aún no en producción.

### Estructura actual del repo

```
ALAS/
├── back/
│   ├── routes/
│   │   ├── servicios.js       ← ~500 líneas, muy cargado
│   │   ├── notas.js
│   │   ├── clientes.js
│   │   ├── usuarios.js
│   │   ├── auth.js            ← exporta requireAuth
│   │   └── config.js
│   ├── scripts/
│   │   └── seed-admin.js
│   ├── db.js                  ← pool singleton de SQL Server
│   ├── server.js              ← entry point Express
│   ├── pdf.js                 ← generación PDF de notas (cliente)
│   ├── notes.js
│   ├── script.js
│   ├── package.json
│   ├── .env
│   └── .env.example
└── front/
    ├── index.html
    ├── main.html
    ├── main.js
    ├── notes.js
    ├── pdf.js
    ├── script.js
    ├── styles.css
    └── imagenes/
```

### Lo que hace bien el código actual (no romper)

- `db.js` maneja pool singleton con lazy init y manejo de errores correcto.
- Transacciones bien usadas en `servicios.js`: `TABLOCKX, HOLDLOCK` para generar consecutivos, `UPDLOCK, ROWLOCK` al finalizar.
- Soft delete (`activo = 0`) ya implementado.
- Permisos por rol (admin/técnico) y por ownership (técnico solo finaliza los suyos).
- Parámetros tipados en SQL consistentemente (no hay SQL injection).
- Generación de números consecutivos (`CL-0001`, `ALAS-0001`) bajo lock de tabla.
- Asignación automática de técnico por menor carga.

### Lo que duele mantener (qué arreglar)

1. **`routes/servicios.js` hace 5 trabajos:** routing + validación + queries SQL + lógica de negocio + generación PDF de 200 líneas. Imposible de testear, difícil de leer.
2. **`requireAdminInline` duplicado** dentro de `servicios.js` cuando ya existe `requireAuth` en `auth.js`. Lógica de permisos regada.
3. **Validación a mano** en cada endpoint: `parseInt`, `String().trim()`, `Number.isFinite`. Repetida ~8 veces.
4. **Manejo de errores repetido:** mismo `try/catch + console.error + res.status(500)` en cada handler (~10 veces).
5. **Strings mágicos:** `'PENDIENTE'`, `'EN_PROCESO'`, `'TERMINADO'`, `'PAGADO'`, `'admin'`, `'tecnico'` regados. Un typo y truena en runtime sin warning.
6. **PDF reporte técnico (200 líneas de pdfkit) embebido dentro del router.**
7. **Handler de finalizar es muy largo:** 80 líneas en una función que valida, lockea, calcula folio, actualiza servicio e inserta nota.
8. **Scripts sueltos** (`notes.js`, `script.js`, `pdf.js`) al mismo nivel que código de producción en `back/`.
9. **Sin linter, sin formatter, sin tests, sin nodemon.**
10. **`.env.example` y `.env` versionados sin validación al arrancar** — si falta `DB_PASSWORD`, descubres el problema en runtime.

---

## 🎯 Objetivo del refactor

Migrar el backend a una arquitectura **modular por dominio + capas**, sin cambiar comportamiento ni romper el frontend, dejando una plantilla replicable para el resto de módulos.

**Restricciones explícitas:**

- ❌ NO migrar a TypeScript todavía.
- ❌ NO meter ORM (Prisma, Sequelize). Mantener `mssql` directo.
- ❌ NO migrar a NestJS u otro framework "estructurador".
- ❌ NO tocar el frontend en este refactor.
- ❌ NO cambiar el esquema de base de datos.
- ❌ NO cambiar las URLs de los endpoints (el frontend depende de ellas).
- ✅ SÍ mantener exactamente el mismo contrato HTTP (mismos paths, mismos request/response shapes, mismos status codes).
- ✅ SÍ usar Zod para validación.
- ✅ SÍ partir el código en capas claras: routes → controller → service → repository.

---

## 📐 Estructura objetivo

```
back/
├── src/
│   ├── modules/
│   │   ├── servicios/
│   │   │   ├── servicios.routes.js       ← solo define endpoints + middleware
│   │   │   ├── servicios.controller.js   ← extrae req, llama service, responde
│   │   │   ├── servicios.service.js      ← reglas de negocio (sin SQL, sin HTTP)
│   │   │   ├── servicios.repository.js   ← TODOS los queries SQL del módulo
│   │   │   └── servicios.schema.js       ← schemas Zod de validación
│   │   ├── notas/        (misma estructura)
│   │   ├── clientes/
│   │   ├── usuarios/
│   │   ├── auth/
│   │   └── config/
│   ├── shared/
│   │   ├── db/
│   │   │   ├── pool.js                   ← migración de db.js
│   │   │   └── transaction.js            ← helper withTransaction
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js        ← requireAuth, requireAdmin, requireRole
│   │   │   ├── error.middleware.js       ← captura todos los errores tipados
│   │   │   ├── validate.middleware.js    ← valida body/params/query con Zod
│   │   │   └── async-handler.js          ← wrapper para evitar try/catch repetido
│   │   ├── errors/
│   │   │   └── AppError.js               ← AppError, ValidationError, NotFoundError, etc.
│   │   ├── integrations/
│   │   │   ├── pdf-nota.service.js       ← migración de pdf.js (nota cliente)
│   │   │   └── pdf-reporte.service.js    ← extracción del PDF embebido en routes/servicios.js
│   │   ├── config/
│   │   │   └── env.js                    ← carga + valida .env, falla rápido
│   │   ├── constants/
│   │   │   ├── estados.js                ← ESTADO_SERVICIO.PENDIENTE, etc.
│   │   │   └── roles.js                  ← ROL.ADMIN, ROL.TECNICO
│   │   └── utils/
│   │       ├── consecutivos.js           ← formatNotaCode, formatClienteCode
│   │       └── formatters.js             ← fmtFecha, fmtMoney
│   └── server.js
├── scripts/
│   └── seed-admin.js                     ← mover desde back/scripts/
├── tests/                                ← vacío por ahora, estructura preparada
├── .env
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── .gitignore
└── package.json
```

---

## 📋 Plan de ejecución (orden estricto)

Trabaja **en este orden**, hace commit después de cada paso, y verifica que el servidor arranca antes de pasar al siguiente.

### Paso 1 — Higiene y dependencias

1. Crear estructura de carpetas vacía (`src/modules/...`, `src/shared/...`).
2. Actualizar `package.json`:
   - Agregar `"engines": { "node": ">=18" }`.
   - Agregar dependencias: `zod`.
   - Agregar devDependencies: `nodemon`, `eslint`, `prettier`, `eslint-config-prettier`.
   - Cambiar scripts:
     ```json
     "start": "node src/server.js",
     "dev": "nodemon src/server.js",
     "lint": "eslint src/",
     "format": "prettier --write \"src/**/*.js\""
     ```
3. Crear `.eslintrc.json` y `.prettierrc` con configuración mínima razonable.
4. Verificar `.gitignore` incluye `.env` y `node_modules/`.
5. **Verificar que `npm install` corre sin errores.**

### Paso 2 — Base compartida (no toca lógica de negocio)

Crea estos archivos en orden:

1. `src/shared/config/env.js` — carga + valida variables. Debe lanzar al arrancar si falta `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_NAME`, `SESSION_SECRET`.
2. `src/shared/db/pool.js` — migración funcional de `db.js`, usando `env.js` (sin defaults hardcodeados de password).
3. `src/shared/db/transaction.js` — helper `withTransaction(async (tx) => { ... })` que hace begin/commit/rollback.
4. `src/shared/errors/AppError.js` — exporta:
   - `AppError` (clase base con `statusCode` y `code`).
   - `ValidationError` (400).
   - `UnauthorizedError` (401).
   - `ForbiddenError` (403).
   - `NotFoundError` (404).
   - `ConflictError` (409).
5. `src/shared/middleware/async-handler.js` — wrapper `asyncHandler(fn)` que envuelve handlers async y manda errores a `next(err)`.
6. `src/shared/middleware/error.middleware.js` — middleware final que recibe errores; si es `AppError`, responde con `{ ok: false, error: msg }` y status correcto; si no, loggea stack y responde 500.
7. `src/shared/middleware/validate.middleware.js` — recibe schemas Zod (`{ body, params, query }`), valida y reemplaza `req.body/params/query` con datos parseados; si falla, lanza `ValidationError`.
8. `src/shared/middleware/auth.middleware.js` — extrae `requireAuth` desde `routes/auth.js` (mantenerlo ahí también si se usa) y agrega `requireAdmin`, `requireRole(rol)`.
9. `src/shared/constants/estados.js` y `src/shared/constants/roles.js` — enums congelados con `Object.freeze`.
10. `src/shared/utils/consecutivos.js` — `formatNotaCode(n)`, `formatClienteCode(n)` con prefijos `'ALAS-'` y `'CL-'` (PAD 4).
11. `src/shared/utils/formatters.js` — `fmtFecha`, `fmtMoney`.

### Paso 3 — Refactor del módulo `servicios` (el corazón)

Este es el módulo más cargado. Pártelo en 5 archivos manteniendo **comportamiento idéntico**:

#### `src/modules/servicios/servicios.schema.js`

Schemas Zod para:
- `crearServicioSchema` (body): `nombre_cliente` (string requerido), `conceptos` (string requerido), `numero_cliente` (opcional), `telefono`, `direccion`, `lat` (number opcional), `lng` (number opcional), `total` (number ≥ 0).
- `editarServicioSchema` (body): todos opcionales, mismas reglas.
- `idParamSchema` (params): `id` entero positivo.
- `numeroClienteParamSchema` (params): `numero_cliente` string no vacío.
- `asignarSchema` (body): `tecnico` string no vacío.
- `ajusteSchema` (body): `ajuste` string o null.
- `finalizarSchema` (body): `resolucion` string no vacío (trim).
- `listarQuerySchema` (query): `estado` string opcional CSV, `mine` opcional.

#### `src/modules/servicios/servicios.repository.js`

Todos los queries SQL del módulo. Cada función toma un objeto plano y retorna recordsets/recordset[0]. **Ningún `req`/`res` aquí.** Acepta opcionalmente un `tx` (transacción) para operaciones que lo requieran.

Funciones mínimas:
- `nextNumeroCliente(tx)` — del `nextNumeroCliente` actual.
- `asignarTecnicoAuto(tx)` — del `asignarTecnicoAuto` actual.
- `crearServicio(data, tx)` — el INSERT con OUTPUT.
- `listarServicios({ estados, tecnico })` — el SELECT con filtros.
- `listarPorCliente(numero_cliente)` — el GET historial.
- `buscarPorId(id, { lock = false } = {}, tx)` — SELECT por id, con o sin UPDLOCK.
- `actualizarServicio(id, campos)` — UPDATE dinámico (recibe objeto con solo campos a cambiar).
- `softDelete(id)` — UPDATE activo = 0.
- `reasignarTecnico(id, tecnico)` — UPDATE tecnico_asignado.
- `actualizarAjuste(id, ajuste)`.
- `nextNumeroNota(tx)` — del bloque dentro de finalizar.
- `finalizarServicio({ id, atendido_por, numero_nota, resolucion }, tx)`.
- `crearNotaDesdeServicio(servicio, numero_nota, conceptos_finales, tx)` — el INSERT de notas.
- `reabrirServicio(id)`.
- `validarUsuarioAsignable(usuario)` — la validación que hoy se repite en /asignar y /editar.
- `buscarNotaPorNumero(numero_nota)`.

#### `src/modules/servicios/servicios.service.js`

Reglas de negocio puras. **Ningún SQL crudo aquí, ningún `req/res`, ningún Express.** Llama al repository. Lanza errores tipados (`NotFoundError`, `ConflictError`, `ForbiddenError`).

Funciones:
- `crear(input)` — usa transacción, genera consecutivo si no viene, asigna técnico auto.
- `listar({ estados, isAdmin, mine, usuario })` — aplica regla "técnico siempre ve los suyos".
- `historialPorCliente(numero_cliente)`.
- `editar(id, campos, sesion)` — valida técnico si se cambia.
- `eliminar(id)` — valida que esté activo, soft delete.
- `reasignar(id, tecnico)` — valida usuario asignable.
- `actualizarAjuste(id, ajuste)`.
- `finalizar(id, resolucion, sesion)` — la transacción completa: lock, validar estado, validar permiso técnico-suyo, generar nota, insertar nota, actualizar servicio.
- `reabrir(id)` — solo si estado === TERMINADO.
- `obtenerNota(id, sesion)` — valida permisos y retorna nota.
- `datosParaReporte(id, sesion)` — valida permisos y retorna datos crudos para el PDF.

#### `src/modules/servicios/servicios.controller.js`

Solo extrae datos del request, llama al service, y responde. Sin try/catch (el `asyncHandler` lo cubre). Sin lógica de negocio. Sin SQL.

#### `src/modules/servicios/servicios.routes.js`

Define rutas y conecta middleware:

```js
const router = require('express').Router();
const ctrl = require('./servicios.controller');
const validate = require('../../shared/middleware/validate.middleware');
const { requireAdmin } = require('../../shared/middleware/auth.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const S = require('./servicios.schema');

router.post('/', validate({ body: S.crearServicioSchema }), asyncHandler(ctrl.crear));
router.get('/', validate({ query: S.listarQuerySchema }), asyncHandler(ctrl.listar));
router.get('/cliente/:numero_cliente', validate({ params: S.numeroClienteParamSchema }), asyncHandler(ctrl.historial));
router.put('/:id', requireAdmin, validate({ params: S.idParamSchema, body: S.editarServicioSchema }), asyncHandler(ctrl.editar));
router.delete('/:id', requireAdmin, validate({ params: S.idParamSchema }), asyncHandler(ctrl.eliminar));
router.put('/:id/asignar', requireAdmin, validate({ params: S.idParamSchema, body: S.asignarSchema }), asyncHandler(ctrl.asignar));
router.put('/:id/ajuste', validate({ params: S.idParamSchema, body: S.ajusteSchema }), asyncHandler(ctrl.actualizarAjuste));
router.post('/:id/finalizar', validate({ params: S.idParamSchema, body: S.finalizarSchema }), asyncHandler(ctrl.finalizar));
router.post('/:id/reabrir', requireAdmin, validate({ params: S.idParamSchema }), asyncHandler(ctrl.reabrir));
router.get('/:id/nota', validate({ params: S.idParamSchema }), asyncHandler(ctrl.obtenerNota));
router.get('/:id/reporte', validate({ params: S.idParamSchema }), asyncHandler(ctrl.reporte));

module.exports = router;
```

#### `src/shared/integrations/pdf-reporte.service.js`

Mover **íntegro** el bloque de generación PDF del reporte técnico (200 líneas de pdfkit) a este archivo. Exportar:

```js
function generarReporteTecnico(res, servicio) { ... }
```

El controller llama esto y nada más.

### Paso 4 — `server.js` nuevo

Crear `src/server.js` que:

1. Importa `env.js` (esto valida al arrancar).
2. Importa `pool.js`.
3. Importa middleware de errores.
4. Importa los routers (por ahora solo `servicios` migrado; los demás seguirán usando `routes/*` original con un import path actualizado).
5. Estructura idéntica a `server.js` actual (CORS, JSON, log de requests, /api/health, estáticos del front, 404 handler).
6. **Al final**, antes del 404 handler, registra el middleware de errores.

### Paso 5 — Verificación

1. Correr `npm run dev`.
2. Probar manualmente cada endpoint del módulo `servicios` con los mismos request/response que antes:
   - `POST /api/servicios` → debe crear servicio, devolver 201 con shape igual.
   - `GET /api/servicios` → lista con filtros.
   - `POST /api/servicios/:id/finalizar` → genera nota.
   - `GET /api/servicios/:id/reporte` → devuelve PDF.
3. Confirmar que el frontend sigue funcionando sin tocar nada en `front/`.
4. Probar errores: ID inválido (debe dar 400 con mensaje claro), servicio inexistente (404), técnico finalizando ajeno (403).

---

## 🔒 Reglas de ejecución

1. **No avanzar al siguiente paso si el anterior no compila/arranca.** Después de cada archivo grande, correr `npm run dev` mentalmente o pedir verificación.
2. **No cambiar el contrato HTTP.** Mismos paths, mismos shapes de respuesta `{ ok, data, error }`, mismos status codes. El frontend no se entera.
3. **Cuando muevas código, muévelo, no lo reescribas.** El PDF del reporte se mueve tal cual a `pdf-reporte.service.js`. Los queries SQL se mueven tal cual al repository. Lo único que cambia es **dónde vive** el código, no qué hace.
4. **Mantén los logs `[SERV]`, `[DB]`, etc.** para no perder trazabilidad.
5. **Si encuentras un bug en el código original, no lo arregles en este refactor.** Anótalo en una sección "TODO post-refactor" al final. El refactor debe ser comportamiento-equivalente.
6. **Hazlo en commits chicos:** uno por paso, idealmente uno por archivo grande.
7. **No toques los demás módulos** (`notas`, `clientes`, `usuarios`, `auth`, `config`) en este refactor. Solo el módulo `servicios` se migra completo como plantilla. Los demás siguen funcionando vía sus routes originales.

---

## ✅ Definición de "hecho"

El refactor está completo cuando:

- [ ] `npm run dev` arranca sin errores y sin warnings de variables faltantes.
- [ ] `GET /api/health` responde 200 con `{ ok: true, db: 'up' }`.
- [ ] Todos los endpoints de `/api/servicios/*` responden idénticamente a antes (manualmente probados con Postman/curl o frontend).
- [ ] El PDF del reporte técnico se descarga y se ve igual que antes.
- [ ] El frontend (panel admin + sitio público) funciona sin tocar nada en `front/`.
- [ ] No hay queries SQL fuera de `*/repository.js`.
- [ ] No hay `try/catch` en controllers (los maneja `asyncHandler` + `error.middleware`).
- [ ] No hay strings mágicos `'admin'`/`'tecnico'`/`'PENDIENTE'`/etc. fuera de `shared/constants/`.
- [ ] `package.json` tiene `engines`, `nodemon`, `eslint`, `prettier`, `zod`.
- [ ] Al final, dejas un `REFACTOR-NOTES.md` con: qué se movió, qué TODOs detectaste pero no arreglaste, y la receta corta para replicar este patrón en `notas`, `clientes`, `usuarios`.

---

## 🚀 Empieza ahora

Antes de tocar código:

1. Confírmame que entendiste el plan resumiendo en 5 bullets qué vas a hacer.
2. Pregúntame cualquier duda sobre permisos, estados, o comportamiento ambiguo.
3. Pídeme que te comparta los archivos que necesites ver (`routes/auth.js`, `pdf.js`, `routes/notas.js`) si te falta contexto.
4. **Después** empieza por el Paso 1.
