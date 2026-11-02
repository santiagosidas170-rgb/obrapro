# ObraPro

Aplicación web progresiva (PWA) para levantamientos de obra y remodelación.
Funciona sin internet y guarda los datos solo en el dispositivo.

**Versión:** 0.5.0 (rediseño grafito)

> Las medidas son capturadas por el usuario y deben verificarse en campo.

## Qué incluye

- Proyectos: crear, editar, buscar, filtrar por estado, archivar y eliminar.
- Borrador automático del formulario de proyecto nuevo.
- Espacios por proyecto: rectangulares o irregulares (tramos que suman o restan).
- Unidades: metros, centímetros y pies (todo se convierte a metros antes de calcular).
- Superficie de piso, perímetro y superficie bruta de muros.
- Guardado automático en el dispositivo (IndexedDB) y copia de seguridad (descargar, compartir, restaurar).
- Funcionamiento sin conexión (Service Worker).
- Diseño en tema grafito con tipografía Lato (incluida en la app), adaptable a celular y tablet,
  con animaciones suaves que se desactivan si el dispositivo pide "reducir movimiento".

## Estructura

```
wrangler.jsonc      Configuración de Cloudflare (publica la carpeta public/)
public/             Todo lo que se publica
  index.html        Estructura de la app
  styles.css        Diseño
  calc.js           Fórmulas de medidas y dinero
  db.js             Guardado local y copias de seguridad
  app.js            Pantallas y navegación
  sw.js             Funcionamiento sin internet
  manifest.json     Instalación en la pantalla de inicio
  _headers          Encabezados de seguridad y caché en Cloudflare
  favicon.*, icon-*.png, apple-touch-icon.png   Íconos
  fonts/            Lato (licencia SIL OFL 1.1)
```

## Despliegue automático (Cloudflare Workers)

Cloudflare está conectado a este repositorio: cada vez que se actualiza la rama `main`,
Cloudflare publica la carpeta `public/` sin pasos manuales.

Configuración del proyecto en Cloudflare:

- Nombre del Worker: `obrapro` (debe coincidir con `wrangler.jsonc`)
- Rama de producción: `main`
- Comando de compilación: *(vacío)*
- Comando de despliegue: `npx wrangler deploy`

## Al publicar cambios

Sube el número de versión de `CACHE` en la primera línea de `public/sw.js`.
La versión nueva aparece la segunda vez que se abre la app con internet.

## Privacidad

Los datos de los proyectos nunca se suben a este repositorio ni a ningún servidor.
Solo el código de la app es público.
