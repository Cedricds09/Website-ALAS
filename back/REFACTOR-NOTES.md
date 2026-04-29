# Refactor backend ALAS — notas de migración

## Qué se movió

### Estructura nueva (creada)

```
back/
├── src/
│   ├── server.js                                  ← entry point nuevo
│   ├── modules/
│   │   └── servicios/
│   │       ├── servicios.routes.js
│   │       ├── servicios.controller.js
│   │       ├── servicios.service.js
│   │       ├── servicios.repository.js
│   │       └── servicios.schema.js
│   └── shared/
│       ├── config/env.js                          ← carga + valida .env, falla rápido
│       ├── db/
│       │   ├── pool.js                            ← migración funcional de db.js
│       │   └── transaction.js                     ← helper withTransaction
│       ├── errors/AppError.js                     ← AppError + Validation/Unauthorized/Forbidden/NotFound/Conflict
│       ├── middleware/
│       │   ├── async-handler.js
│       │   ├── error.middleware.js
│       │   ├── validate.middleware.js             ← valida con Zod
│       │   └── auth.middleware.js                 ← requireAdmin/requireRole; re-exporta requireAuth
│       ├── constants/
│       │   ├── estados.js                         ← ESTADO_SERVICIO, ESTADO_NOTA, ESTADOS_ACTIVOS
│       │   └── roles.js                           ← ROL.ADMIN, ROL.TECNICO
│       ├── utils/
│       │   ├── consecutivos.js                    ← formatNotaCode, formatClienteCode
│       │   └── formatters.js                      ← fmtFecha, fmtMoney
│       └── integrations/pdf-reporte.service.js    ← PDF reporte técnico (movido íntegro)
├── routes/                                        ← módulos NO migrados (intactos)
│   ├── auth.js                                    ← sigue exportando requireAuth + router
│   ├── notas.js
│   ├── clientes.js
│   ├── usuarios.js
│   └── config.js
├── scripts/
│   └── seed-admin.js                              ← import actualizado a src/shared/db/pool
├── db.js                                          ← shim: re-exporta src/shared/db/pool
└── server.js                                      ← legacy, queda como referencia (npm scripts apuntan al nuevo)
```

### Reescritos / actualizados

- `back/package.json`: `engines.node>=18`, scripts (`start: src/server.js`, `dev: nodemon`, `lint`, `format`), deps `zod`, dev deps `nodemon eslint prettier eslint-config-prettier`.
- `back/.env.example`: contrato vacío con todas las variables requeridas + opcionales documentadas.
- `back/.eslintrc.json`, `back/.prettierrc`: configuración mínima razonable.
- `.gitignore` (raíz): reescrito en UTF-8 sin BOM. Antes estaba en UTF-16 LE y git no lo respetaba — `.env` y `node_modules/` quedaron trackeados durante meses. Sacados del index con `git rm --cached`.
- `back/db.js`: convertido en un shim (`module.exports = require('./src/shared/db/pool')`) para que routers no migrados sigan funcionando sin cambios.
- `back/scripts/seed-admin.js`: solo cambia el import del pool al nuevo path.

### Sin tocar (intencionalmente)

- `back/routes/auth.js` — sigue siendo la fuente de `requireAuth` y de `/api/admin/login,logout,check`.
- `back/routes/notas.js`, `back/routes/clientes.js`, `back/routes/usuarios.js`, `back/routes/config.js` — montan tal cual desde `src/server.js`.
- `back/server.js` — legacy. Como `package.json.main` ahora apunta a `src/server.js` y los scripts también, este archivo queda como referencia. Puede borrarse cuando el equipo confirme estabilidad.
- `front/` — completamente intocable.
- Esquema de base de datos — sin cambios.

## Contrato HTTP — sin cambios

Verificación manual con curl:

| Endpoint | Status sin auth | Shape | Comportamiento |
|---|---|---|---|
| `GET /api/health` | 200 (con DB OK) / 500 (con DB caída) | `{ ok, db, error? }` | idéntico |
| `GET /api/servicios` | 401 `{ ok:false, error:'No autorizado' }` | idéntico | sin tocar |
| `GET /api/servicios/abc/reporte` (id inválido) | 401 (auth corre antes) | idéntico | sin tocar |
| `POST /api/servicios` (body inválido autenticado) | 400 con mensaje Zod legible | shape `{ ok:false, error }` | mensaje más limpio que antes |

