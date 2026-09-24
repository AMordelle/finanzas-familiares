# Despliegue privado en Cloudflare Workers

Este procedimiento publica Finanzas Familiares en:

`https://finanzas-familiares.amordelle.workers.dev/`

La aplicación contiene datos financieros reales. El despliegue solo se considera válido cuando Cloudflare Access bloquea el acceso anónimo y permite exclusivamente el correo autorizado.

## Política inicial de acceso

- Método: código de un solo uso por correo electrónico (OTP).
- Único correo permitido: `wilcas0207@gmail.com`.
- No guardar el correo como variable de la aplicación: la autorización pertenece a Cloudflare Access.
- No agregar dominios completos, grupos amplios ni reglas `Everyone`.
- `/api/health` debe quedar protegido por la misma aplicación de Access.

Cloudflare Access es el perímetro inicial. No reemplaza Supabase Auth, el cierre del acceso anónimo de la Data API ni las políticas RLS por hogar.

## Requisitos previos

- Trabajar desde el `main` aprobado y limpio.
- Node.js `>=22.12.0`.
- Wrangler autenticado en la cuenta cuyo subdominio es `amordelle`.
- Copia de respaldo reciente de Supabase validada.
- Valores de producción disponibles fuera del repositorio:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL`
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL` (opcional)
- Una ventana breve de mantenimiento para completar y verificar Access.

Nunca incluir valores reales en Git, `wrangler.jsonc`, documentación, capturas o archivos `.env` versionados.

## 1. Validación previa

Desde una instalación limpia:

```powershell
npm ci
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run build:vinext
npx vinext check
npx wrangler deploy --dry-run --config dist/server/wrangler.json
```

La suite, TypeScript, ambos builds, Vinext y el dry-run deben terminar correctamente. Los avisos históricos de ESLint pueden permanecer si son exactamente los ya documentados y no aparecen errores o advertencias nuevas.

Confirmar además la cuenta activa:

```powershell
npx wrangler whoami
```

No continuar si la cuenta no corresponde al subdominio `amordelle`.

## 2. Crear el Worker seguro antes de cargar datos reales

Para evitar una ventana pública con acceso a datos reales:

1. En Cloudflare, crear un Worker vacío o de marcador con el nombre exacto `finanzas-familiares`.
2. No cargar todavía secretos de producción ni desplegar la aplicación real.
3. En **Workers & Pages → finanzas-familiares → Settings → Domains & Routes**, habilitar Cloudflare Access para la ruta `workers.dev`.
4. Configurar autenticación mediante OTP por correo.
5. Crear una política `Allow` que incluya solamente `wilcas0207@gmail.com`.
6. Confirmar que no exista ninguna regla adicional que permita acceso anónimo, dominios completos o todos los usuarios.
7. Abrir la URL en una ventana privada y comprobar que Cloudflare muestra el inicio de sesión antes de responder el Worker.

Si Cloudflare no permite proteger el Worker de marcador o la ruta esperada no es exactamente la acordada, detener el proceso. No desplegar la aplicación real.

## 3. Configurar secretos

Con Access ya activo, cargar los valores exclusivos del servidor mediante Wrangler o el panel de Cloudflare:

```powershell
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.jsonc
npx wrangler secret put DATABASE_URL --config wrangler.jsonc
npx wrangler secret put OPENAI_API_KEY --config wrangler.jsonc
```

Configurar `OPENAI_MODEL` solamente cuando se necesite sobrescribir el valor predeterminado.

Las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` son públicas por diseño y deben estar disponibles en el entorno controlado de compilación. No deben escribirse en archivos versionados.

Después de cada comando, revisar que la terminal no haya impreso el valor introducido.

## 4. Desplegar la aplicación

Con la rama aprobada integrada en `main` y Access ya verificado:

```powershell
git switch main
git pull --ff-only
npm ci
npm run build:vinext
npm run deploy:vinext
```

El nombre configurado debe continuar siendo `finanzas-familiares`. No cambiar el punto de entrada `vinext/server/fetch-handler` ni introducir un Worker personalizado.

## 5. Validación posterior

### Usuario autorizado

1. Abrir la URL en una ventana privada.
2. Solicitar el código para `wilcas0207@gmail.com`.
3. Completar el acceso.
4. Validar:
   - página principal;
   - Dashboard;
   - Registro conversacional;
   - Cuentas;
   - Movimientos y filtros;
   - Análisis;
   - Extras;
   - Cierre;
   - `/api/health`.
5. Confirmar una interpretación conversacional sin guardar un movimiento de prueba innecesario.
6. Confirmar que no aparecen secretos en la interfaz, consola del navegador ni respuestas HTTP.

### Acceso no autorizado

1. Abrir otra ventana privada sin sesión.
2. Confirmar que la aplicación no carga y que aparece Cloudflare Access.
3. Intentar un correo distinto.
4. Confirmar que no recibe acceso.
5. Solicitar directamente `/api/health` sin sesión y confirmar que también queda protegido.

### Regresión local

Después del despliegue, comprobar que `npm run dev` continúa funcionando sin requerir una sesión de Cloudflare Access.

## 6. Reversión

Revertir o retirar el despliegue si ocurre cualquiera de estos casos:

- acceso anónimo a la aplicación o a `/api/health`;
- URL diferente a la acordada;
- pérdida de conexión con Supabase;
- secretos ausentes o expuestos;
- errores funcionales graves no presentes en local.

Acciones inmediatas:

1. Deshabilitar o retirar la versión desplegada desde Cloudflare.
2. Mantener Cloudflare Access activo mientras se diagnostica.
3. No ampliar temporalmente la política de acceso.
4. Restaurar la versión anterior únicamente si estaba protegida y validada.
5. Registrar el incidente y su causa antes de intentar otro despliegue.

## Límites de esta fase

Este procedimiento no modifica Supabase, no crea migraciones, no implementa Supabase Auth o RLS y no automatiza despliegues desde GitHub. Esas capas deben abordarse en cambios separados.
