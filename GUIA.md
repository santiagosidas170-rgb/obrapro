# Guía de uso de ObraPro

ObraPro sirve para hacer levantamientos de obra y remodelación: medir espacios, tomar fotos con medidas dibujadas, armar el presupuesto y entregar un reporte en PDF. Funciona sin internet y guarda todo **solo en tu tablet**.

## 1. Instalar en la tablet

1. Abre la dirección de ObraPro en el navegador de la tablet (con internet, solo la primera vez).
2. En el menú del navegador elige **Instalar app** o **Agregar a pantalla de inicio**.
3. Abre ObraPro desde su ícono. A partir de ahí funciona sin internet.

Cuando publiques una versión nueva, abre la app con internet una vez, ciérrala por completo y vuelve a abrirla. En **Ajustes → Acerca de** verás el número de versión.

## 2. Flujo de trabajo

1. **Proyecto nuevo.** Captura nombre y cliente (lo demás es opcional). El formulario guarda un borrador por si se interrumpe.
2. **Espacios.** Agrega cada espacio con su largo, ancho y alto, en metros, centímetros o pies. Si el espacio no es rectangular, usa **Irregular** y suma o resta tramos. La app calcula superficie, perímetro y superficie bruta de muros (no descuenta puertas ni ventanas).
3. **Fotos.** Toma la foto con la cámara o elígela de la galería, y asígnala a un espacio. Ábrela para **dibujar medidas** (línea con su valor) y notas de texto en 4 colores. La foto original no se modifica.
4. **Catálogo.** En el menú, captura tus conceptos con **tus propios precios** de material y mano de obra. ObraPro no trae precios; el botón de conceptos básicos solo agrega nombres sin precio.
5. **Conceptos del proyecto.** Agrega conceptos desde el catálogo. La cantidad puede tomarse de un espacio (piso, muros o perímetro) y queda como **Medida**; si la escribes tú queda **Estimada**, y puedes marcarla **Confirmada**. El desperdicio se aplica solo al material.
6. **Presupuesto.** Elige indirectos y utilidad. El **IVA no se suma** hasta que lo actives y lo confirmes. Agrega notas, vigencia y condiciones.
7. **Obra (seguimiento y pagos).** Cuando el proyecto arranca, usa la pestaña **Obra**:
   - **Estado** del proyecto (pendiente, en levantamiento, presupuestado, en ejecución, terminado).
   - **Pagos recibidos:** anota cada anticipo o estimación con su fecha, monto y forma de pago. La app te dice cuánto has cobrado y cuánto falta por cobrar del presupuesto.
   - **Gastos reales:** anota lo que realmente gastas (material, mano de obra, transporte, etc.). La app compara contra el costo directo presupuestado y calcula tu **utilidad a la fecha** (cobrado − gastado).
   - **Bitácora:** un diario de la obra con fecha y notas, y **fotos de avance** en cada entrada.
   - Los gastos y la utilidad son solo para ti y **nunca salen en el reporte**. Si quieres, el reporte puede llevar un **Estado de pagos** para el cliente.
8. **Reporte.** Elige qué espacios y qué contenido incluir, pide la firma del cliente en la pantalla y toca **Ver reporte → Descargar PDF**.

### Cómo se calcula el presupuesto

- Material = cantidad × precio de material × (1 + desperdicio %)
- Mano de obra = cantidad × precio de mano de obra
- Costo directo = suma de todos los conceptos
- Indirectos = costo directo × %
- Utilidad = (costo directo + indirectos) × %
- Subtotal = costo directo + indirectos + utilidad
- IVA = subtotal × % (solo si lo activas)
- Total = subtotal + IVA

Todo en pesos mexicanos con 2 decimales. Las medidas se convierten a metros antes de calcular.

## 3. El reporte en PDF

- En **Ajustes → Datos para el reporte** captura tu nombre o empresa, teléfono, correo, logo y firma. Si no subes un logo, se usa el de ObraPro.
- Si dejas espacios fuera del reporte, el presupuesto del reporte solo suma los conceptos de los espacios incluidos y lo dice en la hoja.
- Las cantidades estimadas salen con un asterisco.
- **Estado de pagos** (opcional, viene sin marcar): lista los pagos que recibiste y el saldo por pagar. Si dejas espacios fuera del reporte, solo lista los pagos, sin calcular saldo. Nunca incluye tus gastos.
- El PDF queda en la carpeta **Descargas**. Si el botón no descarga, usa **Abrir PDF** o **Compartir PDF**.
- Cada página del PDF es una imagen: se ve igual en cualquier lector, pero el texto no se puede copiar.

## 4. Copias de seguridad (importante)

Tus datos **solo existen en la tablet**. Si borras los datos del navegador, desinstalas la app o pierdes la tablet, se pierden.

- Ve a **Ajustes → Copia de seguridad → Descargar copia** (o **Compartir copia** para mandarla por correo o WhatsApp). La copia incluye proyectos, espacios, fotos con sus medidas, catálogo, conceptos, presupuestos, pagos, gastos, bitácora, logo y firmas.
- Hazla **cada vez que termines de trabajar en un proyecto**, y guárdala fuera de la tablet (correo, computadora o USB). La app te avisa cuando pasan más de 7 días sin copia.
- Una copia puede pesar varios MB por las fotos. Contiene datos de tus clientes: guárdala en un lugar seguro.
- **Restaurar copia** reemplaza **todo** lo que hay en la app. Si el archivo está dañado o no es de ObraPro, la app lo rechaza y no cambia nada. Si le faltan fotos, restaura el resto y te dice cuántas no pudo recuperar.
- Para pasar tus datos a otra tablet: haz una copia en la vieja, instala ObraPro en la nueva y restaura ahí el archivo.

## 5. Problemas comunes

| Problema | Qué hacer |
| --- | --- |
| No veo los cambios de una versión nueva | Abre la app con internet, ciérrala por completo y ábrela otra vez. Revisa la versión en Ajustes. |
| La cámara no abre | Permite la cámara para el navegador en los ajustes de la tablet (Ajustes del sistema → Apps → navegador → Permisos). Mientras tanto puedes elegir fotos de la galería. |
| Una medida no se guarda | Usa solo números con punto o coma decimal; la medida debe ser mayor que cero. |
| El PDF sale sin mis fotos | Revisa que estén marcadas **Fotos de cada espacio** y que el espacio esté incluido. |
| "No se pudo guardar" | Puede faltar espacio en la tablet. Haz una copia, libera espacio y reintenta. |
| Pasó algo raro con mis datos | No restaures ni borres nada. Haz una copia desde Ajustes y guárdala antes de intentar otra cosa. |

## 6. Privacidad

ObraPro no envía datos a ningún servidor. Cualquier persona con la tablet desbloqueada puede ver tus proyectos: usa bloqueo de pantalla.
