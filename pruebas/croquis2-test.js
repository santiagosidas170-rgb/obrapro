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

  /* ---------- A. Catálogo y geometría ---------- */
  const g = await page.evaluate(() => ({
    n: ELEMENTOS_CROQUIS.length, unicos: new Set(ELEMENTOS_CROQUIS.map(x => x[0])).size,
    grupos: Array.from(new Set(ELEMENTOS_CROQUIS.map(x => x[2]))).sort(),
    medidasOk: ELEMENTOS_CROQUIS.every(x => x[3] > 0 && x[4] > 0 && x[3] < 5 && x[4] < 5),
    coloresOk: ELEMENTOS_CROQUIS.every(x => COLOR_GRUPO_CQ[x[2]]),
    a: cajaElemento({ x: 1, y: 2, w: 0.4, h: 0.7, rot: false }), b: cajaElemento({ x: 1, y: 2, w: 0.4, h: 0.7, rot: true }) }));
  check('A. El catálogo trae 25 elementos sin repetir', g.n === 25 && g.unicos === 25, JSON.stringify(g));
  check('A. Hay muebles, cocina, baño, estructura, instalaciones y texto', ['Baño', 'Cocina', 'Estructura', 'Instalaciones', 'Recámara', 'Sala y comedor', 'Texto'].every(x => g.grupos.includes(x)));
  check('A. Todas las medidas y colores son válidos', g.medidasOk && g.coloresOk);
  check('A. Girar intercambia ancho y largo de la caja', g.a.w === 0.4 && g.a.h === 0.7 && g.b.w === 0.7 && g.b.h === 0.4);

  const id = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa Elementos', cliente: 'Mario', estado: 'presupuestado', tipoTrabajo: 'remodelacion', fecha: '2026-11-02', archivado: false, creado: ahora(), actualizado: ahora() };
    await dbGuardar('proyectos', pr);
    const es = (n, l, a) => ({ id: nuevoId(), proyectoId: pr.id, nombre: n, tipo: n, unidad: 'm', forma: 'rectangular', largo: l, ancho: a, altura: 2.5, tramos: [], estadoActual: 'regular', trabajos: '', observaciones: '', orden: 0, creado: ahora() + n, actualizado: ahora() });
    for (const e of [es('Baño', 3, 2.5), es('Recámara', 4, 3.5)]) await dbGuardar('espacios', e);
    return pr.id;
  });
  const proy = () => page.evaluate(i => dbObtener('proyectos', i), id);
  const elementos = async () => ((await proy()).croquis || {}).elementos || [];
  await page.goto(BASE + '#/proyecto/' + id + '/croquis'); await page.waitForSelector('#cq-canvas'); await wait(500);
  const cam = () => page.evaluate(() => { const v = document.querySelector('#cq-canvas').vistaActual(); return { k: v.k, ox: v.ox, oy: v.oy }; });
  const rectCanvas = () => page.evaluate(() => { const c = document.querySelector('#cq-canvas'); c.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });

  /* ---------- B. Agregar elementos ---------- */
  const k0 = await cam();
  check('B. Hay botón "Agregar elemento"', await page.isVisible('#cq-agregar'));
  await page.click('#cq-agregar'); await page.waitForSelector('dialog.dlg-form[open]');
  const opciones = await page.$$eval('#fm-tipo option', os => os.map(o => o.textContent));
  check('B. El formulario ofrece los 25 elementos con su grupo', opciones.length === 25 && opciones.some(o => o.startsWith('Baño · WC')), String(opciones.length));
  await page.selectOption('#fm-tipo', 'wc'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelector('#cq-edel'));
  let el = await elementos();
  check('B. El WC se guarda con 0.40 × 0.70 m', el.length === 1 && el[0].tipo === 'wc' && el[0].w === 0.4 && el[0].h === 0.7 && el[0].rot === false, JSON.stringify(el));
  check('B. Queda elegido y su panel muestra sus acciones', (await page.textContent('#cq-sel')).includes('WC') && await page.isVisible('#cq-egirar') && await page.isVisible('#cq-etam'));

  /* nota: pide el texto */
  await page.click('#cq-agregar'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.selectOption('#fm-tipo', 'nota'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForSelector('#toast:has-text("Escribe el texto")'); await page.waitForSelector('dialog.dlg-form[open]');
  check('B. Una nota sin texto avisa y vuelve a abrir el formulario', (await elementos()).length === 1);
  await page.selectOption('#fm-tipo', 'nota'); await page.fill('#fm-texto', 'Quitar este muro'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelector('#cq-sel').textContent.includes('Quitar este muro'));
  el = await elementos();
  check('B. La nota se guarda con su texto', el.length === 2 && el[1].tipo === 'nota' && el[1].texto === 'Quitar este muro');

  /* ---------- C. Girar, tamaño, duplicar, eliminar ---------- */
  await page.click('#cq-etam'); await page.waitForSelector('dialog.dlg-form[open]');
  check('C. Cambiar texto de una nota abre el texto actual', (await page.inputValue('#fm-texto')) === 'Quitar este muro');
  await page.fill('#fm-texto', 'Aquí va la tina'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelector('#cq-sel').textContent.includes('Aquí va la tina'));
  check('C. El texto nuevo se guarda', (await elementos())[1].texto === 'Aquí va la tina');
  await page.click('#cq-edel'); await page.waitForFunction(() => !document.querySelector('#cq-edel'));
  check('C. Eliminar quita la nota', (await elementos()).length === 1);

  /* elegir el WC tocándolo: sale por su posición en pantalla */
  const posEl = async tipo => page.evaluate(async ([i, t]) => {
    const p = await dbObtener('proyectos', i), e = p.croquis.elementos.find(x => x.tipo === t), c = document.querySelector('#cq-canvas');
    c.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = c.getBoundingClientRect(), v = c.vistaActual(), b = cajaElemento(e);
    return { x: r.left + pxX(v, b.x + b.w / 2), y: r.top + pxY(v, b.y + b.h / 2), k: v.k, e };
  }, [id, tipo]);
  let w = await posEl('wc');
  await page.mouse.click(w.x + 2000 > 0 ? w.x : w.x, w.y);
  check('C. Tocar un elemento lo elige (aunque sea chico)', (await page.textContent('#cq-sel')).includes('WC'));
  await page.click('#cq-egirar'); await wait(250);
  el = await elementos();
  check('C. Girar 90° guarda el giro', el[0].rot === true);
  await page.click('#cq-etam'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-ancho', '0'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForSelector('#toast:has-text("mayores que cero")'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.fill('#fm-ancho', '0,5'); await page.fill('#fm-largo', '0.8'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelector('#cq-sel').textContent.includes('0.50'));
  el = await elementos();
  check('C. Cambiar tamaño valida y guarda (0.50 × 0.80)', el[0].w === 0.5 && el[0].h === 0.8);
  await page.click('#cq-edup'); await wait(300);
  el = await elementos();
  check('C. Duplicar crea otro igual, un poco desplazado', el.length === 2 && el[1].tipo === 'wc' && el[1].id !== el[0].id && Math.abs(el[1].x - el[0].x - 0.3) < 1e-6);

  /* ---------- D. Arrastrar y teclado ---------- */
  w = await posEl('wc'); const antes = (await elementos())[1];
  await page.mouse.move(w.x, w.y); await page.mouse.down();
  await page.mouse.move(w.x + 1.0 * w.k / 2, w.y, { steps: 3 }); await page.mouse.move(w.x + 1.0 * w.k, w.y, { steps: 3 }); await page.mouse.up(); await wait(300);
  el = await elementos(); const mov = el.find(e => e.id === antes.id);
  check('D. Arrastrar mueve el elemento (≈ +1.0 m en x)', Math.abs((mov.x - antes.x) - 1.0) < 0.25 && Math.abs(mov.y - antes.y) < 0.12, JSON.stringify([antes, mov]));
  await page.focus('#cq-canvas'); const x1 = mov.x;
  await page.keyboard.press('ArrowRight'); await wait(250);
  check('D. Las flechas mueven 5 cm el elemento elegido', Math.abs(((await elementos()).find(e => e.id === antes.id).x) - x1 - 0.05) < 1e-6);
  await page.keyboard.press('Delete'); await page.waitForFunction(() => !document.querySelector('#cq-edel'));
  check('D. La tecla Suprimir elimina el elemento elegido', (await elementos()).length === 1);

  /* ---------- E. Zoom y mover la vista ---------- */
  const k1 = await cam();
  await page.click('#cq-zmas'); await page.click('#cq-zmas');
  const k2 = await cam();
  check('E. El botón ＋ acerca', k2.k > k1.k * 1.5, JSON.stringify([k1, k2]));
  await page.click('#cq-zmenos'); await page.click('#cq-zmenos'); await page.click('#cq-zmenos');
  const k3 = await cam();
  check('E. El botón － aleja', k3.k < k2.k);
  const rc = await rectCanvas(), posAntes = JSON.stringify((await proy()).croquis.pos);
  await page.mouse.move(rc.l + 6, rc.t + 6); await page.mouse.down(); await page.mouse.move(rc.l + 66, rc.t + 36, { steps: 4 }); await page.mouse.up(); await wait(250);
  const k4 = await cam();
  check('E. Arrastrar el fondo mueve la vista sin mover los espacios', Math.abs((k4.ox - k3.ox) - 60) < 2 && Math.abs((k4.oy - k3.oy) - 30) < 2 && JSON.stringify((await proy()).croquis.pos) === posAntes, JSON.stringify([k3, k4]));
  await page.mouse.move(rc.l + rc.w / 2, rc.t + rc.h / 2); await page.mouse.wheel(0, -300); await wait(200);
  check('E. La rueda del ratón acerca', (await cam()).k > k4.k);
  /* pellizco simulado con dos punteros */
  const kp0 = (await cam()).k;
  await page.evaluate(() => {
    const c = document.querySelector('#cq-canvas'), r = c.getBoundingClientRect(), mk = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: id === 31 }));
    mk('pointerdown', 31, 400, 200); mk('pointerdown', 32, 500, 200); mk('pointermove', 32, 700, 200); mk('pointerup', 32, 700, 200); mk('pointerup', 31, 400, 200);
  });
  const kp1 = (await cam()).k;
  check('E. Pellizcar con dos dedos acerca', kp1 > kp0 * 1.5, JSON.stringify([kp0, kp1]));
  await page.click('#cq-todo'); await wait(200);
  const k5 = await cam();
  check('E. "Ver todo" regresa al encuadre original', Math.abs(k5.k - k1.k) / k1.k < 0.05, JSON.stringify([k1, k5]));

  /* ---------- F. Persistencia y salida ---------- */
  await page.reload(); await page.waitForSelector('#cq-canvas'); await wait(500);
  check('F. Tras recargar, los elementos siguen ahí', (await elementos()).length === 1);
  const pint = await page.evaluate(() => { const c = document.querySelector('#cq-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 68) if (d[i] < 200) n++; return n; });
  check('F. El croquis con elementos se dibuja', pint > 200, String(pint));
  await page.click('#cq-agregar'); await page.waitForSelector('dialog.dlg-form[open]'); await page.selectOption('#fm-tipo', 'cama-matrimonial'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelector('#cq-edel'));
  await page.click('#cq-agregar'); await page.waitForSelector('dialog.dlg-form[open]'); await page.selectOption('#fm-tipo', 'contacto'); await page.click('dialog.dlg-form button[value=ok]');
  await page.waitForFunction(() => document.querySelectorAll('#cq-edel').length === 1 && document.querySelector('#cq-sel').textContent.includes('Contacto'));
  check('F. Agregar varios elementos distintos funciona', (await elementos()).length === 3);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#cq-pdf')]);
  const f = SALIDA + '/croquis-elementos.pdf'; await dl.saveAs(f);
  check('F. El PDF con elementos es válido', /Pages:\s+1/.test(execSync('pdfinfo "' + f + '"').toString()));
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#cq-png')]);
  const fp = SALIDA + '/croquis-elementos.png'; await dl2.saveAs(fp);
  check('F. La imagen con elementos se descarga', fs.readFileSync(fp).slice(1, 4).toString() === 'PNG' && fs.statSync(fp).size > 4000);
  await page.goto(BASE + '#/proyecto/' + id + '/reporte'); await page.waitForSelector('#rp-ver');
  await page.check('input[data-op=croquis]'); await wait(900);
  await page.click('#rp-ver'); await page.waitForSelector('#rp-imprimir:not([disabled])', { timeout: 30000 });
  check('F. El reporte incluye el croquis con los elementos', (await page.locator('img.rp-croquis').count()) === 1);
  const bytes = await page.evaluate(() => document.querySelector('img.rp-croquis').src.length);
  check('F. La imagen del croquis en el reporte tiene contenido', bytes > 5000, String(bytes));

  /* ---------- G. Pantallas chicas y copia ---------- */
  const copia = await page.evaluate(async i => JSON.stringify((await dbObtener('proyectos', i)).croquis.elementos.map(e => e.tipo)), id);
  check('G. Los elementos viven en el proyecto (entran a la copia de seguridad)', JSON.parse(copia).sort().join() === 'cama-matrimonial,contacto,wc', copia);
  for (const wpx of [390, 800]) {
    await page.setViewportSize({ width: wpx, height: 900 });
    await page.goto(BASE + '#/proyecto/' + id + '/croquis'); await page.waitForSelector('#cq-canvas'); await wait(500);
    const desb = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`G. ${wpx}px: los botones y el croquis no desbordan`, desb <= 1, String(desb));
  }
  check('H. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} correctas, ${fail} fallidas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
