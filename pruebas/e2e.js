const { chromium } = require('playwright');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
require('fs').mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8123/';
const SH = SALIDA + '/';
let ok = 0, fail = 0;
function check(name, cond, extra='') { if (cond) { ok++; console.log('✔', name); } else { fail++; console.log('✘', name, extra); } }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, locale: 'es-MX' });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('obrapro-splash','1'); } catch(e){} });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

  await page.goto(BASE);
  await page.waitForSelector('text=Aún no tienes proyectos');
  check('1. Abre la lista vacía', true);

  // Proyecto nuevo con validación
  await page.click('text=+ Nuevo proyecto');
  await page.click('#crear');
  check('4. Valida campos obligatorios', await page.isVisible('text=Escribe el nombre del proyecto.'));
  await page.fill('#f-nombre', 'Casa López');
  await page.fill('#f-cliente', 'Juan López');
  await page.fill('#f-correo', 'correo-malo');
  await page.click('#crear');
  check('4. Valida correo', await page.isVisible('text=El correo no parece válido.'));
  await page.fill('#f-correo', 'juan@ejemplo.com');
  await page.fill('#f-direccion', 'Av. Juárez 123, Mazatlán');
  await page.click('#crear');
  await page.waitForURL(/espacios$/);
  await page.waitForSelector('h1:has-text("Casa López")', { timeout: 5000 }).catch(() => {});
  check('1. Crea el proyecto', await page.isVisible('h1:has-text("Casa López")'));

  // Espacio A
  await page.click('#agregar');
  await page.waitForURL(/#\/espacio\//);
  await page.click('.chip[data-tipo="Sala"]');
  check('Botón de tipo pone el nombre', (await page.inputValue('#f-nombre')) === 'Sala');
  await page.fill('#f-largo', '4');
  await page.fill('#f-ancho', '3.5');
  await page.fill('#f-altura', '2,5');
  check('3. Caso A superficie', (await page.textContent('#r-sup')) === '14.00 m²', await page.textContent('#r-sup'));
  check('3. Caso A perímetro', (await page.textContent('#r-per')) === '15.00 m');
  check('3. Caso A muros', (await page.textContent('#r-mur')) === '37.50 m²');
  await page.screenshot({ path: SH + 'espacio-tablet.png' });

  // Validación negativa
  await page.fill('#f-largo', '-2');
  check('4. Rechaza negativo', await page.isVisible('text=La medida debe ser mayor que cero.'));
  await page.fill('#f-largo', 'abc');
  check('4. Rechaza texto', await page.isVisible('text=Usa solo números'));
  await page.fill('#f-largo', '4');
  await page.waitForTimeout(700);
  check('Indica guardado', (await page.textContent('#save-status')).includes('Guardado'));
  await page.click('text=← Espacios');

  // Espacio B en cm
  await page.click('#agregar'); await page.waitForURL(/#\/espacio\//);
  await page.click('.chip[data-tipo="Cocina"]');
  await page.selectOption('#f-unidad', 'cm');
  await page.fill('#f-largo', '420'); await page.fill('#f-ancho', '310');
  check('3. Caso B (cm)', (await page.textContent('#r-sup')) === '13.02 m²');
  await page.click('text=← Espacios');

  // Espacio C en pies
  await page.click('#agregar'); await page.waitForURL(/#\/espacio\//);
  await page.click('.chip[data-tipo="Recámara"]');
  await page.selectOption('#f-unidad', 'ft');
  await page.fill('#f-largo', '12'); await page.fill('#f-ancho', '10');
  check('3. Caso C (pies)', (await page.textContent('#r-sup')) === '11.15 m²' && (await page.textContent('#r-per')) === '13.41 m');
  await page.click('text=← Espacios');

  // Espacio E irregular
  await page.click('#agregar'); await page.waitForURL(/#\/espacio\//);
  await page.click('.chip[data-tipo="Patio"]');
  await page.selectOption('#f-forma', 'irregular');
  const fillTramo = async (i, l, a, signo) => {
    await page.fill(`.tramo[data-i="${i}"] [data-k="largo"]`, l);
    await page.fill(`.tramo[data-i="${i}"] [data-k="ancho"]`, a);
    if (signo) await page.selectOption(`.tramo[data-i="${i}"] [data-k="signo"]`, signo);
  };
  await fillTramo(0, '5', '3');
  await page.click('#agregar-tramo'); await fillTramo(1, '2', '1.5');
  check('3. Caso D (L)', (await page.textContent('#r-sup')) === '18.00 m²');
  await page.click('#agregar-tramo'); await fillTramo(2, '0.8', '0.6', '-1');
  check('3. Caso E (con hueco)', (await page.textContent('#r-sup')) === '17.52 m²', await page.textContent('#r-sup'));
  await page.screenshot({ path: SH + 'irregular-tablet.png', fullPage: true });
  await page.click('text=← Espacios');

  // Tabla
  await page.waitForSelector('tfoot');
  const total = await page.textContent('tfoot td:nth-child(2)');
  check('2. Varios espacios y total (14+13.02+11.15+17.52=55.69)', total.includes('55.69'), total);
  await page.screenshot({ path: SH + 'tabla-tablet.png' });

  // 9. Recargar
  await page.reload();
  await page.waitForSelector('tfoot');
  check('9. Datos siguen tras recargar', (await page.textContent('tfoot')).includes('55.69'));

  // Editar proyecto (autoguardado)
  await page.click('.tab:has-text("Datos")');
  await page.selectOption('#f-estado', 'presupuestado');
  await page.waitForTimeout(700);
  await page.goto(BASE + '#/proyectos');
  check('1. Edita estado del proyecto', await page.isVisible('.badge:has-text("Presupuestado")'));

  // Borrador
  await page.click('text=+ Nuevo proyecto');
  await page.fill('#f-nombre', 'Local Centro');
  await page.waitForTimeout(900);
  await page.click('#nav a[data-view="ajustes"]');
  await page.click('#nav a[data-view="proyectos"]');
  await page.click('text=+ Nuevo proyecto');
  check('Recupera borrador', (await page.inputValue('#f-nombre')) === 'Local Centro');
  await page.click('#descartar'); await page.click('#dlg-ok');
  await page.waitForTimeout(300);
  check('Descarta borrador', (await page.inputValue('#f-nombre')) === '');

  // Búsqueda
  await page.goto(BASE + '#/proyectos');
  await page.fill('#q', 'juarez');
  check('Búsqueda sin acentos por dirección', await page.isVisible('text=Casa López'));
  await page.fill('#q', 'zzz');
  check('Búsqueda sin resultados', await page.isVisible('text=Ningún proyecto coincide'));
  await page.screenshot({ path: SH + 'lista-tablet.png' });

  // 10. Sin internet
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // que el SW controle la página
  await ctx.setOffline(true);
  await page.goto(BASE + '#/proyectos');
  await page.waitForSelector('text=Casa López', { timeout: 5000 }).catch(() => {});
  check('10. Abre sin internet', await page.isVisible('text=Casa López'));
  await ctx.setOffline(false);

  // 12. Copia de seguridad y restauración
  await page.click('#nav a[data-view="ajustes"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportar')]);
  const ruta = SALIDA + '/' + dl.suggestedFilename();
  await dl.saveAs(ruta);
  check('Descarga copia', /obrapro-respaldo-\d{4}-\d\d-\d\d\.json/.test(dl.suggestedFilename()));
  // borrar proyecto
  await page.goto(BASE + '#/proyectos');
  await page.click('text=Casa López');
  await page.click('#eliminar');
  check('Pide confirmación con el nombre', (await page.textContent('#dlg-msg')).includes('Casa López'));
  await page.click('#dlg-ok');
  await page.waitForSelector('text=Aún no tienes proyectos');
  check('Elimina proyecto', true);
  await page.click('#nav a[data-view="ajustes"]');
  await page.setInputFiles('#importar', ruta);
  await page.click('#dlg-ok');
  await page.waitForSelector('text=Casa López');
  await page.click('text=Casa López');
  await page.click('.tab:has-text("Espacios")');
  check('12. Restaura copia con espacios', (await page.textContent('tfoot')).includes('55.69'));

  // Archivar
  await page.click('.tab:has-text("Datos")');
  await page.click('#archivar');
  await page.waitForURL(/archivados/);
  check('Archiva proyecto', await page.isVisible('text=Casa López'));
  await page.click('text=Casa López'); await page.click('#archivar');
  await page.waitForURL(/#\/proyectos$/);
  check('Restaura de archivados', await page.isVisible('text=Casa López'));

  // 11. Diseño: vertical y celular
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.click('text=Casa López'); await page.click('.tab:has-text("Espacios")');
  await page.screenshot({ path: SH + 'tabla-vertical.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('tbody tr:first-child');
  await page.waitForSelector('#r-sup');
  await page.screenshot({ path: SH + 'espacio-celular.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('11. Sin desbordamiento horizontal en celular', !overflow);

  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  console.log(`\nPruebas en navegador: ${ok} correctas, ${fail} fallidas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
