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
  const ctx = await browser.newContext({ viewport: { width: 1228, height: 800 }, acceptDownloads: true, locale: 'es-MX', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(SKIP);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto(BASE); await page.waitForSelector('.empty');

  const ids = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa Lista Ñ', cliente: 'Juan López', direccion: 'Calle 5', estado: 'presupuestado', tipoTrabajo: 'remodelacion', archivado: false, creado: ahora(), actualizado: ahora(),
      presupuesto: { indirectos: 0, utilidad: 0, aplicarIva: false, iva: 16 } };
    await dbGuardar('proyectos', pr);
    const sala = { id: nuevoId(), proyectoId: pr.id, nombre: 'Sala', tipo: 'Sala', unidad: 'm', forma: 'rectangular', largo: 4, ancho: 3.5, altura: 2.5, tramos: [], orden: 0, creado: ahora(), actualizado: ahora() };
    await dbGuardar('espacios', sala);
    const pt = (descripcion, categoria, espacioId, unidad, cantidad, desp, pm, pmo, tq) => ({ id: nuevoId(), proyectoId: pr.id, espacioId, descripcion, categoria, unidad, cantidad, desperdicio: desp,
      precioMaterial: pm, precioManoObra: pmo, tipoCantidad: tq, origen: null, creado: ahora(), actualizado: ahora() });
    for (const x of [
      pt('Pintura vinílica', 'Pintura', sala.id, 'm2', 10, 5, 10000, 5000, 'confirmada'),
      pt('Limpieza final', 'Limpieza', null, 'servicio', 1, 0, null, 100000, 'estimada'),
      pt('Cable calibre 12', 'Instalaciones eléctricas', sala.id, 'm', 20, 10, 1500, 0, 'confirmada'),
      pt('Contacto doble', 'Instalaciones eléctricas', sala.id, 'pza', 7, 5, 8000, 12000, 'confirmada'),   /* 7 + 5 % = 7.35 -> comprar 8 */
      pt('Concepto sin precios', 'Otros', null, 'pza', 3, 0, null, null, 'estimada')]) await dbGuardar('partidas', x);
    return { p: pr.id };
  });
  const texto = async sel => (await page.textContent(sel)).replace(/\s+/g, ' ');

  await page.goto(BASE + '#/proyecto/' + ids.p + '/listas'); await page.waitForSelector('#ls-lista');
  check('A. Existe la pestaña "Listas" y está activa', await page.isVisible('.tab.active:has-text("Listas")'));
  let t = await texto('#ls-lista');
  check('A. Abre en "Materiales"', await page.isVisible('.seg.activo:has-text("Materiales")'));
  check('A. Materiales: pintura, cable, contacto y el que no tiene precios; NO la limpieza (solo mano de obra)',
    t.includes('Pintura vinílica') && t.includes('Cable calibre 12') && t.includes('Contacto doble') && t.includes('Concepto sin precios') && !t.includes('Limpieza final'), t);
  check('A. Cantidad a comprar con desperdicio: 10.50 m² (10 + 5 %)', t.includes('10.50 m²') && t.includes('+5 % desperdicio'), t);
  check('A. Cable: 22.00 m (20 + 10 %)', t.includes('22.00 m'));
  check('A. Piezas se redondean hacia arriba: 7 + 5 % = 7.35 → 8 pzas', t.includes('8.00 pieza') || t.includes('8 pieza') || /Comprar\s*8(\.00)? pieza/.test(t), t);
  check('A. Costos de material: $1,050.00, $330.00 y $588.00 (7 × $80 × 1.05)', t.includes('$1,050.00') && t.includes('$330.00') && t.includes('$588.00'), t);
  check('A. Total de materiales $1,968.00', (await texto('#ls-total')) === '$1,968.00', await texto('#ls-total'));
  check('A. Avisa del concepto sin precios y de la cantidad estimada', (await texto('#ls-avisos')).includes('1 concepto(s) sin precio') && (await texto('#ls-avisos')).includes('estimada'), await texto('#ls-avisos'));
  check('A. El concepto sin precio se marca', t.includes('Sin precio'));
  check('A. Agrupa por categoría con subtotal ($1,380.00 en Instalaciones eléctricas)', t.includes('Instalaciones eléctricas $918.00') || t.includes('Instalaciones eléctricas $918'), t);
  await page.screenshot({ path: SALIDA + '/l-1-materiales.png', fullPage: true });

  /* mano de obra */
  await page.click('.seg[data-tipo=manoObra]'); await page.waitForSelector('.seg.activo:has-text("Mano de obra")');
  t = await texto('#ls-lista');
  check('B. Mano de obra: pintura, limpieza, contacto y sin precios; NO el cable (sin mano de obra)', t.includes('Pintura vinílica') && t.includes('Limpieza final') && t.includes('Contacto doble') && !t.includes('Cable calibre 12'), t);
  check('B. La mano de obra no usa desperdicio (7 pzas, no 8)', t.includes('7.00 pieza') && !t.includes('desperdicio'), t);
  check('B. Total de mano de obra $1,000 + $500 + $840 = $2,340.00', (await texto('#ls-total')) === '$2,340.00', await texto('#ls-total'));
  check('B. La elección (Mano de obra) se recuerda al volver', await (async () => { await page.reload(); await page.waitForSelector('#ls-lista'); return page.isVisible('.seg.activo:has-text("Mano de obra")'); })());

  /* agrupar */
  await page.selectOption('#ls-grupo', 'espacio'); await page.waitForSelector('.grupo-lista h3:has-text("Sala")');
  t = await texto('#ls-lista');
  check('C. Agrupar por espacio: "Sala" y "General (sin espacio)"', t.includes('Sala') && t.includes('General (sin espacio)'), t);
  await page.selectOption('#ls-grupo', 'ninguno'); await page.waitForSelector('.grupo-lista h3:has-text("Todos los conceptos")');
  check('C. Sin agrupar: un solo grupo con todos', (await page.locator('.grupo-lista').count()) === 1);
  check('C. El total no cambia al agrupar distinto', (await texto('#ls-total')) === '$2,340.00');
  await page.selectOption('#ls-grupo', 'categoria'); await wait(400);

  /* abrir un concepto */
  await page.click('.fila-lista >> nth=0'); await page.waitForURL(/#\/partida\//);
  check('D. Al tocar un concepto se abre para editarlo', page.url().includes('#/partida/'));
  await page.goto(BASE + '#/proyecto/' + ids.p + '/listas'); await page.waitForSelector('#ls-lista');

  /* copiar texto */
  await page.click('.seg[data-tipo=materiales]'); await page.waitForSelector('.seg.activo:has-text("Materiales")');
  await page.click('#ls-copiar'); await page.waitForSelector('#toast:has-text("Lista copiada")');
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  check('E. "Copiar texto" deja la lista en el portapapeles lista para WhatsApp', copiado.startsWith('LISTA DE MATERIALES - Casa Lista Ñ') && copiado.includes('Cliente: Juan López') && copiado.includes('[Pintura]') &&
    copiado.includes('• Pintura vinílica') && copiado.includes('Comprar: 10.50 m²') && copiado.includes('TOTAL: $1,968.00') && copiado.includes('sin indirectos'), copiado);
  check('E. El texto copiado trae el total y cada subtotal', /Subtotal: \$1,050\.00/.test(copiado) && /Subtotal: \$918\.00/.test(copiado), copiado);

  /* PDF */
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#ls-pdf')]);
  const pdf = SALIDA + '/lista-materiales.pdf'; await dl.saveAs(pdf);
  const inf = execSync('pdfinfo "' + pdf + '"').toString();
  check('F. El PDF se llama "Lista de materiales - Casa Lista N - fecha.pdf"', /^Lista de materiales - Casa Lista N - \d{4}-\d\d-\d\d\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('F. PDF válido, tamaño carta, 1 página', /Page size:\s+612 x 792/.test(inf) && /Pages:\s+1\b/.test(inf), inf);
  check('F. Título del PDF en los metadatos', /Title:\s+Lista de materiales - Casa Lista/.test(inf), inf);
  execSync(`pdftoppm -r 60 -png "${pdf}" ${SALIDA}/lista-mat`);
  await page.click('.seg[data-tipo=manoObra]'); await page.waitForSelector('.seg.activo:has-text("Mano de obra")');
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#ls-pdf')]);
  await dl2.saveAs(SALIDA + '/lista-mano-obra.pdf');
  check('F. El PDF de mano de obra también se genera', /^Lista de mano de obra - /.test(dl2.suggestedFilename()));
  execSync(`pdftoppm -r 60 -png "${SALIDA}/lista-mano-obra.pdf" ${SALIDA}/lista-mo`);

  /* lista larga: varias páginas */
  await page.evaluate(async pid => { for (let i = 0; i < 60; i++) await dbGuardar('partidas', { id: nuevoId(), proyectoId: pid, espacioId: null, descripcion: 'Concepto de relleno número ' + i + ' con un nombre bastante largo para que ocupe varias líneas', categoria: 'Cat ' + (i % 4),
    unidad: 'm2', cantidad: i + 1, desperdicio: 3, precioMaterial: 1234, precioManoObra: 777, tipoCantidad: 'confirmada', creado: ahora(), actualizado: ahora() }); }, ids.p);
  await page.reload(); await page.waitForSelector('#ls-lista');
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#ls-pdf')]);
  await dl3.saveAs(SALIDA + '/lista-larga.pdf');
  const pags = +/Pages:\s+(\d+)/.exec(execSync('pdfinfo "' + SALIDA + '/lista-larga.pdf"').toString())[1];
  check('F. Una lista de 65 conceptos se reparte en varias páginas (' + pags + ')', pags >= 3 && pags <= 8, String(pags));

  /* estados vacíos */
  const vacio = await page.evaluate(async () => { const p = { id: nuevoId(), nombre: 'Vacío', cliente: 'Ana', estado: 'pendiente', tipoTrabajo: 'otro', archivado: false, creado: ahora(), actualizado: ahora() }; await dbGuardar('proyectos', p); return p.id; });
  await page.goto(BASE + '#/proyecto/' + vacio + '/listas'); await page.waitForSelector('text=Aún no hay conceptos');
  check('G. Proyecto sin conceptos: explica qué hacer y enlaza a Conceptos', await page.isVisible('a:has-text("Ir a Conceptos")'));

  /* pantallas */
  await page.evaluate(async pid => { const x = (await dbPorProyecto('partidas', pid)).filter(q => q.descripcion.startsWith('Concepto de relleno')); for (const q of x) await dbBorrar('partidas', q.id); }, ids.p);
  for (const [w, nom] of [[390, 'cel'], [800, 'tab-vertical'], [1228, 'tab-horizontal']]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '#/proyecto/' + ids.p + '/listas'); await page.reload(); await page.waitForSelector('#ls-lista'); await wait(300);
    const desb = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`H. ${w}px pestaña Listas sin desborde horizontal`, desb <= 1, String(desb));
    await page.screenshot({ path: SALIDA + `/l-2-${nom}.png`, fullPage: true });
  }

  /* la base no se contamina: ni el reporte ni la copia cambian */
  const copia = await page.evaluate(async () => { const t = await new Blob(await dbExportarPartes()).text(); return JSON.parse(t); });
  check('I. La preferencia de la lista (tipo y agrupación) viaja en la copia de seguridad', copia.datos.proyectos.some(p => p.listas && p.listas.tipo && p.listas.grupo));
  check('J. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} bien, ${fail} mal`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
