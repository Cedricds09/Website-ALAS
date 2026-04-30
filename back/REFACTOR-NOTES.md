# Refactor backend ALAS — notas de migración

## Qué se movió

### Estructura actual

```
back/
├── src/
│   ├── server.js                                  ← entry point (único activo)
│   ├── modules/
│   │   ├── auth/                                  ← login, logout, check
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.repository.js
│   │   │   └── auth.schema.js
│   │   ├── config/                                ← solo GET /api/config
│   │   │   ├── config.routes.js
│   │   │   └── config.controller.js
│   │   ├── notas/                                 ← consulta pública por cliente+validacion
│   │   │   ├── notas.routes.js
│   │   │   ├── notas.controller.js
│   │   │   ├── notas.service.js
│   │   │   ├── notas.repository.js
│   │   │   └── notas.schema.js
│   │   ├── clientes/                              ← búsqueda agrupada desde tabla servicios
│   │   │   ├── clientes.routes.js
│   │   │   ├── clientes.controller.js
│   │   │   ├── clientes.service.js
│   │   │   ├── clientes.repository.js
│   │   │   └── clientes.schema.js
│   │   ├── usuarios/                              ← CRUD admin + cascade rename
│   │   │   ├── usuarios.routes.js
│   │   │   ├── usuarios.controller.js
│   │   │   ├── usuarios.service.js
│   │   │   ├── usuarios.repository.js
│   │   │   └── usuarios.schema.js
│   │   └── servicios/
│   │       ├── servicios.routes.js
│   │       ├── servicios.controller.js
│   │       ├── servicios.service.js
│   │       ├── servicios.repository.js
│   │       └── servicios.schema.js
│   └── shared/
│       ├── auth/session.js                        ← signToken/verifyToken/cookies/getSession
│       ├── config/env.js                          ← carga + valida .env, falla rápido
│       ├── db/
│       │   ├── pool.js
│       │   └── transaction.js                     ← helper withTransaction
│       ├── errors/AppError.js                     ← AppError + Validation/Unauthorized/Forbidden/NotFound/Conflict
│       ├── middleware/
│       │   ├── async-handler.js
│       │   ├── error.middleware.js
│       │   ├── validate.middleware.js
│       │   └── auth.middleware.js                 ← requireAuth/requireAdmin/requireRole (sin deps externas)
│       ├── constants/
│       │   ├── estados.js
│       │   └── roles.js
│       ├── utils/
│       │   ├── consecutivos.js
│       │   └── formatters.js
│       └── integrations/pdf-reporte.service.js
├── scripts/
│   └── seed-admin.js                              ← usa src/shared/db/pool
├── db.js                                          ← shim residual: re-exporta src/shared/db/pool
└── server.js                                      ← legacy, no se usa (puede borrarse)
```

`back/routes/` (con auth.js, notas.js, clientes.js, usuarios.js, config.js, servicios.js) **se eliminó** — todos los módulos viven ya en `src/modules/`.

### Reescritos / actualizados

- `back/package.json`: `engines.node>=18`, scripts (`start: src/server.js`, `dev: nodemon`, `lint`, `format`), deps `zod`, dev deps `nodemon eslint prettier eslint-config-prettier`.
- `back/.env.example`: contrato vacío con todas las variables requeridas + opcionales documentadas.
- `back/.eslintrc.json`, `back/.prettierrc`: configuración mínima razonable.
- `.gitignore` (raíz): reescrito en UTF-8 sin BOM.
- `back/db.js`: shim (`module.exports = require('./src/shared/db/pool')`). Ya no lo necesita ningún módulo en `src/`. Queda por si algún script externo aún lo importa.
- `back/scripts/seed-admin.js`: import del pool al nuevo path.
- `back/src/shared/middleware/auth.middleware.js`: ahora implementa `requireAuth` directamente leyendo de `shared/auth/session.js`. Sin dependencia con el viejo `routes/auth.js`.

### Sin tocar (intencionalmente)

- `front/` — completamente intocable.
- Esquema de base de datos — sin cambios.

## Contrato HTTP — sin cambios

Verificación manual con curl tras la migración completa:

| Endpoint                                  | Sin auth                        | Comportamiento                                |
| ----------------------------------------- | ------------------------------- | --------------------------------------------- |
| `GET /api/health`                         | 200 (DB OK) / 500 (DB caída)    | `{ ok, db, error? }`                          |
| `GET /api/config`                         | 200                             | `{ ok, data: { mapsApiKey } }`                |
| `GET /api/admin/check`                    | 200 con `authed:false`          | idéntico                                      |
| `POST /api/admin/login` (body vacío)      | 400 `Usuario y contraseña requeridos.` | mensaje preservado                     |
| `POST /api/admin/login` (creds inválidas) | 401 `Usuario o contraseña incorrectos.` | mensaje preservado                    |
| `GET /api/servicios`                      | 401 `No autorizado`             | idéntico                                      |
| `GET /api/admin/usuarios`                 | 401 `No autorizado`             | idéntico                                      |
| `GET /api/clientes`                       | 401 `No autorizado`             | idéntico                                      |
| `GET /api/notas/:cliente` sin `validacion` | 400 `Parámetros requeridos: cliente (param) y validacion (query).` | mensaje preservado |

## TODOs

