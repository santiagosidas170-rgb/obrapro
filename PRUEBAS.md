# Pruebas de ObraPro

## Pruebas automáticas

Se corren con `bash pruebas/ejecutar.sh` (necesita Node.js, Playwright con Chromium y Python). Usan un navegador Chromium de escritorio, **no** la tablet real.

| Archivo | Comprobaciones | Qué cubre |
| --- | --- | --- |
| `test_calc.js` | 78 | Fórmulas: superficies (rectangular, irregular, cm, pies), perímetro, muros, dinero en centavos, desperdicio, indirectos, utilidad, IVA, lectura de precios y porcentajes, resumen de cobros y gastos. |
| `e2e.js` | 31 | Proyectos, espacios, validaciones, borrador, archivar, eliminar en cascada, copia y restauración básica, sin conexión. |
| `design.js` | 36 | Diseño, responsive, animaciones, íconos, manifiesto y caché del Service Worker. |
| `splash.js` | 22 | Pantalla de bienvenida y logo. |
| `fotos-test.js` | 85 | Fotos: carga, compresión, orientación, galería, dibujo de medidas con ratón y toque, deshacer, guardar imagen. |
| `presupuesto-test.js` | 90 | Catálogo, conceptos, cantidades medida/estimada/confirmada, presupuesto, IVA con confirmación, caso de referencia $10,792.73. |
| `seguimiento-test.js` | 48 | Actualización de la base vieja sin perder datos, pagos, gastos, bitácora con fotos, resumen financiero, estado de pagos en el reporte (sin gastos), copia y borrado en cascada. |
| `reporte-test.js` | 56 | Datos y firmas, selección de espacios, contenido del reporte, PDF propio y por impresión, tablet y celular. |
| `backup-test.js` | 24 | Copia con 40 fotos (7 MB): ida y vuelta idéntica byte a byte, archivos dañados, copia vieja, registros inválidos. |
| `tabla-ancho.js` | 12 | La tabla de conceptos cabe completa en cada tamaño de pantalla. |

**Total: 482 comprobaciones, todas correctas** en la última corrida.

### Problemas que las pruebas encontraron y se corrigieron

- Una restauración con un registro de identificador inválido **borraba los datos actuales** y luego fallaba. Ahora todo se valida antes y cualquier error cancela la operación completa.
- Una copia sin sección de datos provocaba un error en pantalla; ahora se rechaza con un aviso.
- Restaurar una copia con fotos incompletas no avisaba; ahora dice cuántas no se recuperaron.
- El PDF por impresión salía con fondo oscuro en los márgenes.
- El PDF propio mostraba un texto técnico bajo las celdas de las tablas.
- Pantallas con desbordes horizontales en celular y tablet, y columna Subtotal oculta en tablet horizontal.

## Lo que NO se ha probado

Todo lo que depende del equipo real. Esta lista es para revisarla en la Huawei MatePad 11.5 (HarmonyOS 4.3, con teclado físico):

- [ ] Instalar la app desde el navegador y abrirla desde el ícono.
- [ ] Abrirla en modo avión después de haberla usado una vez con internet.
- [ ] Cámara: tomar una foto desde la app (permisos del navegador) y elegir una de la galería.
- [ ] Dibujar una medida en una foto con el dedo y con el lápiz, sin que la pantalla se desplace.
- [ ] Capturar texto y precios con el teclado físico (Tab para avanzar, Enter para aceptar).
- [ ] Descargar el PDF y encontrarlo en Descargas; abrirlo; probar **Compartir PDF**.
- [ ] Que el PDF se vea bien (logo, fotos con medidas, tablas, firmas) y que las fotos no salgan deformes.
- [ ] Firmar con el dedo (firma del cliente y firma propia).
- [ ] Descargar una copia de seguridad, borrar un proyecto de prueba y restaurar la copia.
- [ ] Probar con un proyecto real grande (muchas fotos) y revisar que no se trabe ni se llene el almacenamiento.
- [ ] Registrar un pago y un gasto con el teclado físico y revisar que el resumen cuadre con tus cuentas.
- [ ] Crear una entrada de bitácora con una foto tomada con la cámara.
- [ ] Girar la tablet (vertical y horizontal) y revisar que nada se corte.
- [ ] Actualización: publicar una versión nueva y confirmar que la tablet la toma (versión en Ajustes).

Si algo falla, anota en qué pantalla estabas y qué esperabas que pasara.
