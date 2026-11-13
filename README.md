# ObraPro

Aplicación web progresiva (PWA) para levantamientos de obra y remodelación.
Funciona sin internet y guarda los datos solo en el dispositivo.

**Versión:** 0.9.0 (Etapa 7: reporte)

> Las medidas son capturadas por el usuario y deben verificarse en campo.

## Qué incluye

- Proyectos: crear, editar, buscar, filtrar por estado, archivar y eliminar.
- Borrador automático del formulario de proyecto nuevo.
- Espacios por proyecto: rectangulares o irregulares (tramos que suman o restan).
- Unidades: metros, centímetros y pies (todo se convierte a metros antes de calcular).
- Superficie de piso, perímetro y superficie bruta de muros.
- Fotos: tomar con la cámara o elegir de la galería, comprimidas (máx. 1600 px) y asociadas a un proyecto y a un espacio, con descripción y tipo (general, daño, acabado, instalación).
- Dibujo de medidas sobre cada foto (líneas con su valor y notas de texto, 4 colores, mover, ajustar extremos, deshacer). La foto original no cambia; se puede guardar o compartir una imagen con las medidas dibujadas.
- Catálogo de conceptos con **tus propios precios** (material y mano de obra por unidad). ObraPro no trae precios: solo ofrece una lista de conceptos básicos, sin precios, para llenar.
- Conceptos de cada proyecto con cantidad **medida, estimada o confirmada** (la medida se toma de un espacio: piso, muros o perímetro, y avisa si luego cambia), desperdicio solo sobre el material y subtotal.
- Presupuesto: materiales, mano de obra, costo directo, indirectos y utilidad (porcentajes configurables), IVA que **no se suma sin que lo confirmes**, total estimado en MXN, notas, vigencia y condiciones.
- Reporte en PDF: eliges qué **espacios** y qué contenido incluir (fotos con las medidas dibujadas, conceptos, presupuesto, recuadros de firma). Lleva tus datos, logo y firma (se capturan en Ajustes) y la firma del cliente tomada en la tablet con la fecha. Se genera con la ventana de impresión del navegador: elige "Guardar como PDF".
- Guardado automático en el dispositivo (IndexedDB) y copia de seguridad que incluye fotos, catálogo, conceptos, presupuestos, logo y firmas (descargar, compartir, restaurar).
- Funcionamiento sin conexión (Service Worker).
- Pantalla de bienvenida con el logo (toca para saltarla) y paleta tomada del logo: grafito cálido y bronce `#9f7a5a`.
- Tipografía Lato (incluida en la app), adaptable a celular y tablet, con animaciones suaves que se desactivan
  si el dispositivo pide "reducir movimiento".

## Estructura

```
wrangler.jsonc      Configuración de Cloudflare (publica la carpeta public/)
public/             Todo lo que se publica
  index.html        Estructura de la app
  styles.css        Diseño
  calc.js           Fórmulas de medidas y dinero (centavos enteros)
  db.js             Guardado local y copias de seguridad (con fotos)
  fotos.js          Fotos: captura, galería y dibujo de medidas
  presupuesto.js    Catálogo, conceptos del proyecto y presupuesto
  reporte.js        Datos del contratista, firma y reporte en PDF
  app.js            Pantallas y navegación
  sw.js             Funcionamiento sin internet
  manifest.json     Instalación en la pantalla de inicio
  _headers          Encabezados de seguridad y caché en Cloudflare
  logo.png, logo-sm.png                       Logo con fondo transparente (color #9f7a5a)
  favicon.ico, favicon-32.png, icon-*.png, apple-touch-icon.png   Íconos con el logo
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

## Fórmulas del presupuesto

- Material de un concepto = cantidad × precio de material × (1 + % de desperdicio)
- Mano de obra de un concepto = cantidad × precio de mano de obra
- Costo directo = suma de los subtotales
- Indirectos = costo directo × %
- Utilidad = (costo directo + indirectos) × %
- Subtotal = costo directo + indirectos + utilidad
- IVA = subtotal × %, solo si el usuario lo activa y lo confirma
- Total estimado = subtotal + IVA

Todos los importes se calculan en centavos enteros y se redondean a centavos.
