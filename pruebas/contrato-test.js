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

  const ids = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa Contrato Ñ', cliente: 'Ana Pérez', direccion: 'Calle 9 #45', telefono: '6141234567', estado: 'presupuestado', tipoTrabajo: 'remodelacion', archivado: false, creado: ahora(), actualizado: ahora(),
      presupuesto: { indirectos: 10, utilidad: 20, aplicarIva: true, iva: 16, vigencia: '15 días', condiciones: '', notas: '' },
      croquis: { pos: {}, aberturas: {}, elementos: [] } };
    await dbGuardar('proyectos', pr);
    const sala = { id: nuevoId(), proyectoId: pr.id, nombre: 'Sala', tipo: 'Sala', unidad: 'm', forma: 'rectangular', largo: 4, ancho: 3.5, altura: 2.5, tramos: [], orden: 0, creado: ahora(), actualizado: ahora(), trabajos: 'Pintar muros y plafón' };
    await dbGuardar('espacios', sala);
    const pt = (descripcion, categoria, espacioId, unidad, cantidad, desp, pm, pmo, tq) => ({ id: nuevoId(), proyectoId: pr.id, espacioId, descripcion, categoria, unidad, cantidad, desperdicio: desp,
      precioMaterial: pm, precioManoObra: pmo, tipoCantidad: tq, origen: null, creado: ahora() + descripcion, actualizado: ahora() });
    for (const x of [pt('Pintura vinílica', 'Pintura', sala.id, 'm2', 33.33, 5, 10000, 5000, 'confirmada'), pt('Limpieza final', 'Limpieza', null, 'servicio', 1, 0, null, 77777, 'estimada'),
      pt('Resane de muros', 'Pintura', sala.id, 'm2', 17.7, 0, 3333, 4444, 'confirmada')]) await dbGuardar('partidas', x);
    const r = await (async () => { const partidas = await dbPorProyecto('partidas', pr.id); const { t, imp } = importesCliente(partidas, pr.presupuesto); return { suma: imp.reduce((a, b) => a + b, 0), sub: t.subtotal, total: t.total, directo: t.directo }; })();
    return { p: pr.id, r };
  });
  check('A. Los importes del cliente suman exacto el subtotal (con indirectos y utilidad repartidos)', ids.r.suma === ids.r.sub && ids.r.sub > ids.r.directo, JSON.stringify(ids.r));

  await page.goto(BASE + '#/proyecto/' + ids.p + '/contrato'); await page.waitForSelector('#ct-cliente');
  check('B. Existe la pestaña "Contrato" y está activa', await page.isVisible('.tab.active:has-text("Contrato")'));
  check('B. Hay dos secciones separadas: contrato con el cliente y orden de trabajo', await page.isVisible('#ct-cliente') && await page.isVisible('#ct-trab'));
  check('B. Avisa que los avances están en la pestaña Obra', (await page.textContent('#tab-body')).includes('pestaña') && await page.isVisible('a[href$="/obra"]'));
  check('B. Muestra la mano de obra del presupuesto solo como referencia', await page.isVisible('#ct-ref'));

  /* capturar datos */
  await page.fill('[data-g=c][data-k=numero]', 'C-001');
  await page.fill('[data-g=c][data-k=plazo]', '15');
  await page.fill('[data-g=c][data-k=anticipo]', '40');
  await page.fill('[data-g=c][data-k=alcance]', 'Pintura de sala y limpieza final');
  await page.fill('[data-g=c][data-k=garantia]', '6 meses en mano de obra');
  await page.fill('[data-g=t][data-k=nombre]', 'Pedro Gómez');
  await page.fill('[data-g=t][data-k=indicaciones]', 'Proteger pisos antes de pintar');
  await page.selectOption('[data-g=t][data-k=esquema]', 'destajo');
  await page.fill('#ct-monto', 'abc'); await wait(100);
  check('C. Un monto con letras muestra error y no se guarda', (await page.textContent('#ct-monto-err')).includes('números'));
  await page.fill('#ct-monto', '1,850.50'); await wait(150);
  check('C. Un monto válido borra el error', (await page.textContent('#ct-monto-err')).trim() === '');
  await wait(900);
  await page.reload(); await page.waitForSelector('#ct-cliente');
  const val = async s => page.inputValue(s);
  check('D. Los datos del contrato se guardan al recargar', await val('[data-g=c][data-k=numero]') === 'C-001' && await val('[data-g=c][data-k=anticipo]') === '40' && (await val('[data-g=c][data-k=alcance]')).includes('limpieza'));
  check('D. Los datos del trabajador se guardan (nombre, esquema, monto)', await val('[data-g=t][data-k=nombre]') === 'Pedro Gómez' && await val('[data-g=t][data-k=esquema]') === 'destajo' && await val('#ct-monto') === '1850.50');

  /* PDF del cliente */
  const textos = async () => (await page.evaluate(() => window.__txt.splice(0))).join(' | ');
  await textos();
  let [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#ct-pdf')]);
  const ruta = SALIDA + '/' + d.suggestedFilename(); await d.saveAs(ruta);
  const nombre = d.suggestedFilename(), t1 = await textos();
  const buf = fs.readFileSync(ruta);
  check('E. El PDF del contrato se descarga, es PDF y el nombre no lleva acentos', buf.slice(0, 5).toString() === '%PDF-' && /^Contrato - Casa Contrato N - \d{4}-\d{2}-\d{2}\.pdf$/.test(nombre) && buf.length > 20000, nombre + ' ' + buf.length);
  check('E. Lleva cliente, número, alcance, anticipo 40 % y garantía', ['Ana Pérez', 'C-001', 'Pintura de sala y limpieza final', 'Anticipo (40 %)', '6 meses'].every(s => t1.includes(s)), t1.slice(0, 600));
  check('E. Lleva los conceptos con importe y el total con IVA', t1.includes('Pintura vinílica') && t1.includes('Total (MXN)'));
  check('E. NO enseña utilidad, indirectos ni columnas de material / mano de obra', !/Utilidad|Indirectos|Mano de obra|Material/.test(t1), t1);
  check('E. Nada de lo que es solo para el trabajador (su pago, Pedro, orden)', !t1.includes('Pedro') && !t1.includes('1,850.50') && !t1.includes('Orden de trabajo'), t1);
  fs.copyFileSync(ruta, SALIDA + '/contrato-prueba.pdf');

  /* PDF de la orden de trabajo */
  [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#ct-orden')]);
  const ruta2 = SALIDA + '/' + d.suggestedFilename(); await d.saveAs(ruta2);
  const t2 = await textos(), buf2 = fs.readFileSync(ruta2);
  check('F. El PDF de la orden se descarga y es PDF', buf2.slice(0, 5).toString() === '%PDF-' && /^Orden de trabajo - /.test(d.suggestedFilename()) && buf2.length > 15000, d.suggestedFilename());
  check('F. Lleva trabajador, esquema, monto que se le paga e indicaciones', ['Pedro Gómez', 'Por destajo', '$1,850.50', 'Proteger pisos'].every(s => t2.includes(s)), t2.slice(0, 700));
  check('F. Lleva qué hacer con cantidades y las notas del espacio', t2.includes('Pintura vinílica') && t2.includes('Pintar muros'));
  check('F. Lleva la lista de materiales con "A comprar" (33.33 + 5 % = 35.00 m²)', t2.includes('A comprar') && t2.includes('35.00 m²'), t2);
  check('F. NO lleva precios al cliente, total, IVA, utilidad ni datos de contacto del cliente', !/Utilidad|Indirectos|IVA|Total|Ana Pérez|6141234567|Importe/.test(t2), t2);

  /* desactivar croquis y materiales */
  await page.uncheck('[data-k=conMateriales]'); await page.uncheck('[data-k=conCroquis]'); await wait(900);
  await textos();
  [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#ct-orden')]);
  const t3 = await textos();
  check('G. Con "incluir materiales" apagado no sale la lista de materiales ni el croquis', !t3.includes('A comprar') && !t3.includes('Croquis de referencia'), t3);

  /* copia de seguridad y no mezcla con la bitácora */
  const copia = await page.evaluate(async () => JSON.parse(await new Blob(await dbExportarPartes()).text()));
  const pc = copia.datos.proyectos.find(p => p.contrato);
  check('H. El contrato y la orden viajan en la copia de seguridad', pc && pc.contrato.cliente.numero === 'C-001' && pc.contrato.trabajador.monto === 185050 && pc.contrato.trabajador.conCroquis === false, JSON.stringify(pc && pc.contrato));
  check('H. No se creó nada en la bitácora ni en pagos (los avances siguen aparte)', copia.datos.seguimiento.length === 0);
  await page.screenshot({ path: SALIDA + '/ct-1.png', fullPage: true });

  for (const [w, nom] of [[390, 'cel'], [800, 'tab']]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '#/proyecto/' + ids.p + '/contrato'); await page.reload(); await page.waitForSelector('#ct-cliente'); await wait(300);
    const desb = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`I. ${w}px pestaña Contrato sin desborde horizontal`, desb <= 1, String(desb));
    await page.screenshot({ path: SALIDA + `/ct-2-${nom}.png`, fullPage: true });
  }
  check('J. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} bien, ${fail} mal`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