1. **`back/db.js` shim** — borrar. Nada en `src/` lo usa. Solo queda por compatibilidad con scripts externos hipotéticos.
2. **Notas vinculadas a servicio terminado** — el lookup por id en `obtenerNota` usa `buscarPorId` que NO filtra `activo=1`. Si se soft-deleta, las funciones que aún esperan ese ID por path ya no encuentran. Actualmente no es bug (frontend solo llama estos endpoints sobre items que vio en la lista, y la lista filtra activos). Anotado.
3. **Logs de seguridad** — el middleware de errores loggea stack en server pero no expone al cliente. OK para producción. Considerar `winston`/`pino` cuando crezca.
4. **Tests** — carpeta `tests/` aún no creada. La estructura permite añadir Jest/Vitest fácilmente sobre `service`/`repository` sin tocar Express.
5. **Limpieza de historial git** — el repo es público y los `.env` antiguos quedaron commiteados antes del fix del `.gitignore`. Pendiente: BFG o `git filter-repo` + rotación de credenciales (DB pwd, SESSION_SECRET, GOOGLE_MAPS_API_KEY).

## Mejoras cosméticas pendientes (no bloqueantes)

- **`servicios.repository.js:122`** — `IN (${placeholders.join(',')})` no acota `estados.length`. Sin riesgo de SQL injection (valores parametrizados) pero DoS teórico si llega array gigantesco. Fix opcional: cap en `listarQuerySchema` (e.g. `estados.length <= 10`).
- **Constantes interpoladas en SQL** (`servicios.repository.js` 59/62/70/234/270, `usuarios.repository.js` 20/23) — `${ESTADO_SERVICIO.X}`, `${ROL.X}`, `${PREFIJO_*}`. Son `Object.freeze` inmutables → riesgo cero hoy. Refactor opcional a `.input()` solo por consistencia con el patrón parametrizado.

## Lecciones aprendidas (sesión 2)

- **Express 5 hace `req.query` getter-only.** Cualquier middleware que parsee querystring (Zod, etc.) debe usar `Object.defineProperty(req, 'query', { value, writable, configurable })` en lugar de asignación directa, o el resultado se descarta silenciosamente sin error. Síntoma: validación parseaba pero los controllers veían los valores raw de la URL.
- **SQL Server con `GROUP BY` no admite `TOP (@parametro)`** en queries con agregaciones — el optimizador no compila el plan. Usar `OFFSET 0 ROWS / FETCH NEXT @limit ROWS ONLY` con parámetro funciona en `compatibility_level >= 110`.
- **`dotenv` interpreta `#` como inicio de comentario** en valores no quoted. Passwords con `#` deben envolverse en comillas simples (`DB_PASSWORD='p#ass'`), o el valor queda truncado silenciosamente.
- **`.gitignore` en UTF-16 LE no es respetado por git** — debe ser UTF-8. Por meses `.env` y `node_modules/` quedaron trackeados sin que nadie lo notara.
- **Probar E2E en navegador antes de commitear** — durante esta sesión la validación Zod estaba silenciosamente rota en TODO el API y solo se descubrió al ejercitar `?q=p` desde el browser. Tests de curl sin auth solo confirman `401`, no validan el flow real con sesión.
- **Bug raíz vs síntoma cascada** — un solo `addEventListener` sobre elemento `null` (modal `finalize` faltante en `main.html`) generaba TDZ en `userList` y media docena de errores aparentemente no relacionados. Fix cosmético en `userList` solo enmascaraba; arreglar el HTML faltante resolvió todo.

## Receta para replicar el patrón

Plantilla: `src/modules/servicios/`. Por cada módulo:

1. **Crear** `src/modules/<modulo>/`.
2. **Schema** (`<modulo>.schema.js`): exportar Zod schemas para body/params/query con preprocessing que replique la coerción del código actual.
3. **Repository** (`<modulo>.repository.js`): mover **tal cual** las queries SQL. Sin `req`/`res`. Aceptar `tx` opcional cuando forme parte de una transacción.
4. **Service** (`<modulo>.service.js`): reglas de negocio. Llamar al repository. Lanzar `NotFoundError`/`ConflictError`/`ForbiddenError`/`ValidationError`/`UnauthorizedError` desde `shared/errors/AppError`. Usar `withTransaction` para flujos transaccionales. Sin SQL, sin Express.
5. **Controller** (`<modulo>.controller.js`): solo extraer datos del request, llamar al service, responder. Sin `try/catch`. Sin lógica.
6. **Routes** (`<modulo>.routes.js`): definir endpoints + middleware (`validate`, `requireAdmin`, `asyncHandler`).
7. **Strings mágicos** (`'admin'`, `'PENDIENTE'`, etc.): centralizar en `shared/constants/`.
8. **Mount en `src/server.js`**: importar el router del módulo nuevo.
9. **Borrar** el archivo viejo en `back/routes/` después de probar.

Reglas que se siguieron y conviene mantener:

- **Mover ≠ reescribir.** Las queries SQL y el bloque PDFkit se trasladaron literales.
- **Bug encontrado en código original → no se arregla aquí.** Se anota arriba.
- **Comportamiento HTTP-equivalente.** Mismos paths, mismos shapes, mismos status codes, mismos mensajes de error.
- **Logs preservados.** `[REQ]`, `[DB]`, `[SERVER]`, `[SERV]`, `[NOTAS]`, `[CLIENTES]`, `[AUTH]` siguen apareciendo igual. `[ERR]` añadido para errores no tipados.
- **Commits chicos** (uno por archivo grande / por capa).
