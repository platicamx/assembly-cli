# @platicamx/assembly-cli

CLI del equipo para crear y administrar apps de Assembly: SvelteKit + Supabase
desplegadas en Cloud Run, a partir de `platicamx/svelte-saas-template`.

```bash
npm i -g @platicamx/assembly-cli
assembly login
assembly create mi-app --owner owner@cliente.com --company "Cliente S.A."
```

`create` crea el repo en GitHub, el proyecto de Supabase, el servicio de Cloud Run y el usuario
owner (contraseña temporal, se muestra una sola vez), corre las migraciones, despliega, clona el
repo y deja el `.env` listo. Si se interrumpe, vuelve a correrlo y retoma donde se quedó.

| Comando | Qué hace |
|---|---|
| `assembly login` / `logout` / `whoami` | Sesión con tu cuenta del portal |
| `assembly create <nombre> --owner <correo>` | Crea y despliega una app nueva |
| `assembly list` | Apps del equipo |
| `assembly status <nombre>` | Estado, URL y enlaces |
| `assembly env pull <nombre>` | `.env` con tu llave personal de Supabase (revoca la anterior) |
| `assembly deploy <nombre>` | Migra y despliega `main` |
| `assembly secrets set\|list\|unset <nombre> [NOMBRE]` | Llaves de APIs externas en producción (Secret Manager → Cloud Run) |
| `assembly logs <nombre> [-f] [--errors] [--since 2h]` | Logs de producción de la app |
| `assembly reset-owner <nombre>` | Nueva contraseña temporal para el owner |
| `assembly destroy <nombre>` | Elimina Cloud Run, Supabase y secretos; archiva el repo |

Los comandos funcionan igual para personas y agentes: fuera de una terminal interactiva (agentes, CI)
la salida es texto plano, sin animaciones, y `secrets set` lee el valor de stdin.

## Seguridad

- El CLI no contiene credenciales de la empresa. Habla solo con el servicio de Assembly, que guarda
  los tokens de GitHub, Supabase y GCP en Secret Manager.
- `assembly login` usa un código de un solo uso con PKCE y una redirección a `127.0.0.1`. El token
  se guarda en `~/.config/assembly/credentials.json` con permisos `600`, vence en 60 días y se
  revoca con `assembly logout`.
- Cada `.env` lleva una llave secreta de Supabase **personal**: `env pull` revoca la anterior, y un
  admin puede revocar cualquiera sin afectar a los demás.
- Dependencias mínimas (`@clack/prompts`). Las versiones se publican desde GitHub Actions con
  *trusted publishing* y *provenance*; no existe ningún token de npm.

## Desarrollo

```bash
npm install
npm run build
ASSEMBLY_API_URL=http://localhost:5173 node dist/index.js login   # contra assembly-systems local
```

Publicar: sube la versión en `package.json`, haz commit y crea un release `vX.Y.Z` en GitHub.
