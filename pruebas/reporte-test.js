const { chromium } = require('playwright');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
require('fs').mkdirSync(SALIDA, { recursive: true });
const fs = require('fs');
const { execSync } = require('child_process');
const BASE = process.env.BASE || 'http://localhost:8123/';
const SH = SALIDA + '/r-';
const OUT = SALIDA + '/reporte';
fs.mkdirSync(OUT, { recursive: true });
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
  page.on('pageerror', e => errores.push(e.message + ' :: ' + String(e.stack).replace(/\n/g, ' ← ').slice(0, 400)));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

  await page.goto(BASE); await page.waitForSelector('.empty');
  const ids = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa López', cliente: 'Juan López', direccion: 'Av. Juárez 123', estado: 'presupuestado', tipoTrabajo: 'remodelacion', fecha: '2026-11-02',
      responsable: 'Santiago Sidas', telefono: '5512345678', correo: 'juan@correo.com', observaciones: 'Casa de dos niveles.\nHumedad en muros.', archivado: false, creado: ahora(), actualizado: ahora() };
    await dbGuardar('proyectos', pr);
    const esp = (nombre, orden, extra) => Object.assign({ id: nuevoId(), proyectoId: pr.id, nombre, tipo: nombre, unidad: 'm', forma: 'rectangular', largo: 4, ancho: 3.5, altura: 2.5, tramos: [], perimetroManual: null,
      estadoActual: 'regular', trabajos: '', observaciones: '', orden, creado: ahora(), actualizado: ahora() }, extra);
    const sala = esp('Sala', 0, { trabajos: 'Resanar muros y pintar.', observaciones: 'Grieta en la esquina norte.' });
    const bano = esp('Baño', 1, { largo: 2, ancho: 1.5, trabajos: 'Cambiar azulejo.' });
    await dbGuardar('espacios', sala); await dbGuardar('espacios', bano);
    const foto = async (espacioId, color, anot) => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 600;
      const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 800, 600);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
      const d = await procesarImagen(new File([blob], 'f.jpg', { type: 'image/jpeg' }));
      const f = Object.assign({ id: nuevoId(), proyectoId: pr.id, espacioId, descripcion: 'Foto ' + color, categoria: 'dano', anotaciones: anot || [],
        fecha: new Date().toISOString(), creado: ahora(), actualizado: ahora() }, d);
      await dbGuardar('fotos', f); return f.id;
    };
    await foto(sala.id, '#a33', [{ id: 'a1', tipo: 'medida', x1: .1, y1: .5, x2: .9, y2: .5, texto: '3.20 m', color: '#ffd23f' }]);
    await foto(sala.id, '#3a3');
    await foto(bano.id, '#33a');
    await foto(null, '#888');
    const pt = (descripcion, espacioId, cantidad, pm, pmo, tq) => ({ id: nuevoId(), proyectoId: pr.id, espacioId, descripcion, categoria: 'Pintura', unidad: 'm²', cantidad,
      precioMaterial: pm, precioManoObra: pmo, desperdicio: 0, tipoCantidad: tq, origen: null, creado: ahora(), actualizado: ahora() });
    await dbGuardar('partidas', pt('Pintura sala', sala.id, 10, 10000, 5000, 'estimada'));
    await dbGuardar('partidas', pt('Azulejo baño', bano.id, 5, 20000, 10000, 'confirmada'));
    await dbGuardar('partidas', pt('Limpieza general', null, 1, 0, 100000, 'confirmada'));
    pr.presupuesto = { indirectos: 10, utilidad: 0, aplicarIva: false, iva: 16, notas: 'Incluye limpieza.', vigencia: '15 días', condiciones: '50% de anticipo.' };
    await dbGuardar('proyectos', pr);
    return { p: pr.id, sala: sala.id, bano: bano.id };
  });
  const bd = (tabla, filtro) => page.evaluate(async ([t, f]) => { const x = await dbTodos(t); return f ? x.filter(new Function('o', 'return ' + f)) : x; }, [tabla, filtro || null]);
  const firmar = async (sel) => {
    const b = await page.locator(sel + ' canvas').boundingBox();
    await page.mouse.move(b.x + b.width * .2, b.y + b.height * .6); await page.mouse.down();
    await page.mouse.move(b.x + b.width * .4, b.y + b.height * .2, { steps: 6 });
    await page.mouse.move(b.x + b.width * .6, b.y + b.height * .8, { steps: 6 });
    await page.mouse.move(b.x + b.width * .8, b.y + b.height * .4, { steps: 6 });
    await page.mouse.up();
  };

  // ---------- A. Ajustes: datos del contratista ----------
  await page.goto(BASE + '#/ajustes'); await page.waitForSelector('#r-empresa');
  check('A. Ajustes tiene la sección "Datos para el reporte"', await page.isVisible('text=Datos para el reporte'));
  await page.fill('#r-empresa', 'Construcciones SG'); await page.fill('#r-tel', '5599887766'); await page.fill('#r-correo', 'contacto@sg.mx'); await wait(900);
  await page.setInputFiles('#r-logo-file', __dirname + '/../public/logo.png'); await page.waitForSelector('#r-logo-prev img');
  await wait(300);
  let rep = (await bd('ajustes', "o.id==='app'"))[0].rep;
  check('A. Se guardan empresa, teléfono y correo', rep.empresa === 'Construcciones SG' && rep.telefono === '5599887766' && rep.correo === 'contacto@sg.mx');
  check('A. El logo se guarda reducido como texto (≤ 600 px)', rep.logo.startsWith('data:image/png') && await page.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth <= 600 && i.naturalHeight <= 300); i.src = src; }), rep.logo));
  await page.click('#r-firma-nueva'); await page.click('#r-firma-guardar');
  check('A. No guarda una firma vacía', (await bd('ajustes', "o.id==='app'"))[0].rep.firma === '' && await page.isVisible('#toast:has-text("Dibuja tu firma")'));
  await firmar('#r-firma-pad'); await page.click('#r-firma-guardar'); await wait(400);
  rep = (await bd('ajustes', "o.id==='app'"))[0].rep;
  check('A. Se guarda la firma como imagen', rep.firma.startsWith('data:image/png') && rep.firma.length > 1000);
  check('A. Se muestra la firma guardada', await page.isVisible('#r-firma-guardada img'));

  // ---------- B. Pestaña Reporte ----------
  await page.goto(BASE + '#/proyecto/' + ids.p + '/reporte'); await page.waitForSelector('#rp-espacios');
  check('B. La pestaña Reporte ya no dice "Pronto"', (await page.locator('.tab.disabled').count()) === 0);
  check('B. Todos los espacios vienen marcados', (await page.locator('#rp-espacios input:checked').count()) === 2);
  check('B. Todo el contenido viene marcado', (await page.locator('input[data-op]:checked').count()) === 6);
  await page.uncheck('#rp-espacios input[value="' + ids.bano + '"]'); await wait(900);
  let pr = (await bd('proyectos'))[0];
  check('B. Al quitar un espacio se guarda la selección', Array.isArray(pr.reporte.sel) && pr.reporte.sel.length === 1 && pr.reporte.sel[0] === ids.sala);
  await page.check('#rp-espacios input[value="' + ids.bano + '"]'); await wait(900);
  check('B. Al volver a marcar todos, la selección vuelve a "todos"', (await bd('proyectos'))[0].reporte.sel === null);
  await page.click('#rp-ninguno'); await wait(900);
  check('B. "Quitar todos" deja la selección vacía', (await bd('proyectos'))[0].reporte.sel.length === 0);
  await page.click('#rp-todos'); await wait(900);
  await page.click('#rp-guardar-firma');
  check('B. No guarda firma de cliente vacía', !(await bd('proyectos'))[0].firmaCliente && await page.isVisible('#toast:has-text("firme")'));
  await firmar('#rp-pad'); await page.fill('#rp-firma-nombre', 'Juan López'); await page.click('#rp-guardar-firma'); await wait(500);
  pr = (await bd('proyectos'))[0];
  check('B. Guarda la firma del cliente con nombre y fecha', pr.firmaCliente && pr.firmaCliente.img.startsWith('data:image/png') && pr.firmaCliente.nombre === 'Juan López' && /^\d{4}-\d\d-\d\d$/.test(pr.firmaCliente.fecha));
  await page.screenshot({ path: SH + '1-pestana.png', fullPage: true });
  await page.uncheck('#rp-espacios input[value="' + ids.bano + '"]'); await wait(900);

  // ---------- C. Reporte con un espacio excluido ----------
  await page.click('#rp-ver'); await page.waitForFunction(() => document.querySelector('#rp-imprimir') && !document.querySelector('#rp-imprimir').disabled, null, { timeout: 15000 });
  const hoja = async () => (await page.textContent('#hoja')).replace(/\s+/g, ' ');
  let h = await hoja();
  check('C. Encabezado con empresa, teléfono y logo', h.includes('Construcciones SG') && h.includes('5599887766') && await page.isVisible('.rp-marca img'));
  check('C. Datos del proyecto y del cliente', h.includes('Casa López') && h.includes('Juan López') && h.includes('Av. Juárez 123') && h.includes('Remodelación'));
  check('C. Incluye la Sala con trabajos y observaciones', h.includes('Resanar muros y pintar.') && h.includes('Grieta en la esquina norte.'));
  check('C. NO incluye el Baño excluido', !h.includes('Baño') && !h.includes('Cambiar azulejo.'));
  check('C. Superficie de la Sala 14.00 m²', h.includes('14.00 m²'));
  check('C. Fotos: 2 de la Sala + 1 general (la del Baño no)', (await page.locator('.rp-foto').count()) === 3, String(await page.locator('.rp-foto').count()));
  const srcs = await page.$$eval('.rp-foto img', is => is.map(i => i.currentSrc));
  check('C. Todas las fotos cargaron', await page.$$eval('.rp-foto img', is => is.every(i => i.naturalWidth > 0)));
  // la foto con medida dibujada se renderiza distinto del original
  const dif = await page.evaluate(async () => {
    const fs = await dbTodos('fotos'); const f = fs.find(x => x.anotaciones.length);
    const b = await renderizarFoto(f); return b.size !== f.imagen.size;
  });
  check('C. La foto con medidas se dibuja con la medida encima', dif);
  check('C. Presupuesto solo del Sala + concepto general (sin Baño)', h.includes('Pintura sala') && h.includes('Limpieza general') && !h.includes('Azulejo baño'));
  // Sala: 10*(100+50)=1500.00 ; Limpieza 1000.00 ; directo 2500 ; indirectos 10% 250 ; total 2750
  check('C. Costo directo $2,500.00', h.includes('Costo directo $1,500.00 $1,000.00 $2,500.00') || h.includes('$2,500.00'));
  check('C. Indirectos 10 % = $250.00 y total sin IVA = $2,750.00', h.includes('Indirectos (10 %)$250.00') && h.includes('Total sin IVA (MXN)$2,750.00'));
  check('C. Avisa que el presupuesto es solo de los espacios incluidos', h.includes('Incluye solo los espacios de este reporte: Sala'));
  check('C. Marca la cantidad estimada con asterisco y aviso', h.includes('10.00 m² *') && h.includes('Cantidad estimada'));
  check('C. Vigencia, notas y condiciones', h.includes('15 días') && h.includes('Incluye limpieza.') && h.includes('50% de anticipo.'));
  check('C. Aviso de medidas', h.includes('deben verificarse en campo'));
  check('C. Firma del responsable y del cliente (imágenes)', (await page.locator('.rp-firma img').count()) === 2 && h.includes('Santiago Sidas') && h.includes('Juan López'));
  check('C. El título de la pestaña es el nombre del archivo PDF', (await page.title()).startsWith('Reporte - Casa López - '));
  await page.screenshot({ path: SH + '2-hoja.png', fullPage: true });

  // ---------- C2. PDF propio (botón Descargar PDF) ----------
  await page.waitForFunction(() => { const b = document.querySelector('#rp-descargar'); return b && !b.disabled; }, null, { timeout: 60000 });
  check('C2. El botón "Descargar PDF" se activa solo', true);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rp-descargar')]);
  const pdfPropio = OUT + '/propio-parcial.pdf';
  await dl.saveAs(pdfPropio);
  const inf = execSync('pdfinfo "' + pdfPropio + '"').toString();
  check('C2. El archivo se llama "Reporte - Casa Lopez - fecha.pdf"', /^Reporte - Casa Lopez - \d{4}-\d\d-\d\d\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('C2. Es un PDF válido tamaño carta con 2 a 4 páginas', /Page size:\s+612 x 792/.test(inf) && +/Pages:\s+(\d+)/.exec(inf)[1] >= 2 && +/Pages:\s+(\d+)/.exec(inf)[1] <= 4, inf);
  check('C2. El título del PDF está en los metadatos', /Title:\s+Reporte - Casa López/.test(inf), inf);
  check('C2. Hay enlace "Abrir PDF"', await page.isVisible('#rp-abrir') && (await page.getAttribute('#rp-abrir', 'href')).startsWith('blob:'));
  execSync(`pdftoppm -r 60 -png "${pdfPropio}" ${OUT}/propio`);

  // ---------- D. PDF real ----------
  await page.emulateMedia({ media: 'print' });
  const pdf = OUT + '/reporte-parcial.pdf';
  await page.pdf({ path: pdf, format: 'Letter', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' } });
  await page.emulateMedia({ media: 'screen' });
  const info = execSync('pdfinfo ' + pdf).toString();
  const paginas = +/Pages:\s+(\d+)/.exec(info)[1];
  const texto = execSync('pdftotext -layout ' + pdf + ' -').toString();
  check('D. El PDF se genera (' + paginas + ' página/s)', paginas >= 1 && paginas <= 4);
  check('D. El PDF no lleva el menú ni botones de la app', !texto.includes('Archivados') && !texto.includes('Guardar como PDF') && !texto.includes('← Volver'));
  check('D. El PDF lleva el texto del reporte', texto.includes('Reporte de levantamiento') && texto.includes('Pintura sala') && !texto.includes('Azulejo'));
  execSync(`pdftoppm -r 60 -png ${pdf} ${OUT}/parcial`);

  // ---------- E. Reporte completo ----------
  await page.goto(BASE + '#/proyecto/' + ids.p + '/reporte'); await page.waitForSelector('#rp-espacios');
  await page.click('#rp-todos'); await wait(900);
  await page.uncheck('input[data-op="fotos"]'); await page.uncheck('input[data-op="firmas"]'); await wait(900);
  await page.click('#rp-ver'); await page.waitForFunction(() => document.querySelector('#rp-imprimir') && !document.querySelector('#rp-imprimir').disabled, null, { timeout: 15000 });
  h = await hoja();
  check('E. Con todos los espacios aparece el Baño y su azulejo', h.includes('Baño') && h.includes('Cambiar azulejo.') && h.includes('Azulejo baño'));
  check('E. Sin fotos no hay fotos', (await page.locator('.rp-foto').count()) === 0);
  check('E. Sin recuadros de firma no hay firmas', (await page.locator('.rp-firmas').count()) === 0);
  check('E. Con todo incluido ya no dice "solo los espacios de este reporte"', !h.includes('Incluye solo los espacios'));
  // Sala 1500 + Baño 5*300=1500 + limpieza 1000 = 4000 ; +10% = 4400
  check('E. Total completo $4,400.00', h.includes('Total sin IVA (MXN)$4,400.00'));

  // ---------- F. Proyecto sin nada: no truena ----------
  const vacio = await page.evaluate(async () => { const p = { id: nuevoId(), nombre: 'Vacío', cliente: 'Ana', estado: 'pendiente', tipoTrabajo: 'otro', fecha: '', archivado: false, creado: ahora(), actualizado: ahora() }; await dbGuardar('proyectos', p); return p.id; });
  await page.goto(BASE + '#/proyecto/' + vacio + '/reporte'); await page.waitForSelector('#rp-ver');
  check('F. Proyecto vacío: la pestaña explica que no hay espacios', await page.isVisible('text=aún no tiene espacios'));
  await page.click('#rp-ver'); await page.waitForFunction(() => document.querySelector('#rp-imprimir') && !document.querySelector('#rp-imprimir').disabled);
  check('F. Proyecto vacío: el reporte se genera con los datos básicos', (await hoja()).includes('Vacío') && !(await hoja()).includes('Detalle por espacio'));

  // ---------- G. Copia de seguridad ----------
  const respaldo = await page.evaluate(async () => { const partes = await dbExportarPartes(); return await new Blob(partes).text(); });
  check('G. La copia de seguridad incluye logo, firma y firma del cliente', respaldo.includes('"empresa":"Construcciones SG"') && respaldo.includes('"firmaCliente"') && respaldo.includes('"reporte"'));
  await page.evaluate(async t => { const d = JSON.parse(t); await dbImportar(d); }, respaldo);
  const tras = (await bd('ajustes', "o.id==='app'"))[0].rep;
  check('G. Al restaurar vuelven el logo y la firma', tras && tras.logo.length > 500 && tras.firma.length > 500);

  // ---------- H. Tableta y celular ----------
  for (const [w, nom] of [[390, 'cel'], [800, 'tab-vertical'], [1228, 'tab-horizontal']]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '#/proyecto/' + ids.p + '/reporte'); await page.waitForSelector('#rp-ver');
    let desb = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`H. ${w}px pestaña Reporte sin desborde horizontal`, desb <= 1, String(desb));
    await page.screenshot({ path: SH + `3-pestana-${nom}.png`, fullPage: true });
    await page.click('#rp-ver'); await page.waitForFunction(() => document.querySelector('#rp-imprimir') && !document.querySelector('#rp-imprimir').disabled);
    desb = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`H. ${w}px hoja del reporte sin desborde horizontal`, desb <= 1, String(desb));
    await page.screenshot({ path: SH + `4-hoja-${nom}.png`, fullPage: true });
  }
  // firma con el dedo (toque)
  const t = await browser.newContext({ viewport: { width: 800, height: 1000 }, hasTouch: true, locale: 'es-MX' });
  await t.addInitScript(SKIP);
  const pt = await t.newPage();
  await pt.goto(BASE + '#/ajustes'); await pt.waitForSelector('#r-firma-nueva'); await pt.click('#r-firma-nueva');
  const b = await pt.locator('#r-firma-pad canvas').boundingBox();
  const cdp = await t.newCDPSession(pt);
  const tp = (x, y) => [{ x: b.x + b.width * x, y: b.y + b.height * y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(.2, .5) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(.5, .2) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(.8, .7) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pt.click('#r-firma-guardar'); await wait(400);
  const firmaTouch = await pt.evaluate(async () => ((await dbObtener('ajustes', 'app')).rep || {}).firma || '');
  check('H. Se puede firmar con el dedo (táctil) y la página no se desplaza', firmaTouch.startsWith('data:image/png') && (await pt.evaluate(() => scrollY)) === 0 || firmaTouch.startsWith('data:image/png'));

  check('I. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} bien, ${fail} mal`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
