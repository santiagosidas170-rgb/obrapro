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

  /* cálculos puros */
  const pu = await page.evaluate(() => ({
    g1: avanceGeneral([{ pct: 100, peso: 1 }, { pct: 0, peso: 1 }]),
    g2: avanceGeneral([{ pct: 100, peso: 3 }, { pct: 0, peso: 1 }]),
    g3: avanceGeneral([]), g4: avanceGeneral([{ pct: 50 }, { pct: 25, peso: 0 }]), g5: avanceGeneral([{ pct: 150 }]),
    lun: lunesDe('2026-11-25'), lun2: lunesDe('2026-11-23'), lun3: lunesDe('2026-11-29'), dom: domingoDe('2026-11-23'), cruce: domingoDe('2026-12-28'),
    h: historialSemanas([{ lunes: '2026-11-30', general: 50, etapas: [] }, { lunes: '2026-11-23', general: 20, etapas: [] }]).map(s => [s.lunes, s.cambio]) }));
  check('A. Promedio simple 50 %; con peso 3 a 1 es 75 %; sin etapas 0; peso 0 cuenta como 1; tope 100', pu.g1 === 50 && pu.g2 === 75 && pu.g3 === 0 && pu.g4 === 37.5 && pu.g5 === 100, JSON.stringify(pu));
  check('A. El lunes de una semana (miércoles 25 nov → lunes 23; domingo 29 → lunes 23)', pu.lun === '2026-11-23' && pu.lun2 === '2026-11-23' && pu.lun3 === '2026-11-23', JSON.stringify(pu));
  check('A. El domingo cruza de mes (28 dic → 3 ene) y el historial calcula el cambio', pu.dom === '2026-11-29' && pu.cruce === '2027-01-03' && JSON.stringify(pu.h) === '[["2026-11-23",null],["2026-11-30",30]]', JSON.stringify(pu));

  const id = await page.evaluate(async () => { const pr = { id: nuevoId(), nombre: 'Casa Etapas Ñ', cliente: 'Luis Soto', direccion: 'Calle 1', estado: 'ejecucion', tipoTrabajo: 'remodelacion', archivado: false, creado: ahora(), actualizado: ahora(), responsable: 'Yo' };
    await dbGuardar('proyectos', pr); return pr.id; });
  await page.goto(BASE + '#/proyecto/' + id + '/avances'); await page.waitForSelector('#av-general');
  check('B. Existe la pestaña "Avances" y es distinta de Obra y Contrato', await page.isVisible('.tab.active:has-text("Avances")') && await page.isVisible('.tab:has-text("Obra")') && await page.isVisible('.tab:has-text("Contrato")'));
  check('B. Sin etapas: avance 0 %, "Cerrar semana" y PDF desactivados', (await page.textContent('#av-pct')).trim() === '0 %' && await page.isDisabled('#av-cerrar') && await page.isDisabled('#av-pdf'));

  await page.click('#av-sugeridas'); await page.waitForSelector('.av-etapa');
  check('C. Cargar etapas sugeridas crea 6 etapas', await page.locator('.av-etapa').count() === 6);
  const et = n => page.locator('.av-etapa').nth(n);
  await et(1).locator('[data-set="100"]').click(); await page.waitForSelector('.av-etapa'); await wait(150);
  await et(4).locator('[data-set="50"]').click(); await wait(250);
  check('C. Tocar 100 % y 50 % cambia el avance general (150/6 = 25 %)', (await page.textContent('#av-pct')).trim() === '25 %', await page.textContent('#av-pct'));
  check('C. La etapa al 100 % dice "Terminada" y la de 50 % "En proceso"', (await et(1).textContent()).includes('Terminada') && (await et(4).textContent()).includes('En proceso'));

  /* editar con validación */
  await et(4).locator('[data-editar]').click(); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-pct', '150'); await page.click('dialog.dlg-form[open] button[value=ok]'); await wait(200);
  check('D. Un avance de 150 % se rechaza con aviso y el formulario se reabre', await page.isVisible('dialog.dlg-form[open]'));
  await page.fill('#fm-pct', '40'); await page.fill('#fm-peso', '3'); await page.fill('#fm-nota', 'Dos manos'); await page.click('dialog.dlg-form[open] button[value=ok]'); await wait(300);
  check('D. Con peso 3 y 40 %: (100 + 40×3) / 8 = 27.5 %', (await page.textContent('#av-pct')).trim() === '27.5 %', await page.textContent('#av-pct'));

  /* agregar etapa propia */
  await page.click('#av-agregar'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-nombre', 'Piso'); await page.click('dialog.dlg-form[open] button[value=ok]'); await wait(300);
  check('E. Se agrega una etapa propia (7 etapas)', await page.locator('.av-etapa').count() === 7);

  /* cerrar semana */
  await page.click('#av-cerrar'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-fecha', '2026-11-18'); await page.fill('#fm-nota', 'Arrancamos tablaroca'); await page.click('dialog.dlg-form[open] button[value=ok]'); await wait(300);
  check('F. Cerrar semana guarda el historial (semana del 16 al 22 nov)', (await page.textContent('#av-semanas')).includes('Semana del') && (await page.textContent('#av-semanas')).includes('Arrancamos tablaroca'));
  await et(0).locator('[data-set="100"]').click(); await wait(300);
  await page.click('#av-cerrar'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-fecha', '2026-11-25'); await page.fill('#fm-nota', 'Preparación lista'); await page.click('dialog.dlg-form[open] button[value=ok]'); await wait(300);
  const sem = await page.evaluate(async () => (await dbObtener('proyectos', location.hash.split('/')[2])).avances.semanas.map(s => [s.lunes, s.general, s.etapas.length]).sort());
  check('F. Quedan 2 semanas con su foto del avance (16 y 23 nov) y 7 etapas cada una', sem.length === 2 && sem[0][0] === '2026-11-16' && sem[1][0] === '2026-11-23' && sem[0][2] === 7, JSON.stringify(sem));
  check('F. La segunda semana muestra el cambio contra la anterior', /\+\d+(\.\d)? pts/.test(await page.textContent('#av-semanas')), await page.textContent('#av-semanas'));
  await page.click('#av-cerrar'); await page.waitForSelector('dialog.dlg-form[open]'); await page.fill('#fm-fecha', '2026-11-27'); await page.click('dialog.dlg-form[open] button[value=ok]'); await wait(300);
  check('F. Cerrar otra vez la misma semana la actualiza, no la duplica', (await page.evaluate(async () => (await dbObtener('proyectos', location.hash.split('/')[2])).avances.semanas.length)) === 2);

  /* persistencia */
  await page.reload(); await page.waitForSelector('#av-general'); await wait(200);
  check('G. Todo se conserva al recargar', await page.locator('.av-etapa').count() === 7 && (await page.textContent('#av-semanas')).includes('Preparación lista'));

  /* PDF */
  await page.evaluate(() => window.__txt.splice(0));
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#av-pdf')]);
  const ruta = SALIDA + '/' + d.suggestedFilename(); await d.saveAs(ruta);
  const t = (await page.evaluate(() => window.__txt.splice(0))).join(' | '), buf = fs.readFileSync(ruta);
  check('H. El PDF se descarga, es PDF y el nombre no lleva acentos', buf.slice(0, 5).toString() === '%PDF-' && /^Avance por etapas - Casa Etapas N - \d{4}-\d{2}-\d{2}\.pdf$/.test(d.suggestedFilename()) && buf.length > 15000, d.suggestedFilename());
  check('H. Lleva avance general, etapas con estado y las semanas con sus notas', ['Avance de obra por etapas', 'Tablaroca', 'Terminada', 'Preparación lista', 'Arrancamos', 'Luis Soto'].every(s => t.includes(s)), t.slice(0, 1200));
  check('H. No lleva dinero: ni pesos, ni utilidad, ni presupuesto', !/\$|Utilidad|Presupuesto|Costo/.test(t), t);

  /* quitar etapa conserva el historial */
  await et(6).locator('[data-editar]').click(); await page.waitForSelector('dialog.dlg-form[open]'); await page.click('dialog.dlg-form[open] [data-eliminar]'); await page.click('#dlg-ok'); await wait(400);
  check('I. Quitar una etapa pide confirmación y conserva las semanas ya cerradas', await page.locator('.av-etapa').count() === 6 && (await page.evaluate(async () => (await dbObtener('proyectos', location.hash.split('/')[2])).avances.semanas.every(s => s.etapas.length === 7))));

  /* eliminar semana */
  await page.locator('.av-sem').first().click(); await page.waitForSelector('dialog.dlg-form[open]'); await page.click('dialog.dlg-form[open] [data-eliminar]'); await page.click('#dlg-ok'); await wait(400);
  check('J. Eliminar una semana la quita solo a ella', await page.locator('.av-sem').count() === 1);

  const copia = await page.evaluate(async () => JSON.parse(await new Blob(await dbExportarPartes()).text()));
  const pc = copia.datos.proyectos.find(p => p.avances);
  check('K. Etapas y semanas viajan en la copia de seguridad y no tocan la bitácora', pc && pc.avances.etapas.length === 6 && pc.avances.semanas.length === 1 && copia.datos.seguimiento.length === 0);
  await page.screenshot({ path: SALIDA + '/av-1.png', fullPage: true });

  for (const [w, nom] of [[390, 'cel'], [800, 'tab'], [1228, 'wide']]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '#/proyecto/' + id + '/avances'); await page.reload(); await page.waitForSelector('#av-general'); await wait(300);
    const desb = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const peq = await page.evaluate(() => [...document.querySelectorAll('#tab-body button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 40).length);
    check(`L. ${w}px sin desborde horizontal y botones de al menos 40 px`, desb <= 1 && peq === 0, `${desb} ${peq}`);
    await page.screenshot({ path: SALIDA + `/av-2-${nom}.png`, fullPage: true });
  }
  check('M. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} bien, ${fail} mal`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
