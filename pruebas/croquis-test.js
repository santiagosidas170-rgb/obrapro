const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
fs.mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8123/';
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
  await page.goto(BASE); await page.waitForSelector('text=Proyectos');

  /* ---------- A. Geometría pura ---------- */
  const g = await page.evaluate(() => {
    const rect = cajaEspacio({ forma: 'rectangular', unidad: 'cm', largo: 400, ancho: 350 });
    const irr = cajaEspacio({ forma: 'irregular', unidad: 'm', tramos: [{ largo: 4, ancho: 3, signo: 1 }, { largo: 2, ancho: 1, signo: 1 }, { largo: 1, ancho: 1, signo: -1 }] });
    const nada = cajaEspacio({ forma: 'rectangular', unidad: 'm', largo: null, ancho: 3 });
    const lay = distribuirCroquis([{ id: 'a', w: 5, h: 3 }, { id: 'b', w: 5, h: 2 }, { id: 'c', w: 4, h: 4 }], 10, 0);
    const solapa = (p, q, a, b) => p.x < q.x + b.w - 1e-9 && q.x < p.x + a.w - 1e-9 && p.y < q.y + b.h - 1e-9 && q.y < p.y + a.h - 1e-9;
    const it = { a: { w: 5, h: 3 }, b: { w: 5, h: 2 }, c: { w: 4, h: 4 } };
    const sinSolape = ['a-b', 'a-c', 'b-c'].every(k => { const [i, j] = k.split('-'); return !solapa(lay[i], lay[j], it[i], it[j]); });
    const iman = imanCroquis({ x: 5.08, y: 0.07, w: 3, h: 3 }, [{ x: 0, y: 0, w: 5, h: 3.5 }], 0.15);
    const lejos = imanCroquis({ x: 7.03, y: 9.02, w: 3, h: 3 }, [{ x: 0, y: 0, w: 5, h: 3.5 }], 0.15);
    return { rect, irr, nada, lay, sinSolape, iman, lejos };
  });
  check('A. Rectángulo en cm se convierte a metros (4.00 × 3.50)', g.rect && Math.abs(g.rect.w - 4) < 1e-9 && Math.abs(g.rect.h - 3.5) < 1e-9 && !g.rect.aprox, JSON.stringify(g.rect));
  check('A. Irregular se aproxima conservando la superficie (12 + 2 − 1 = 13 m²)', g.irr && g.irr.aprox && Math.abs(g.irr.w * g.irr.h - 13) < 1e-9, JSON.stringify(g.irr));
  check('A. Sin medidas no hay caja', g.nada === null);
  check('A. El acomodo automático no encima los espacios', g.sinSolape, JSON.stringify(g.lay));
  check('A. El imán pega al borde vecino (x=5, y=0)', g.iman.x === 5 && g.iman.y === 0, JSON.stringify(g.iman));
  check('A. Lejos de otras orillas solo se alinea a la cuadrícula de 5 cm', g.lejos.x === 7.05 && g.lejos.y === 9, JSON.stringify(g.lejos));

  /* ---------- Datos ---------- */
  const id = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa Croquis', cliente: 'Luis Gómez', estado: 'presupuestado', tipoTrabajo: 'remodelacion', fecha: '2026-11-02', archivado: false, creado: ahora(), actualizado: ahora() };
    await dbGuardar('proyectos', pr);
    const es = (n, l, a, extra) => Object.assign({ id: nuevoId(), proyectoId: pr.id, nombre: n, tipo: n, unidad: 'm', forma: 'rectangular', largo: l, ancho: a, altura: 2.5, tramos: [], estadoActual: 'regular', trabajos: '', observaciones: '', orden: 0, creado: ahora() + n, actualizado: ahora() }, extra || {});
    for (const e of [es('Sala', 4, 3.5), es('Cocina', 3, 3), es('Baño', 2, 1.5), es('Bodega', null, null)]) await dbGuardar('espacios', e);
    return pr.id;
  });
  const proy = () => page.evaluate(i => dbObtener('proyectos', i), id);

  await page.goto(BASE + '#/proyecto/' + id + '/croquis'); await page.waitForSelector('#cq-canvas');
  await wait(400);
  check('B. Aparece la pestaña Croquis', await page.isVisible('.tabs a:has-text("Croquis")'));
  const p1 = await proy();
  check('B. Se guarda el acomodo inicial de los 3 espacios con medidas', p1.croquis && Object.keys(p1.croquis.pos).length === 3, JSON.stringify(p1.croquis));
  check('B. El espacio sin medidas se avisa y no entra', (await page.textContent('#cq-sinmedidas')).includes('Bodega') && !JSON.stringify(p1.croquis).includes('Bodega'));
  const pintado = await page.evaluate(() => { const c = document.querySelector('#cq-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 17) if (d[i] < 200) n++; return n; });
  check('B. El croquis se dibuja (el lienzo no está vacío)', pintado > 200, String(pintado));

  /* geometría de pantalla para tocar */
  const centro = async nombre => page.evaluate(async ([i, nom]) => {
    const p = await dbObtener('proyectos', i), es = (await dbPorProyecto('espacios', i)).find(e => e.nombre === nom);
    const c = document.querySelector('#cq-canvas'); c.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = c.getBoundingClientRect();
    const v = c.vistaActual();
    const d = datosCroquis(p, await dbPorProyecto('espacios', i));
    const b = d.cajas.find(x => x.id === es.id);
    return { x: r.left + pxX(v, b.x + b.w / 2), y: r.top + pxY(v, b.y + b.h / 2), k: v.k, b };
  }, [id, nombre]);

  /* ---------- C. Seleccionar, arrastrar con imán ---------- */
  let cs = await centro('Cocina');
  await page.mouse.click(cs.x, cs.y);
  check('C. Al tocar un espacio se muestra su panel', (await page.textContent('#cq-sel')).includes('Cocina') && await page.isVisible('[data-nueva=puerta]'));
  const sala = (await proy()).croquis.pos;
  const salaId = (await page.evaluate(i => dbPorProyecto('espacios', i), id)).find(e => e.nombre === 'Sala').id;
  const cocId = (await page.evaluate(i => dbPorProyecto('espacios', i), id)).find(e => e.nombre === 'Cocina').id;
  const destinoX = sala[salaId].x + 4 + 0.05;          /* 5 cm separada del borde derecho de la Sala */
  cs = await centro('Cocina');
  await page.mouse.move(cs.x, cs.y); await page.mouse.down();
  const dx = (destinoX - cs.b.x) * cs.k, dy = (sala[salaId].y - cs.b.y) * cs.k;
  await page.mouse.move(cs.x + dx / 2, cs.y + dy / 2, { steps: 4 }); await page.mouse.move(cs.x + dx, cs.y + dy, { steps: 4 });
  await page.mouse.up(); await wait(400);
  let pos = (await proy()).croquis.pos;
  check('C. Al soltar, la Cocina queda pegada al borde derecho de la Sala', Math.abs(pos[cocId].x - (sala[salaId].x + 4)) < 1e-6 && Math.abs(pos[cocId].y - sala[salaId].y) < 1e-6, JSON.stringify(pos));
  check('C. La posición queda guardada', pos[cocId].x !== p1.croquis.pos[cocId].x || pos[cocId].y !== p1.croquis.pos[cocId].y);

  /* teclado */
  await page.focus('#cq-canvas'); const antes = pos[cocId].x;
  await page.keyboard.press('ArrowRight'); await wait(300);
  check('C. Las flechas del teclado mueven 5 cm el espacio elegido', Math.abs((await proy()).croquis.pos[cocId].x - antes - 0.05) < 1e-6);
  await page.keyboard.press('ArrowLeft'); await wait(200);

  /* ---------- D. Puertas y ventanas ---------- */
  await page.click('[data-nueva=puerta]'); await page.waitForSelector('dialog.dlg-form[open]');
  check('D. El formulario de puerta trae 0.90 m de ancho', (await page.inputValue('#fm-ancho')) === '0.90');
  await page.fill('#fm-ancho', '10'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForSelector('#toast:has-text("no cabe")'); await page.waitForSelector('dialog.dlg-form[open]');
  check('D. Un ancho que no cabe en el muro avisa y vuelve a abrir el formulario', (await page.inputValue('#fm-ancho')) === '10');
  await page.fill('#fm-ancho', '0,9'); await page.selectOption('#fm-lado', 'S'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelector('[data-ab]'));
  let ab = (await proy()).croquis.aberturas[cocId];
  check('D. La puerta se guarda centrada en el muro de abajo (3 m: desde 1.05)', ab.length === 1 && ab[0].tipo === 'puerta' && ab[0].lado === 'S' && ab[0].ancho === 0.9 && ab[0].desde === 1.05, JSON.stringify(ab));
  await page.click('[data-nueva=ventana]'); await page.waitForSelector('dialog.dlg-form[open]');
  check('D. La ventana trae 1.20 m', (await page.inputValue('#fm-ancho')) === '1.20');
  await page.selectOption('#fm-lado', 'E'); await page.fill('#fm-desde', '0.5'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelectorAll('[data-ab]').length === 2);
  check('D. La ventana queda en el muro derecho a 0.5 m', (await proy()).croquis.aberturas[cocId].some(a => a.tipo === 'ventana' && a.lado === 'E' && a.desde === 0.5));
  await page.click('[data-ab] >> nth=0'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.click('dialog.dlg-form [data-eliminar]'); await page.waitForFunction(() => document.querySelectorAll('[data-ab]').length === 1);
  check('D. Se puede eliminar una puerta o ventana', (await proy()).croquis.aberturas[cocId].length === 1);

  /* ---------- E. Girar ---------- */
  await page.click('[data-nueva=puerta]'); await page.waitForSelector('dialog.dlg-form[open]'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelectorAll('[data-ab]').length === 2);
  await page.click('#cq-girar'); await wait(400);
  const girado = (await proy()).croquis;
  check('E. Girar marca el espacio girado y borra sus aberturas (cambian de lado)', girado.pos[cocId].rot === true && (girado.aberturas[cocId] || []).length === 0, JSON.stringify(girado.pos[cocId]));
  check('E. Girar de nuevo regresa a la posición normal', (await (async () => { await page.click('#cq-girar'); await wait(300); return (await proy()).croquis.pos[cocId].rot === false; })()));

  /* ---------- F. Acomodar de nuevo, PDF e imagen ---------- */
  await page.click('#cq-auto'); await wait(400);
  const pa = (await proy()).croquis.pos;
  check('F. "Acomodar de nuevo" regresa a la distribución automática', pa[cocId].x !== (pos[cocId].x) || pa[cocId].y !== pos[cocId].y);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#cq-pdf')]);
  check('F. El PDF se llama "Croquis - …"', /^Croquis - Casa Croquis - .*\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const f = SALIDA + '/croquis.pdf'; await dl.saveAs(f);
  check('F. El PDF del croquis es válido', /Pages:\s+1/.test(execSync('pdfinfo "' + f + '"').toString()));
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#cq-png')]);
  const fp = SALIDA + '/croquis.png'; await dl2.saveAs(fp);
  check('F. La imagen PNG se descarga y es una imagen', fs.readFileSync(fp).slice(1, 4).toString() === 'PNG' && fs.statSync(fp).size > 3000);

  /* ---------- G. En el reporte ---------- */
  await page.goto(BASE + '#/proyecto/' + id + '/reporte'); await page.waitForSelector('#rp-ver');
  check('G. La opción Croquis existe y viene sin marcar', await page.isVisible('input[data-op=croquis]') && !(await page.isChecked('input[data-op=croquis]')));
  await page.click('#rp-ver'); await page.waitForSelector('#rp-imprimir:not([disabled])', { timeout: 30000 });
  check('G. Sin marcar, el reporte no trae croquis', (await page.locator('.rp-croquis').count()) === 0);
  await page.goto(BASE + '#/proyecto/' + id + '/reporte'); await page.waitForSelector('#rp-ver');
  await page.check('input[data-op=croquis]'); await wait(900);
  await page.click('#rp-ver'); await page.waitForSelector('#rp-imprimir:not([disabled])', { timeout: 30000 });
  check('G. Marcado, la hoja del reporte trae el croquis con su leyenda', (await page.locator('img.rp-croquis').count()) === 1 && (await page.textContent('#hoja')).includes('no es el plano oficial') || (await page.textContent('#hoja')).includes('No es el plano oficial'));
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#rp-descargar')]);
  const f3 = SALIDA + '/reporte-croquis.pdf'; await dl3.saveAs(f3);
  check('G. El PDF del reporte con croquis es válido', /Pages:\s+[1-9]/.test(execSync('pdfinfo "' + f3 + '"').toString()));

  /* ---------- H. Copia de seguridad y pantallas chicas ---------- */
  const guardado = await page.evaluate(async i => { const x = await dbObtener('proyectos', i); return JSON.stringify(x.croquis); }, id);
  check('H. El croquis vive dentro del proyecto (entra en la copia de seguridad)', guardado.includes('aberturas') && guardado.includes('pos'));
  for (const w of [390, 800]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '#/proyecto/' + id + '/croquis'); await page.waitForSelector('#cq-canvas'); await wait(500);
    const desb = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`H. ${w}px: el croquis no desborda`, desb <= 1, String(desb));
  }
  await page.setViewportSize({ width: 1228, height: 800 });
  await page.evaluate(async i => { const es = await dbPorProyecto('espacios', i); for (const e of es) await dbBorrar('espacios', e.id); }, id);
  await page.reload(); await page.waitForSelector('text=Primero captura');
  check('H. Sin espacios, invita a capturarlos', true);

  check('I. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} correctas, ${fail} fallidas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
