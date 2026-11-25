const { chromium } = require('playwright');
const fs = require('fs');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
fs.mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8123/';
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('✔', n); } else { fail++; console.log('✘', n, x); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const INIT = () => {
  try { sessionStorage.setItem('obrapro-splash', '1'); } catch (e) {}
  window.__txt = [];
  const f = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { window.__txt.push(String(t)); return f.call(this, t, ...r); };
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1228, height: 900 }, acceptDownloads: true, locale: 'es-MX' });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto(BASE); await page.waitForSelector('.empty');

  const id = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa Semanal Ñ', cliente: 'Rosa Díaz', direccion: 'Calle 3', estado: 'ejecucion', tipoTrabajo: 'remodelacion', archivado: false, creado: ahora(), actualizado: ahora(), responsable: 'Yo',
      avances: { etapas: [{ id: 'e1', nombre: 'Tablaroca', pct: 100, peso: 1, inicio: '', fin: '', nota: '' }, { id: 'e2', nombre: 'Pintura', pct: 20, peso: 1, inicio: '', fin: '', nota: '' }],
        semanas: [{ id: 's1', lunes: '2026-11-16', nota: '', general: 20, etapas: [{ id: 'e1', nombre: 'Tablaroca', pct: 40, peso: 1 }, { id: 'e2', nombre: 'Pintura', pct: 0, peso: 1 }] },
          { id: 's2', lunes: '2026-11-23', nota: 'Semana productiva', general: 60, etapas: [{ id: 'e1', nombre: 'Tablaroca', pct: 100, peso: 1 }, { id: 'e2', nombre: 'Pintura', pct: 20, peso: 1 }] }] } };
    await dbGuardar('proyectos', pr);
    const mov = (tipo, fecha, extra) => Object.assign({ id: nuevoId(), proyectoId: pr.id, tipo, fecha, creado: ahora() + fecha, actualizado: ahora() }, extra);
    await dbGuardar('seguimiento', mov('bitacora', '2026-11-24', { texto: 'Se colocó la tablaroca.' }));
    await dbGuardar('seguimiento', mov('bitacora', '2026-11-28', { texto: 'Sin fotos hoy' }));
    await dbGuardar('seguimiento', mov('bitacora', '2026-11-10', { texto: 'Entrada vieja fuera de la semana' }));
    await dbGuardar('seguimiento', mov('pago', '2026-11-25', { monto: 500000, concepto: 'anticipo', metodo: 'efectivo', nota: '' }));
    await dbGuardar('seguimiento', mov('pago', '2026-11-12', { monto: 999900, concepto: 'otro', metodo: 'efectivo', nota: '' }));
    await dbGuardar('seguimiento', mov('gasto', '2026-11-26', { monto: 123456, categoria: 'material', descripcion: 'Secreto-gasto', proveedor: 'Proveedor-secreto' }));
    return pr.id;
  });
  await page.goto(BASE + '#/proyecto/' + id + '/obra'); await page.waitForSelector('#ob-bitacora .entrada');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#ob-bitacora .entrada:has-text("tablaroca") [data-acc=galeria]')]);
  await fc.setFiles([__dirname + '/fotos/foto-grande.jpg', __dirname + '/fotos/foto-exif-vertical.jpg']);
  await page.waitForFunction(() => document.querySelectorAll('#ob-bitacora .mini-fotos img').length === 2, null, { timeout: 30000 });

  await page.goto(BASE + '#/proyecto/' + id + '/reporte'); await page.waitForSelector('[data-rtipo]');
  check('A. El Reporte ofrece dos opciones: levantamiento y semanal', await page.isVisible('[data-rtipo=levantamiento]') && await page.isVisible('[data-rtipo=semanal]'));
  check('A. Por defecto abre el reporte de levantamiento de siempre (Ver reporte y espacios)', await page.isVisible('#rp-ver') && await page.isVisible('.seg.activo:has-text("levantamiento")'));

  await page.click('[data-rtipo=semanal]'); await page.waitForSelector('#rs-fecha'); await wait(200);
  check('B. Reporte semanal: aparecen la fecha, "Ver reporte semanal" y el PDF directo; ya no el de levantamiento', await page.isVisible('#rs-ver') && await page.isVisible('#rs-pdf') && !(await page.isVisible('#rp-ver')));
  await page.fill('#rs-fecha', '2026-11-25'); await page.dispatchEvent('#rs-fecha', 'change'); await wait(400);
  const sem = (await page.textContent('#rs-semana')).trim(), res = (await page.textContent('#rs-resumen')).replace(/\s+/g, ' ');
  check('C. Muestra la semana (lunes 23 al domingo 29 nov)', sem.includes('23/11/2026') && sem.includes('29/11/2026'), sem);
  check('C. Resumen: 60 % general (+40 pts), 2 entradas, 2 fotos y 1 pago de esa semana', res.includes('60 %') && res.includes('+40 pts') && res.includes('2 entradas') && res.includes('2 fotos') && res.includes('1 pago'), res);
  check('C. La semana ya cerrada no pide cerrarla', !res.includes('sin cerrar'));
  await page.reload(); await page.waitForSelector('#rs-fecha');
  check('D. La opción elegida (semanal) se recuerda al recargar', await page.isVisible('.seg.activo:has-text("semanal")'));

  const textos = async () => (await page.evaluate(() => window.__txt.splice(0))).join(' | ');
  await page.fill('#rs-fecha', '2026-11-25'); await page.dispatchEvent('#rs-fecha', 'change'); await wait(300); await textos();
  let [d] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.click('#rs-pdf')]);
  let ruta = SALIDA + '/' + d.suggestedFilename(); await d.saveAs(ruta);
  let t = await textos(), buf = fs.readFileSync(ruta);
  fs.copyFileSync(ruta, SALIDA + '/semanal-prueba.pdf');
  check('E. El PDF semanal se descarga, es PDF y el nombre no lleva acentos', buf.slice(0, 5).toString() === '%PDF-' && /^Reporte semanal - Casa Semanal N - \d{4}-\d{2}-\d{2}\.pdf$/.test(d.suggestedFilename()) && buf.length > 40000, d.suggestedFilename() + ' ' + buf.length);
  check('E. Lleva la semana, el avance, las etapas con antes/ahora/cambio y la nota de la semana', ['Reporte semanal', '23/11/2026 al 29/11/2026', '60 %', 'Antes', 'Ahora', 'Tablaroca', '+60 pts', 'Semana productiva', 'Contra la semana anterior: +40 puntos'].every(s => t.includes(s)), t.slice(0, 900));
  check('E. Lleva las entradas de la bitácora de esa semana y deja fuera la de otra semana', t.includes('Se colocó la tablaroca.') && t.includes('Sin fotos hoy') && !t.includes('Entrada vieja'), t);
  check('E. Lleva el pago de la semana solo si se pide: apagado por defecto', !t.includes('Pagos recibidos') && !t.includes('5,000.00'), t);
  check('E. Nunca lleva gastos, proveedores ni utilidad', !/Secreto|Proveedor|Utilidad|1,234.56/.test(t), t);

  /* opciones */
  await page.check('[data-sop=pagos]'); await page.uncheck('[data-sop=obra]'); await wait(900); await textos();
  [d] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.click('#rs-pdf')]);
  t = await textos();
  check('F. Con pagos encendido sale el pago de la semana ($5,000.00) y no el de otra semana', t.includes('PAGOS RECIBIDOS ESTA SEMANA') && t.includes('$5,000.00') && !t.includes('9,999.00'), t);
  check('F. Con "trabajos y fotos" apagado no salen las entradas de la bitácora', !t.includes('Se colocó la tablaroca.') && !t.includes('TRABAJOS Y FOTOS'), t);
  await page.uncheck('[data-sop=avance]'); await wait(900); await textos();
  [d] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.click('#rs-pdf')]);
  t = await textos();
  check('F. Con avance apagado no sale la tabla de etapas', !t.includes('AVANCE DE LA SEMANA') && !t.includes('Antes'), t);

  /* semana sin cerrar y semana vacía */
  await page.check('[data-sop=avance]'); await page.check('[data-sop=obra]'); await wait(300);
  await page.fill('#rs-fecha', '2026-12-02'); await page.dispatchEvent('#rs-fecha', 'change'); await wait(400);
  const res2 = (await page.textContent('#rs-resumen')).replace(/\s+/g, ' ');
  check('G. Una semana sin cerrar avisa que usa los porcentajes de hoy y cuenta 0 entradas', res2.includes('sin cerrar') && res2.includes('0 entradas') && res2.includes('0 pagos'), res2);
  await textos();
  [d] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), page.click('#rs-pdf')]);
  t = await textos();
  check('G. El PDF de una semana vacía lo dice con claridad y sigue siendo válido', t.includes('No hay entradas en la bitácora de esta semana.') && t.includes('aún no está cerrada'), t);

  /* vista previa en pantalla, igual que el otro reporte */
  await page.fill('#rs-fecha', '2026-11-25'); await page.dispatchEvent('#rs-fecha', 'change'); await wait(400);
  check('L. Hay botón "Ver reporte semanal" y su enlace lleva a la semana elegida', (await page.getAttribute('#rs-ver', 'href')).endsWith('/reporte-semanal/' + id + '/2026-11-23'), await page.getAttribute('#rs-ver', 'href'));
  await page.click('#rs-ver'); await page.waitForSelector('#hoja .rp-encabezado'); await wait(500);
  const hoja = (await page.textContent('#hoja')).replace(/\s+/g, ' ');
  check('L. La vista previa muestra la hoja: título, semana, avance 60 %, etapas y cambio', ['Reporte semanal', '23/11/2026 al 29/11/2026', '60 %', 'Tablaroca', '+60 pts', 'Semana productiva'].every(x => hoja.includes(x)), hoja.slice(0, 500));
  check('L. Muestra la bitácora de esa semana con sus 2 fotos y no la de otra semana', hoja.includes('Se colocó la tablaroca.') && hoja.includes('Sin fotos hoy') && !hoja.includes('Entrada vieja') && (await page.locator('#hoja .rp-foto img').count()) === 2);
  check('L. Respeta las opciones (pagos y fotos con medidas) y nunca muestra gastos', hoja.includes('Pagos recibidos esta semana') && hoja.includes('$5,000.00') && !hoja.includes('9,999.00') && !/Secreto|Proveedor|Utilidad/.test(hoja), hoja);
  await page.waitForFunction(() => { const b = document.querySelector('#rp-descargar'); return b && !b.disabled; }, null, { timeout: 40000 });
  check('L. Los botones son los mismos que en el otro reporte y el PDF se prepara solo', await page.isVisible('#rp-imprimir') && await page.isVisible('#rp-abrir') && (await page.textContent('#rp-estado')).includes('PDF listo'));
  await textos();
  const [dv] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#rp-descargar')]);
  const rv = SALIDA + '/' + dv.suggestedFilename(); await dv.saveAs(rv);
  check('L. "Descargar PDF" de la vista previa baja el PDF semanal', fs.readFileSync(rv).slice(0, 5).toString() === '%PDF-' && /^Reporte semanal - /.test(dv.suggestedFilename()), dv.suggestedFilename());
  await page.screenshot({ path: SALIDA + '/rs-vista.png', fullPage: true });
  await page.goto(BASE + '#/reporte-semanal/' + id); await page.waitForSelector('#hoja .rp-encabezado');
  check('L. Sin fecha en el enlace abre la semana de hoy sin error', (await page.textContent('#hoja')).includes('Reporte semanal'));
  await page.goto(BASE + '#/reporte-semanal/' + id + '/basura'); await page.waitForSelector('#hoja .rp-encabezado');
  check('L. Una fecha inválida en el enlace no rompe la pantalla', (await page.textContent('#hoja')).includes('Semana'));
  await page.click('.reporte-barra a:has-text("Volver")'); await page.waitForSelector('#rs-fecha');
  check('L. "Volver" regresa a la pestaña Reporte semanal', await page.isVisible('.seg.activo:has-text("semanal")'));

  /* volver al levantamiento */
  await page.click('[data-rtipo=levantamiento]'); await page.waitForSelector('#rp-ver');
  check('H. Volver al reporte de levantamiento lo deja igual que antes', await page.isVisible('#rp-espacios, .layout-reporte') && await page.isVisible('#rp-ver'));
  const copia = await page.evaluate(async () => JSON.parse(await new Blob(await dbExportarPartes()).text()));
  const pc = copia.datos.proyectos.find(p => p.reporte && p.reporte.semanal);
  check('I. La preferencia del reporte semanal viaja en la copia de seguridad', pc && pc.reporte.semanal.pagos === true && pc.reporte.semanal.obra === true);

  await page.click('[data-rtipo=semanal]'); await page.waitForSelector('#rs-fecha');
  for (const [w, nom] of [[390, 'cel'], [800, 'tab'], [1228, 'wide']]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '#/proyecto/' + id + '/reporte'); await page.reload(); await page.waitForSelector('#rs-fecha'); await wait(300);
    const desb = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`J. ${w}px reporte semanal sin desborde horizontal`, desb <= 1, String(desb));
    await page.screenshot({ path: SALIDA + `/rs-${nom}.png`, fullPage: true });
  }
  check('K. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} bien, ${fail} mal`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