Routers Express verificados: las **11 rutas** del módulo servicios quedan registradas con los mismos verbos y paths que el original.

## TODOs detectados (no arreglados — fuera de scope)

1. **`requireAdminInline`** en `routes/usuarios.js` — duplicación similar al que se eliminó en servicios. Mover a `requireAdmin` cuando se migre el módulo usuarios.
2. **`back/server.js` legacy** — borrar cuando el equipo verifique 1-2 semanas de operación con `src/server.js`.
3. **`back/db.js` shim** — borrar cuando todos los módulos migren a `src/shared/db/pool`.
4. **Notas vinculadas a servicio terminado** — el lookup por id en `obtenerNota` usa `buscarPorId` que filtra `activo=1` no, sí lo trae. Pero si soft-deleta, las funciones que aún esperan ese ID por path ya no encuentran. Actualmente no es bug (frontend solo llama estos endpoints sobre items que vio en la lista, y la lista filtra activos). Anotado para cuando aparezca.
5. **DB conexión** — durante la verificación final el `sa` rechazó login. Probable lockout por intentos previos o cambio externo. NO es del refactor: el código nuevo y el viejo fallan idénticamente. Verificar credenciales y/o reiniciar SQL Server.
6. **Logs de seguridad** — el middleware de errores loggea stack en server pero no expone al cliente. OK para producción. Considerar `winston`/`pino` cuando crezca.
7. **Tests** — carpeta `tests/` aún no creada. La estructura del refactor permite añadir Jest/Vitest fácilmente sobre `service`/`repository` sin tocar Express.
8. **`require('dotenv').config()` en `back/server.js` legacy** — el legacy ya no se usa, pero si alguien lo arranca por error fallará al cargar `db.js` shim que ahora valida env vía `env.js`. Comportamiento aceptable (falla rápido).

## Receta para replicar el patrón en otros módulos

Usar como plantilla `src/modules/servicios/`. Por cada módulo (notas, clientes, usuarios, auth, config):

1. **Crear** `src/modules/<modulo>/`.
2. **Schema** (`<modulo>.schema.js`): exportar Zod schemas para body/params/query con preprocessing que replique la coerción del código actual (`String().trim()`, `Number()`).
3. **Repository** (`<modulo>.repository.js`): mover **tal cual** las queries SQL desde `routes/<modulo>.js`. Funciones puras, sin `req`/`res`. Aceptar `tx` opcional cuando la query forme parte de una transacción.
4. **Service** (`<modulo>.service.js`): reglas de negocio. Llamar al repository. Lanzar `NotFoundError`/`ConflictError`/`ForbiddenError`/`ValidationError` desde `shared/errors/AppError`. Usar `withTransaction` para flujos transaccionales. Sin SQL, sin Express.
5. **Controller** (`<modulo>.controller.js`): solo extraer datos del request, llamar al service, responder. Sin `try/catch`. Sin lógica.
6. **Routes** (`<modulo>.routes.js`): definir endpoints + middleware (`validate`, `requireAdmin`, `asyncHandler`).
7. **Strings mágicos** (`'admin'`, `'PENDIENTE'`, etc.): centralizar en `shared/constants/`.
8. **Mount en `src/server.js`**: cambiar el import de `../routes/<modulo>` a `./modules/<modulo>/<modulo>.routes`.
9. **Borrar** `back/routes/<modulo>.js` después de probar.

Reglas que se siguieron y conviene mantener:

- **Mover ≠ reescribir.** Las queries SQL y el bloque PDFkit se trasladaron literales a su nueva casa.
- **Bug encontrado en código original → no se arregla aquí.** Se anota arriba.
- **Comportamiento HTTP-equivalente.** Mismos paths, mismos shapes, mismos status codes.
- **Logs preservados.** `[REQ]`, `[DB]`, `[SERVER]`, `[SERV]` siguen apareciendo igual. `[ERR]` añadido para errores no tipados.
- **Commits chicos** (uno por archivo grande / por capa).
