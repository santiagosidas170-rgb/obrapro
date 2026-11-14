const { chromium } = require('playwright');
const fs = require('fs');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
fs.mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8123/';
const { execSync } = require('child_process');
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('✔', n); } else { fail++; console.log('✘', n, x); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SKIP = () => { try { sessionStorage.setItem('obrapro-splash', '1'); } catch (e) {} };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1228, height: 800 }, acceptDownloads: true, locale: 'es-MX' });
  await ctx.addInitScript(SKIP);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

  /* ---------- A. Actualizar una base de datos vieja (versión 1) sin perder nada ---------- */
  await page.goto(BASE + 'manifest.json');                 /* mismo origen, sin cargar la app */
  await page.evaluate(() => new Promise((res, rej) => {
    const rq = indexedDB.open('obrapro', 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      for (const t of ['proyectos', 'espacios', 'fotos', 'catalogo', 'partidas', 'ajustes']) {
        const s = db.createObjectStore(t, { keyPath: 'id' });
        if (['espacios', 'fotos', 'partidas'].includes(t)) s.createIndex('proyectoId', 'proyectoId');
      }
    };
    rq.onsuccess = () => {
      const db = rq.result, tx = db.transaction(['proyectos', 'espacios'], 'readwrite');
      tx.objectStore('proyectos').put({ id: 'viejo', nombre: 'Proyecto de la versión 1', cliente: 'Ana', estado: 'presupuestado', tipoTrabajo: 'otro', archivado: false, creado: '2026-10-01', actualizado: '2026-10-01' });
      tx.objectStore('espacios').put({ id: 'ev', proyectoId: 'viejo', nombre: 'Cuarto', unidad: 'm', forma: 'rectangular', largo: 3, ancho: 2, orden: 0 });
      tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error);
    };
    rq.onerror = () => rej(rq.error);
  }));
  await page.goto(BASE); await page.waitForSelector('text=Proyecto de la versión 1');
  const est = await page.evaluate(async () => { const db = await abrirDB(); return { v: db.version, stores: Array.from(db.objectStoreNames).sort(), idx: Array.from(db.transaction('seguimiento').objectStore('seguimiento').indexNames) }; });
  check('A. La base vieja (v1) se actualiza a v2 y se crea "seguimiento" con su índice', est.v === 2 && est.stores.includes('seguimiento') && est.idx.includes('proyectoId'), JSON.stringify(est));
  check('A. Los datos de la versión anterior siguen ahí', await page.evaluate(async () => (await dbTodos('espacios')).length === 1 && (await dbObtener('proyectos', 'viejo')).cliente === 'Ana'));
  await page.evaluate(() => dbBorrarProyecto('viejo'));

  /* ---------- Datos de prueba: presupuesto de $2,750.00 sin IVA ---------- */
  const id = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa Obra', cliente: 'Juan López', estado: 'presupuestado', tipoTrabajo: 'remodelacion', fecha: '2026-11-02', archivado: false, creado: ahora(), actualizado: ahora(),
      presupuesto: { indirectos: 10, utilidad: 0, aplicarIva: false, iva: 16, notas: '', vigencia: '', condiciones: '' } };
    await dbGuardar('proyectos', pr);
    const esp = { id: nuevoId(), proyectoId: pr.id, nombre: 'Sala', tipo: 'Sala', unidad: 'm', forma: 'rectangular', largo: 4, ancho: 3.5, altura: 2.5, tramos: [], estadoActual: 'regular', trabajos: '', observaciones: '', orden: 0, creado: ahora(), actualizado: ahora() };
    await dbGuardar('espacios', esp);
    const pt = (d, esId, q, pm, pmo) => ({ id: nuevoId(), proyectoId: pr.id, espacioId: esId, descripcion: d, categoria: 'Pintura', unidad: 'm²', cantidad: q, precioMaterial: pm, precioManoObra: pmo, desperdicio: 0, tipoCantidad: 'confirmada', creado: ahora(), actualizado: ahora() });
    await dbGuardar('partidas', pt('Pintura', esp.id, 10, 10000, 5000));      /* 1,500.00 */
    await dbGuardar('partidas', pt('Limpieza', null, 1, 0, 100000));          /* 1,000.00 -> directo 2,500 ; +10 % = 2,750 */
    return { p: pr.id, e: esp.id };
  });
  const db = (tabla, f) => page.evaluate(async ([t, fn]) => { const x = await dbTodos(t); return fn ? x.filter(new Function('o', 'return ' + fn)) : x; }, [tabla, f || null]);
  const texto = async sel => (await page.textContent(sel)).replace(/\s+/g, ' ');

  /* ---------- B. La pestaña Obra ---------- */
  await page.goto(BASE + '#/proyecto/' + id.p + '/obra'); await page.waitForSelector('#ob-resumen');
  check('B. Existe la pestaña "Obra" y está activa', await page.isVisible('.tab.active:has-text("Obra")'));
  let r = await texto('#ob-resumen');
  check('B. Resumen inicial: presupuesto $2,750.00 (sin IVA), cobrado y gastado en cero', r.includes('Presupuesto (sin IVA)$2,750.00') && r.includes('Cobrado$0.00') && r.includes('Gastado$0.00'), r);
  await page.selectOption('#ob-estado', 'ejecucion'); await wait(400);
  check('B. Cambiar el estado se guarda y actualiza la etiqueta de arriba', (await db('proyectos'))[0].estado === 'ejecucion' && (await texto('#badge')).includes('En ejecución'));

  /* ---------- C. Pagos ---------- */
  await page.click('#ob-nuevo-pago'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-monto', ''); await page.click('dialog.dlg-form button[value=ok]');
  check('C. Pago sin monto: avisa y no se cierra', await page.isVisible('#fm-error') && (await texto('#fm-error')).includes('mayor que cero') && await page.isVisible('dialog.dlg-form[open]'));
  await page.fill('#fm-monto', 'mil pesos'); await page.click('dialog.dlg-form button[value=ok]');
  check('C. Monto con texto: avisa', (await texto('#fm-error')).includes('solo números'));
  await page.fill('#fm-monto', '-500'); await page.click('dialog.dlg-form button[value=ok]');
  check('C. Monto negativo: no se acepta', await page.isVisible('dialog.dlg-form[open]') && !(await db('seguimiento')).length);
  await page.fill('#fm-monto', '1,000.50'); await page.selectOption('#fm-metodo', 'efectivo'); await page.fill('#fm-nota', 'Anticipo 40 %'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForSelector('#ob-pagos .fila-mov');
  let pagos = await db('seguimiento', "o.tipo==='pago'");
  check('C. Se guarda el pago en centavos enteros ($1,000.50 = 100050)', pagos.length === 1 && pagos[0].monto === 100050 && pagos[0].concepto === 'anticipo' && pagos[0].metodo === 'efectivo' && pagos[0].proyectoId === id.p, JSON.stringify(pagos));
  check('C. El pago aparece en la lista con fecha, forma y monto', (await texto('#ob-pagos')).includes('Anticipo') && (await texto('#ob-pagos')).includes('Efectivo') && (await texto('#ob-pagos')).includes('$1,000.50'));
  await page.click('#ob-nuevo-pago'); await page.waitForSelector('dialog.dlg-form[open]');
  check('C. El segundo pago propone "Estimación" y la fecha de hoy', (await page.inputValue('#fm-concepto')) === 'estimacion' && /^\d{4}-\d\d-\d\d$/.test(await page.inputValue('#fm-fecha')));
  await page.fill('#fm-monto', '499.50'); await page.click('dialog.dlg-form button[value=ok]'); await page.waitForFunction(() => document.querySelectorAll('#ob-pagos .fila-mov').length === 2);

  /* ---------- D. Gastos ---------- */
  await page.click('#ob-nuevo-gasto'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-monto', '600'); await page.click('dialog.dlg-form button[value=ok]');
  check('D. Gasto sin descripción: no se guarda', (await texto('#fm-error')).includes('Falta: Descripción'));
  await page.fill('#fm-descripcion', 'Pintura vinílica'); await page.selectOption('#fm-categoria', 'material'); await page.fill('#fm-proveedor', 'Comex'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForSelector('#ob-gastos .fila-mov');
  await page.click('#ob-nuevo-gasto'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-descripcion', 'Pintor 2 días'); await page.selectOption('#fm-categoria', 'mano_obra'); await page.fill('#fm-monto', '300'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelectorAll('#ob-gastos .fila-mov').length === 2);
  check('D. Dos gastos guardados con su categoría y proveedor', (await db('seguimiento', "o.tipo==='gasto'")).length === 2 && (await texto('#ob-gastos')).includes('Comex'));
  check('D. Desglose de gastos por categoría', (await texto('#ob-gastos')).includes('Material: $600.00') && (await texto('#ob-gastos')).includes('Mano de obra: $300.00'));

  /* ---------- E. Resumen: cobrado 1,500.00 ; gastado 900 ; utilidad 600 ---------- */
  r = await texto('#ob-resumen');
  check('E. Cobrado $1,500.00 y por cobrar $1,250.00', r.includes('Cobrado$1,500.00') && r.includes('Por cobrar$1,250.00'), r);
  check('E. Gastado $900.00 y costo directo presupuestado $2,500.00', r.includes('Gastado$900.00') && r.includes('Costo directo presupuestado$2,500.00'), r);
  check('E. Has gastado menos que lo presupuestado: $1,600.00', r.includes('Has gastado menos que lo presupuestado$1,600.00'), r);
  check('E. Utilidad a la fecha $600.00', r.includes('(cobrado − gastado)$600.00'), r);
  check('E. Barra de avance de cobro (54.55 %)', r.includes('54.55 % del presupuesto'), r);
  await page.screenshot({ path: SALIDA + '/o-1-obra.png', fullPage: true });

  /* editar y eliminar */
  await page.click('#ob-pagos .fila-mov >> nth=1'); await page.waitForSelector('dialog.dlg-form[open]');
  check('E. Al tocar un pago se abre para editar con sus valores', (await page.inputValue('#fm-monto')) === '1000.50' || (await page.inputValue('#fm-monto')) === '499.50');
  await page.fill('#fm-monto', '1750'); await page.click('dialog.dlg-form button[value=ok]'); await wait(500);
  check('E. Editar un pago actualiza el resumen', (await texto('#ob-resumen')).includes('Cobrado$2,750.50') || (await texto('#ob-resumen')).includes('Cobrado$2,249.50'), await texto('#ob-resumen'));
  await page.click('#ob-gastos .fila-mov >> nth=0'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.click('dialog.dlg-form [data-eliminar]'); await page.waitForSelector('#dlg[open]');
  check('E. Eliminar un gasto pide confirmar', (await texto('#dlg-msg')).includes('Esto cambia el resumen'));
  await page.click('#dlg-ok'); await page.waitForFunction(() => document.querySelectorAll('#ob-gastos .fila-mov').length === 1);
  check('E. Gasto eliminado de la base', (await db('seguimiento', "o.tipo==='gasto'")).length === 1);

  /* ---------- F. Bitácora con fotos de avance ---------- */
  await page.click('#ob-nueva-nota'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.click('dialog.dlg-form button[value=ok]');
  check('F. Entrada vacía: no se guarda', (await texto('#fm-error')).includes('Falta: Qué pasó'));
  await page.fill('#fm-texto', 'Se terminó el resane.\nMañana se pinta.'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForSelector('#ob-bitacora .entrada');
  check('F. La entrada se guarda y conserva los saltos de línea', (await db('seguimiento', "o.tipo==='bitacora'"))[0].texto === 'Se terminó el resane.\nMañana se pinta.' && (await page.locator('#ob-bitacora .entrada br').count()) === 1);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#ob-bitacora [data-acc=galeria]')]);
  await fc.setFiles([__dirname + '/fotos/foto-grande.jpg', __dirname + '/fotos/foto-exif-vertical.jpg']);
  await page.waitForFunction(() => document.querySelectorAll('#ob-bitacora .mini-fotos img').length === 2, null, { timeout: 30000 });
  const fav = await db('fotos', "o.categoria==='avance'");
  const entradaId = (await db('seguimiento', "o.tipo==='bitacora'"))[0].id;
  check('F. Las 2 fotos quedan ligadas a la entrada, como "Avance de obra" y sin espacio', fav.length === 2 && fav.every(f => f.bitacoraId === entradaId && f.espacioId === null && f.proyectoId === id.p));
  check('F. Las miniaturas se ven', await page.$$eval('#ob-bitacora .mini-fotos img', is => is.every(i => i.naturalWidth > 0)));
  await page.click('#ob-bitacora .mini-fotos a >> nth=0'); await page.waitForSelector('canvas');
  check('F. Al tocar una miniatura se abre la foto para dibujar medidas', page.url().includes('#/foto/'));
  await page.goto(BASE + '#/proyecto/' + id.p + '/fotos'); await page.waitForSelector('text=Fotos (2)');
  check('F. Las fotos de avance también salen en la pestaña Fotos (y hay filtro "Avance de obra")', (await page.locator('option[value=avance]').count()) === 1);
  await page.goto(BASE + '#/proyecto/' + id.p + '/obra'); await page.waitForSelector('#ob-bitacora .entrada');
  await page.click('#ob-bitacora [data-acc=editar]'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-texto', 'Texto corregido'); await page.click('dialog.dlg-form button[value=ok]'); await wait(500);
  check('F. Editar la entrada conserva sus fotos', (await db('seguimiento', "o.tipo==='bitacora'"))[0].texto === 'Texto corregido' && (await db('fotos', "o.bitacoraId")).length === 2);

  /* ---------- G. Reporte: estado de pagos, sin gastos ni utilidad ---------- */
  await page.goto(BASE + '#/proyecto/' + id.p + '/reporte'); await page.waitForSelector('#rp-ver');
  check('G. La opción "Estado de pagos" aparece y viene sin marcar (por privacidad)', await page.isVisible('text=Estado de pagos') && !(await page.isChecked('input[data-op=pagos]')));
  await page.click('#rp-ver'); await page.waitForSelector('#rp-imprimir:not([disabled])', { timeout: 30000 });
  let h = await texto('#hoja');
  check('G. Sin marcar, el reporte no trae pagos', !h.includes('Estado de pagos') && !h.includes('Total cobrado'));
  check('G. Las fotos de avance de la bitácora no se cuelan como "Fotos generales"', !h.includes('Fotos generales') && (await page.locator('.rp-foto').count()) === 0);
  await page.goto(BASE + '#/proyecto/' + id.p + '/reporte'); await page.waitForSelector('#rp-ver');
  await page.check('input[data-op=pagos]'); await wait(900);
  await page.click('#rp-ver'); await page.waitForSelector('#rp-imprimir:not([disabled])', { timeout: 30000 });
  h = await texto('#hoja');
  check('G. Marcado, el reporte trae la tabla de pagos con el total cobrado', h.includes('Estado de pagos') && h.includes('Anticipo') && h.includes('Total cobrado'), h.slice(0, 200));
  check('G. Muestra presupuesto total, cobrado y saldo por pagar', h.includes('Presupuesto total (sin IVA)$2,750.00') && /Saldo por pagar\$/.test(h), h);
  check('G. NUNCA muestra gastos, proveedores ni utilidad', !h.includes('Pintor 2 días') && !h.includes('Comex') && !/utilidad real|gastado|Utilidad a la fecha/i.test(h));
  await page.waitForFunction(() => { const b = document.querySelector('#rp-descargar'); return b && !b.disabled; }, null, { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rp-descargar')]);
  const pdf = SALIDA + '/obra.pdf'; await dl.saveAs(pdf);
  check('G. El PDF propio se genera con la sección de pagos', /Pages:\s+\d+/.test(execSync('pdfinfo "' + pdf + '"').toString()));
  execSync(`pdftoppm -r 55 -png "${pdf}" ${SALIDA}/obra-pdf`);
  /* con un espacio excluido no se calcula saldo (el presupuesto ya no es el total) */
  await page.goto(BASE + '#/proyecto/' + id.p + '/reporte'); await page.waitForSelector('#rp-espacios');
  await page.uncheck('#rp-espacios input'); await wait(900);
  await page.click('#rp-ver'); await page.waitForSelector('#rp-imprimir:not([disabled])', { timeout: 30000 });
  h = await texto('#hoja');
  check('G. Si se excluye un espacio, el reporte lista pagos pero no inventa un saldo', h.includes('Total cobrado') && !h.includes('Saldo por pagar') && !h.includes('Presupuesto total'));

  /* ---------- H. Copia de seguridad y borrado ---------- */
  const copia = await page.evaluate(async () => { const t = await new Blob(await dbExportarPartes()).text(); return JSON.parse(t); });
  check('H. La copia de seguridad incluye pagos, gastos y bitácora', copia.datos.seguimiento && copia.datos.seguimiento.length === 4, String(copia.datos.seguimiento && copia.datos.seguimiento.length));
  const ant = JSON.stringify((await db('seguimiento')).sort((a, b) => a.id.localeCompare(b.id)));
  await page.evaluate(async c => { await dbImportar(c); }, copia);
  check('H. Restaurar devuelve los movimientos idénticos', JSON.stringify((await db('seguimiento')).sort((a, b) => a.id.localeCompare(b.id))) === ant);
  check('H. Fotos de avance conservan su ligadura con la bitácora tras restaurar', (await db('fotos', "o.bitacoraId")).length === 2);
  await page.evaluate(() => dbBorrarProyecto(document.location.hash.split('/')[2]));
  check('H. Al eliminar el proyecto se borran sus pagos, gastos y bitácora', (await db('seguimiento')).length === 0 && (await db('fotos')).length === 0);

  /* ---------- I. Pantallas ---------- */
  const id2 = await page.evaluate(async () => { const p = { id: nuevoId(), nombre: 'Sin nada', cliente: 'Ana', estado: 'pendiente', tipoTrabajo: 'otro', archivado: false, creado: ahora(), actualizado: ahora() }; await dbGuardar('proyectos', p); return p.id; });
  await page.goto(BASE + '#/proyecto/' + id2 + '/obra'); await page.waitForSelector('#ob-resumen');
  check('I. Proyecto sin presupuesto: avisa y no muestra "Por cobrar"', (await texto('#ob-resumen')).includes('aún no tiene presupuesto') && !(await texto('#ob-resumen')).includes('Por cobrar'));
  await page.evaluate(async pid => { for (const [i, m] of [[1, 120000], [2, 5000], [3, 99999999]].entries()) await dbGuardar('seguimiento', { id: nuevoId(), proyectoId: pid, tipo: 'pago', fecha: '2026-11-0' + (i + 1), concepto: 'otro', metodo: 'efectivo', nota: 'Nota larga '.repeat(12), monto: m[1], creado: ahora() }); }, id2);
  for (const [w, nom] of [[390, 'cel'], [800, 'tab-vertical'], [1228, 'tab-horizontal']]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '#/proyecto/' + id2 + '/obra'); await page.reload(); await page.waitForSelector('#ob-pagos .fila-mov'); await wait(300);
    const desb = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`I. ${w}px pestaña Obra sin desborde horizontal`, desb <= 1, String(desb));
    await page.screenshot({ path: SALIDA + `/o-2-${nom}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('#ob-nuevo-gasto'); await page.waitForSelector('dialog.dlg-form[open]');
  const cab = await page.evaluate(() => { const r = document.querySelector('dialog.dlg-form').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1; });
  check('I. El formulario cabe completo en el celular', cab);
  await page.screenshot({ path: SALIDA + '/o-3-formulario-cel.png' });
  await page.keyboard.press('Escape');

  check('J. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} bien, ${fail} mal`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
