# PanasAyudan

App de emergencia para distribución de insumos en Venezuela. Quien tiene algo
para dar lo publica en un mapa; los voluntarios reservan y coordinan la recogida.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Realtime + RLS + pg_cron)
- Google Maps JS API (Places Autocomplete + MarkerClusterer + Distance Matrix)
- PWA (manifest + service worker), modo oscuro forzado

## Requisitos

- Node.js 18.18+ (recomendado 20+)
- Un proyecto en Supabase
- Una API key de Google Maps con **Maps JavaScript API**, **Places API (New)** y
  **Distance Matrix API** habilitadas. La Places API legacy no funciona con keys
  nuevas; el autocomplete usa `PlaceAutocompleteElement` (Places API nuevo).
- Un **Map ID** (Google Cloud → Map Management), requerido por los marcadores
  avanzados (`AdvancedMarkerElement`). El tema oscuro del mapa se define en la
  consola sobre ese Map ID: con `mapId` presente, los estilos inline se ignoran.

## Configuración

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia las variables de entorno y complétalas:

   ```bash
   cp .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

3. Ejecuta las migraciones SQL en tu proyecto de Supabase (SQL Editor),
   en orden numérico: esquema, RLS, RPC, cron y la política de lectura de
   recogidas. `pg_cron` debe estar habilitado en el proyecto.

4. Levanta el entorno de desarrollo:

   ```bash
   npm run dev
   ```

## Estructura

```
src/
  app/            Rutas (App Router): / · /buscar · /dar · /lugar/[id] · /voluntarios
  components/     Mapa, formularios, panel de voluntarios, utilidades de UI
  hooks/          Suscripciones Realtime y carga de recogidas
  lib/            Cliente Supabase, tipos, geo, Google Maps y capa de datos
public/           manifest.json y service worker
```

## Notas

- Modo oscuro siempre activo; no hay toggle de tema.
- El contacto del aporte nunca se expone en lecturas públicas: solo los
  voluntarios lo ven, vía RPC, usando su token.
- Las reservas expiran a las 4 horas y se liberan automáticamente (pg_cron).
- El token de voluntario se muestra una sola vez al registrarse y se guarda
  en `localStorage`. No se puede recuperar.

## Deploy

Despliegue nativo en Vercel. Configura las tres variables de entorno en el
panel del proyecto. El service worker y el manifest se sirven desde `public/`.
