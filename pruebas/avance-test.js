const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
fs.mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8123/';
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('✔', n); } else { fail++; console.log('✘', n, x); } };
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

  const id = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa Avance', cliente: 'Rosa Pérez', estado: 'enproceso', tipoTrabajo: 'remodelacion', fecha: '2026-11-02', archivado: false, creado: ahora(), actualizado: ahora() };
    await dbGuardar('proyectos', pr);
    const mov = (tipo, fecha, extra) => Object.assign({ id: nuevoId(), proyectoId: pr.id, tipo, fecha, creado: ahora() + fecha, actualizado: ahora() }, extra);
    await dbGuardar('seguimiento', mov('bitacora', '2026-11-05', { texto: 'Se colocó el piso.\nQueda el zoclo.' }));
    await dbGuardar('seguimiento', mov('bitacora', '2026-11-08', { texto: 'Sin fotos hoy' }));
    await dbGuardar('seguimiento', mov('gasto', '2026-11-06', { monto: 123456, categoria: 'Material', descripcion: 'Secreto-gasto', proveedor: 'Proveedor-secreto' }));
    return pr.id;
  });
  await page.goto(BASE + '#/proyecto/' + id + '/obra'); await page.waitForSelector('#ob-bitacora .entrada');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#ob-bitacora .entrada:has-text("piso") [data-acc=galeria]')]);
  await fc.setFiles([__dirname + '/fotos/foto-grande.jpg', __dirname + '/fotos/foto-exif-vertical.jpg']);
  await page.waitForFunction(() => document.querySelectorAll('#ob-bitacora .mini-fotos img').length === 2, null, { timeout: 30000 });

  check('A. Con entradas, aparece el botón "Enviar avance al cliente"', await page.isVisible('#ob-avance'));
  await page.click('#ob-avance'); await page.waitForSelector('dialog.dlg-form[open]');
  const filas = await page.$$eval('#av-lista li', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ')));
  check('A. Lista las 2 entradas, todas marcadas, con su número de fotos', filas.length === 2 && filas.some(f => f.includes('2 fotos')) && filas.some(f => f.includes('0 fotos')) && (await page.$$eval('#av-lista input:checked', i => i.length)) === 2, JSON.stringify(filas));
  check('A. No muestra pagos ni gastos', !(await page.textContent('dialog.dlg-form')).match(/Secreto|Proveedor|1,234/));
  check('A. En un navegador sin compartir no sale "Compartir fotos"', (await page.locator('#av-fotos').count()) === (await page.evaluate(() => !!(navigator.canShare && navigator.share))) * 1);

  await page.uncheck('#av-lista input >> nth=0'); await page.uncheck('#av-lista input >> nth=1');
  await page.click('#av-pdf');
  check('B. Sin entradas marcadas avisa y no descarga', (await page.textContent('#av-error')).includes('al menos una') && await page.isVisible('#av-error'));

  await page.check('#av-lista input >> nth=0'); await page.check('#av-lista input >> nth=1');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#av-pdf')]);
  const pdf = SALIDA + '/avance.pdf'; await dl.saveAs(pdf);
  check('C. El PDF se llama "Reporte de avance - …" sin acentos raros', /^Reporte de avance - Casa Avance - .*\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const info = execSync('pdfinfo "' + pdf + '"').toString();
  check('C. El PDF es válido y trae páginas', /Pages:\s+[1-9]/.test(info), info);
  const imgs = execSync('pdfimages -list "' + pdf + '"').toString().trim().split('\n').length - 2;
  check('C. Cada página es una imagen', imgs >= 1);
  await page.waitForFunction(() => !document.querySelector('dialog.dlg-form[open]'));
  check('C. El diálogo se cierra después de descargar', true);

  /* Con medidas dibujadas y sin ellas el PDF sale */
  await page.evaluate(async () => {
    const f = (await dbTodos('fotos')).find(x => x.categoria === 'avance');
    f.anotaciones = [{ tipo: 'linea', x1: 0.1, y1: 0.1, x2: 0.6, y2: 0.1, texto: '2.50 m', id: nuevoId() }];
    await dbGuardar('fotos', f);
  });
  await page.reload(); await page.waitForSelector('#ob-avance'); await page.click('#ob-avance'); await page.waitForSelector('dialog.dlg-form[open]');
  await page.uncheck('#av-medidas');
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#av-pdf')]);
  await dl2.saveAs(SALIDA + '/avance2.pdf');
  check('D. Con anotaciones y sin dibujar medidas el PDF también sale', /Pages:\s+[1-9]/.test(execSync('pdfinfo "' + SALIDA + '/avance2.pdf"').toString()));

  /* Compartir fotos con un navigator.share simulado */
  await page.reload(); await page.waitForSelector('#ob-avance');
  await page.evaluate(() => {
    window.__compartido = null;
    navigator.canShare = d => !!(d && d.files && d.files.length);
    navigator.share = async d => { window.__compartido = d.files.map(f => ({ n: f.name, t: f.type, s: f.size })); };
  });
  await page.click('#ob-avance'); await page.waitForSelector('#av-fotos');
  await page.click('#av-fotos'); await page.waitForFunction(() => window.__compartido);
  const comp = await page.evaluate(() => window.__compartido);
  check('E. Comparte las 2 fotos como archivos JPG con nombre de fecha', comp.length === 2 && comp.every(c => c.t === 'image/jpeg' && c.s > 1000 && /^avance-2026-11-05-\d\.jpg$/.test(c.n)), JSON.stringify(comp));

  await page.click('#ob-avance'); await page.waitForSelector('#av-fotos');
  await page.uncheck('#av-lista input >> nth=1');                         /* deja solo la entrada sin fotos (la de 11-08 es la primera: más nueva) */
  const marcadas = await page.$$eval('#av-lista input', is => is.map(i => i.checked));
  if (marcadas[0] === true) await page.uncheck('#av-lista input >> nth=0');
  await page.check('#av-lista input >> nth=0');
  await page.click('#av-fotos');
  check('E. Entrada sin fotos: avisa en vez de compartir vacío', (await page.textContent('#av-error')).includes('no tienen fotos'));

  check('F. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} correctas, ${fail} fallidas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
