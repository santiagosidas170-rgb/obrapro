const { chromium } = require('playwright');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
require('fs').mkdirSync(SALIDA, { recursive: true });
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8123/';
const F = __dirname + '/fotos/';
const SH = SALIDA + '/f-';
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
  page.on('pageerror', e => errores.push(e.message + ' :: ' + String(e.stack).replace(/\n/g, ' ← ').slice(0, 500)));
  page.on('console', async m => { if (m.type() === 'error' && !/No se pudo leer la imagen/.test(m.text())) {
    let det = m.text(); try { det += ' :: ' + (await Promise.all(m.args().map(a => a.evaluate(x => (x && x.stack) ? x.stack : String(x)).catch(() => '')))).join(' | ').replace(/\n/g, ' ← ').slice(0, 700); } catch (e) {}
    errores.push(det + ' [url ' + page.url().split('#')[1] + ']'); } });

  await page.goto(BASE); await page.waitForSelector('.empty');
  const ids = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa López', cliente: 'Juan López', direccion: 'Av. Juárez 123', estado: 'levantamiento', tipoTrabajo: 'remodelacion', fecha: '2026-11-02',
      responsable: 'Santiago', telefono: '', correo: '', observaciones: '', archivado: false, creado: ahora(), actualizado: ahora() };
    await dbGuardar('proyectos', pr);
    const mk = (n, o) => ({ id: nuevoId(), proyectoId: pr.id, nombre: n, tipo: n, unidad: 'm', forma: 'rectangular', largo: 4, ancho: 3.5, altura: 2.5, tramos: [], perimetroManual: null,
      estadoActual: 'regular', trabajos: '', observaciones: '', orden: o, creado: ahora(), actualizado: ahora() });
    const e1 = mk('Sala', 0), e2 = mk('Cocina', 1);
    await dbGuardar('espacios', e1); await dbGuardar('espacios', e2);
    return { p: pr.id, e1: e1.id, e2: e2.id };
  });
  const estadoFotos = () => page.evaluate(async () => {
    const fs_ = await dbTodos('fotos'); const out = [];
    for (const x of fs_) { const m = await createImageBitmap(x.miniatura);
      out.push({ id: x.id, proyectoId: x.proyectoId, espacioId: x.espacioId, ancho: x.ancho, alto: x.alto, tipo: x.imagen.type, size: x.imagen.size, mw: m.width, mh: m.height,
        categoria: x.categoria, descripcion: x.descripcion, anot: x.anotaciones, fecha: x.fecha }); }
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
  });
  const canvasBox = () => page.locator('#lienzo').boundingBox();
  const px = (b, nx, ny) => [b.x + nx * b.width, b.y + ny * b.height];
  const amarilloCerca = (nx, ny, rad = 6) => page.evaluate(([nx, ny, rad]) => {
    const c = document.getElementById('lienzo'), x = c.getContext('2d'); const k = c.width / c.getBoundingClientRect().width;
    const d = x.getImageData(Math.round(nx * c.width) - 2, Math.round(ny * c.height) - Math.round(rad * k), 5, Math.round(rad * k) * 2).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 180 && d[i + 2] < 120) return true; return false;
  }, [nx, ny, rad]);
  const trazar = async (n1, n2, pasos = 8) => { const b = await canvasBox(); const [x1, y1] = px(b, ...n1), [x2, y2] = px(b, ...n2);
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: pasos }); await page.mouse.up(); };
  const escribirDialogo = async txt => { await page.waitForSelector('#dlg-texto[open]'); await page.fill('#dlg-texto-input', txt); await page.keyboard.press('Enter'); await page.waitForSelector('#dlg-texto[open]', { state: 'detached' }); };
  const cerca = (a, b, t = 0.02) => Math.abs(a - b) <= t;

  // ---------- 1. La pestaña existe y está activa ----------
  await page.goto(BASE + '#/proyecto/' + ids.p + '/fotos'); await page.waitForSelector('#tomar');
  check('La pestaña Fotos ya se puede abrir', await page.isVisible('h2:has-text("Fotos (0)")'));
  check('Ninguna pestaña dice "Pronto"', (await page.locator('.tab.disabled .pronto').count()) === 0);
  check('Estado vacío con instrucciones', await page.isVisible('text=Este proyecto aún no tiene fotos.'));
  check('Ayuda de permisos de Android visible', await page.isVisible('summary:has-text("Permisos de Android")'));
  await page.click('summary:has-text("Permisos de Android")');
  check('La ayuda explica cómo dar el permiso de cámara', await page.isVisible('text=Permisos → Cámara → Permitir'));
  await page.screenshot({ path: SH + '1-vacio.png' });

  // ---------- 2. Galería: varias fotos, compresión y orientación ----------
  let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#galeria')]);
  check('La galería permite elegir varias fotos', fc.isMultiple());
  const capGal = await fc.element().getAttribute('capture');
  check('La galería NO fuerza la cámara', capGal === null);
  await fc.setFiles([F + 'foto-grande.jpg', F + 'foto-exif-vertical.jpg', F + 'foto-transparente.png']);
  await page.waitForSelector('.foto-card:nth-child(3)'); await wait(300);
  let fotos = await estadoFotos();
  check('Se guardaron 3 fotos', fotos.length === 3, String(fotos.length));
  const grande = fotos.find(f => f.ancho === 1600 && f.alto === 1200), vertical = fotos.find(f => f.alto === 1600 && f.ancho === 1200), png = fotos.find(f => f.ancho === 1200 && f.alto === 900);
  check('Foto de 4000×3000 se reduce a 1600×1200', !!grande, JSON.stringify(fotos.map(f => [f.ancho, f.alto])));
  check('Foto con orientación EXIF se endereza (queda vertical 1200×1600)', !!vertical);
  check('Foto pequeña (PNG) conserva su tamaño 1200×900', !!png);
  check('Todas se guardan como JPEG comprimido (< 400 KB)', fotos.every(f => f.tipo === 'image/jpeg' && f.size < 400 * 1024), JSON.stringify(fotos.map(f => [f.tipo, f.size])));
  check('Las miniaturas miden como máximo 320 px', fotos.every(f => Math.max(f.mw, f.mh) <= 320), JSON.stringify(fotos.map(f => [f.mw, f.mh])));
  const imgsOk = await page.evaluate(() => [...document.querySelectorAll('.foto-card img')].every(i => i.complete && i.naturalWidth > 0));
  check('Las miniaturas se ven en la galería', imgsOk);
  await page.screenshot({ path: SH + '2-galeria.png' });

  // ---------- 3. Un archivo que no es imagen ----------
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#galeria')]);
  await fc.setFiles([F + 'no-es-imagen.jpg']); await wait(600);
  check('Un archivo que no es imagen muestra un aviso claro', await page.isVisible('#toast.error'));
  check('…y no se guarda nada', (await estadoFotos()).length === 3);

  // ---------- 4. Cámara ----------
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#tomar')]);
  check('"Tomar foto" abre la cámara trasera (capture=environment)', (await fc.element().getAttribute('capture')) === 'environment');
  check('…y solo acepta imágenes', (await fc.element().getAttribute('accept')) === 'image/*');
  await fc.setFiles([F + 'foto-grande.jpg']);
  await page.waitForURL(/#\/foto\//); await page.waitForSelector('#lienzo');
  check('Después de tomar la foto se abre directo para dibujar', await page.isVisible('h1:has-text("Foto 4 de 4")'));
  const idCam = page.url().split('/foto/')[1];

  // ---------- 5. Dibujar una medida con el mouse ----------
  await trazar([0.2, 0.3], [0.5, 0.3]);
  check('Al soltar se pide escribir la medida', await page.isVisible('#dlg-texto[open]'));
  check('Hay botones de unidades rápidas (m, cm, mm, m²)', (await page.locator('#dlg-texto .sugerencia').count()) === 4);
  await escribirDialogo('2.40 m'); await wait(800);
  fotos = await estadoFotos(); let cam = fotos.find(f => f.id === idCam);
  check('La medida se guarda con su texto', cam.anot.length === 1 && cam.anot[0].texto === '2.40 m' && cam.anot[0].tipo === 'medida', JSON.stringify(cam.anot));
  check('Posición guardada como proporción de la foto', cerca(cam.anot[0].x1, .2) && cerca(cam.anot[0].x2, .5) && cerca(cam.anot[0].y1, .3), JSON.stringify(cam.anot[0]));
  check('La línea se ve dibujada en amarillo sobre la foto', await amarilloCerca(0.35, 0.3));
  await page.screenshot({ path: SH + '3-medida.png' });

  // Cancelar el cuadro descarta la línea
  await trazar([0.2, 0.6], [0.6, 0.6]); await page.waitForSelector('#dlg-texto[open]'); await page.click('#dlg-texto button[value=cancel]');
  await page.waitForSelector('#dlg-texto[open]', { state: 'detached' }); await wait(300);
  check('Cancelar el cuadro descarta la línea', !(await amarilloCerca(0.4, 0.6)) && (await page.evaluate(async id => (await dbObtener('fotos', id)).anotaciones.length, idCam)) === 1);
  // Un toque suelto no dibuja
  { const b = await canvasBox(); const [x, y] = px(b, .8, .8); await page.mouse.click(x, y); await wait(200); }
  check('Un toque suelto no crea medidas', !(await page.isVisible('#dlg-texto[open]')));

  // ---------- 6. Nota de texto y color ----------
  await page.click('.herr[data-herr="texto"]'); await page.click('.color-sw[data-color="#ff6b5e"]');
  { const b = await canvasBox(); const [x, y] = px(b, .7, .2); await page.mouse.click(x, y); }
  await escribirDialogo('Grieta'); await wait(800);
  fotos = await estadoFotos(); cam = fotos.find(f => f.id === idCam);
  check('La nota se guarda con el color elegido (rojo)', cam.anot.length === 2 && cam.anot[1].tipo === 'texto' && cam.anot[1].texto === 'Grieta' && cam.anot[1].color === '#ff6b5e', JSON.stringify(cam.anot));

  // ---------- 7. Seleccionar, mover, ajustar extremos, editar, deshacer, borrar ----------
  await page.click('.herr[data-herr="seleccionar"]');
  { const b = await canvasBox(); const [x, y] = px(b, .35, .3); await page.mouse.click(x, y); }
  check('Al tocar la medida se selecciona (se activan Editar y Borrar)', !(await page.isDisabled('#editar')) && !(await page.isDisabled('#quitar')));
  await trazar([0.35, 0.3], [0.45, 0.4]); await wait(800);
  cam = (await estadoFotos()).find(f => f.id === idCam); let m = cam.anot[0];
  check('Arrastrar mueve la medida completa (+0.1, +0.1)', cerca(m.x1, .3) && cerca(m.x2, .6) && cerca(m.y1, .4) && cerca(m.y2, .4), JSON.stringify(m));
  await trazar([0.3, 0.4], [0.25, 0.5]); await wait(800);
  cam = (await estadoFotos()).find(f => f.id === idCam); m = cam.anot[0];
  check('Arrastrar un extremo ajusta solo ese lado', cerca(m.x1, .25) && cerca(m.y1, .5) && cerca(m.x2, .6) && cerca(m.y2, .4), JSON.stringify(m));
  await page.click('#deshacer'); await page.click('#deshacer'); await wait(800);
  cam = (await estadoFotos()).find(f => f.id === idCam); m = cam.anot[0];
  check('Deshacer dos veces regresa a la posición original', cerca(m.x1, .2) && cerca(m.x2, .5) && cerca(m.y1, .3) && cerca(m.y2, .3), JSON.stringify(m));
  await page.click('#editar'); await page.waitForSelector('#dlg-texto[open]');
  check('Editar muestra el texto actual', (await page.inputValue('#dlg-texto-input')) === '2.40 m');
  await page.click('#dlg-texto .sugerencia[data-t="cm"]');
  check('Los botones de unidad agregan texto', (await page.inputValue('#dlg-texto-input')) === '2.40 m cm');
  await escribirDialogo('2.45 m'); await wait(800);
  cam = (await estadoFotos()).find(f => f.id === idCam);
  check('El texto editado se guarda', cam.anot[0].texto === '2.45 m');
  { const b = await canvasBox(); const [x, y] = px(b, .7, .2); await page.mouse.click(x, y); }
  await page.click('#quitar'); await page.waitForSelector('#dlg[open]');
  check('Borrar pide confirmación con el nombre', (await page.textContent('#dlg-msg')).includes('Grieta'));
  await page.click('#dlg-ok'); await wait(800);
  cam = (await estadoFotos()).find(f => f.id === idCam);
  check('Se borra solo la anotación elegida', cam.anot.length === 1 && cam.anot[0].tipo === 'medida');

  // ---------- 8. Datos de la foto y persistencia ----------
  await page.fill('#f-descripcion', 'Muro norte con humedad');
  await page.selectOption('#f-categoria', 'dano');
  await page.selectOption('#f-espacio', ids.e1); await wait(900);
  await page.reload(); await page.waitForSelector('#lienzo'); await wait(500);
  check('Descripción, tipo y espacio persisten al recargar', (await page.inputValue('#f-descripcion')) === 'Muro norte con humedad' && (await page.inputValue('#f-categoria')) === 'dano' && (await page.inputValue('#f-espacio')) === ids.e1);
  check('Las medidas dibujadas persisten y se vuelven a pintar', await amarilloCerca(0.35, 0.3));

  // ---------- 9. Imagen con medidas ----------
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#descargar')]);
  const rutaImg = SALIDA + '/' + dl.suggestedFilename(); await dl.saveAs(rutaImg);
  check('Descarga la imagen con nombre obrapro-foto-….jpg', /^obrapro-foto-\d{8}-\d{6}\.jpg$/.test(dl.suggestedFilename()));
  const info = require('child_process').execSync(`python3 -c "
from PIL import Image
im = Image.open('${rutaImg}').convert('RGB'); W,H = im.size
amar = 0
for y in range(int(H*.3)-8, int(H*.3)+9):
    for x in range(int(W*.25), int(W*.45)):
        r,g,b = im.getpixel((x,y))
        if r>220 and g>180 and b<120: amar += 1
print(im.format if hasattr(im,'format') else '', W, H, amar)"`).toString().trim().split(/\s+/);
  check('La imagen exportada mide igual que la foto (1600×1200)', info[1] === '1600' && info[2] === '1200', info.join(' '));
  check('La imagen exportada trae la línea de medida dibujada', Number(info[3]) > 300, info.join(' '));
  check('La foto original guardada no se modificó (sin línea dibujada)', await page.evaluate(async id => {
    const f = await dbObtener('fotos', id); const bm = await createImageBitmap(f.imagen); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const x = c.getContext('2d'); x.drawImage(bm, 0, 0); const d = x.getImageData(Math.round(bm.width * .25), Math.round(bm.height * .3) - 8, Math.round(bm.width * .2), 16).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 180 && d[i + 2] < 120) return false; return true; }, idCam));

  // ---------- 10. Filtros de la galería ----------
  await page.goto(BASE + '#/proyecto/' + ids.p + '/fotos'); await page.waitForSelector('.foto-card');
  check('Galería con las 4 fotos', (await page.locator('.foto-card').count()) === 4);
  await page.selectOption('#f-cat', 'dano'); check('Filtro por tipo: Daño → 1 foto', (await page.locator('.foto-card').count()) === 1);
  check('La tarjeta muestra descripción, espacio y cuántas anotaciones tiene', await page.isVisible('.foto-card:has-text("Muro norte con humedad")') && await page.isVisible('.foto-card:has-text("Sala")') && await page.isVisible('.foto-card .foto-anot:has-text("1")'));
  await page.selectOption('#f-cat', ''); await page.selectOption('#f-esp', ids.e1); check('Filtro por espacio: Sala → 1 foto', (await page.locator('.foto-card').count()) === 1);
  await page.selectOption('#f-esp', '-'); check('Filtro "Sin espacio" → 3 fotos', (await page.locator('.foto-card').count()) === 3);
  await page.selectOption('#f-esp', ''); await page.screenshot({ path: SH + '4-galeria-filtros.png' });

  // ---------- 11. Fotos desde el editor de espacio ----------
  await page.goto(BASE + '#/espacio/' + ids.e1); await page.waitForSelector('.tira-fotos');
  check('El espacio muestra su foto en una tira', (await page.locator('.foto-mini').count()) === 1 && await page.isVisible('legend:has-text("Fotos de este espacio (1)")'));
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#esp-tomar')]);
  check('Desde el espacio también abre la cámara', (await fc.element().getAttribute('capture')) === 'environment');
  await fc.setFiles([F + 'foto-exif-vertical.jpg']); await page.waitForURL(/#\/foto\//); await page.waitForSelector('#lienzo');
  check('La foto tomada queda asociada a ese espacio', (await page.inputValue('#f-espacio')) === ids.e1);
  // anterior / siguiente
  await page.screenshot({ path: SH + '5-detalle-horizontal.png', fullPage: true });
  const urlAntes = page.url(); await page.click('#ant'); await page.waitForFunction(u => location.href !== u, urlAntes);
  check('El botón Anterior cambia de foto', page.url() !== urlAntes && await page.isVisible('h1:has-text("de 5")'));
  // eliminar espacio: sus fotos se conservan
  await page.goto(BASE + '#/espacio/' + ids.e1); await page.waitForSelector('#eliminar'); await page.click('#eliminar'); await page.waitForSelector('#dlg[open]');
  check('Eliminar un espacio avisa que sus fotos se conservan', (await page.textContent('#dlg-msg')).includes('fotos se conservarán'));
  await page.click('#dlg-ok'); await page.waitForURL(/espacios$/); await wait(300);
  fotos = await estadoFotos();
  check('Sus 2 fotos siguen existiendo, ahora sin espacio', fotos.length === 5 && fotos.every(f => f.espacioId === null), JSON.stringify(fotos.map(f => f.espacioId)));

  // ---------- 12. Copia de seguridad con fotos ----------
  await page.goto(BASE + '#/ajustes'); await page.waitForSelector('#exportar');
  check('Ajustes cuenta las fotos y su tamaño', await page.isVisible('text=/Fotos guardadas: 5 \\(/'));
  check('Ajustes incluye la ayuda de cámara y fotos', await page.isVisible('h2:has-text("Cámara y fotos")'));
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#exportar')]);
  const ruta = SALIDA + '/' + dl2.suggestedFilename(); await dl2.saveAs(ruta);
  const resp = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  check('La copia es formato 2 e incluye 5 fotos', resp.formato === 2 && resp.datos.fotos.length === 5);
  check('Las fotos van como imagen JPEG en el archivo', resp.datos.fotos.every(f => f.imagenData.startsWith('data:image/jpeg;base64,') && f.miniaturaData.startsWith('data:image/jpeg;base64,') && !('imagen' in f)));
  check('Las medidas dibujadas van en la copia', resp.datos.fotos.some(f => f.anotaciones.some(a => a.texto === '2.45 m')));
  const antes = await estadoFotos();
  await page.evaluate(id => dbBorrarProyecto(id), ids.p);
  check('Borrar el proyecto borra también todas sus fotos', (await estadoFotos()).length === 0);
  await page.setInputFiles('#importar', ruta); await page.waitForSelector('#dlg[open]');
  check('Restaurar avisa cuántos proyectos y fotos trae', (await page.textContent('#dlg-msg')).includes('1 proyecto(s) y 5 foto(s)'));
  await page.click('#dlg-ok'); await page.waitForURL(/#\/proyectos/); await wait(500);
  const despues = await estadoFotos();
  check('Restaurar devuelve las 5 fotos como imágenes', despues.length === 5 && despues.every(f => f.tipo === 'image/jpeg'));
  check('Mismas medidas de imagen y mismo tamaño en bytes', JSON.stringify(despues.map(f => [f.ancho, f.alto, f.size])) === JSON.stringify(antes.map(f => [f.ancho, f.alto, f.size])));
  check('Las medidas dibujadas se recuperan intactas', JSON.stringify(despues.map(f => f.anot)) === JSON.stringify(antes.map(f => f.anot)));
  await page.goto(BASE + '#/proyecto/' + ids.p + '/fotos'); await page.waitForSelector('.foto-card'); await wait(400);
  check('Las fotos restauradas se ven en la galería', await page.evaluate(() => [...document.querySelectorAll('.foto-card img')].every(i => i.complete && i.naturalWidth > 0)) && (await page.locator('.foto-card').count()) === 5);
  // copia antigua (formato 1, sin fotos)
  const vieja = { app: 'ObraPro', formato: 1, exportado: new Date().toISOString(), datos: { proyectos: [{ id: 'x1', nombre: 'Viejo', cliente: 'C', estado: 'pendiente', archivado: false }], espacios: [], catalogo: [], partidas: [], ajustes: [] } };
  fs.writeFileSync(SALIDA + '/vieja.json', JSON.stringify(vieja));
  await page.goto(BASE + '#/ajustes'); await page.waitForSelector('#importar', { state: 'attached' }); await page.setInputFiles('#importar', SALIDA + '/vieja.json'); await page.waitForSelector('#dlg[open]'); await page.click('#dlg-ok');
  await page.waitForURL(/#\/proyectos/); await wait(400);
  check('Una copia antigua (sin fotos) también se restaura', await page.isVisible('.project-card:has-text("Viejo")') && (await estadoFotos()).length === 0);
  // devolver los datos para las siguientes pruebas
  await page.goto(BASE + '#/ajustes'); await page.waitForSelector('#importar', { state: 'attached' }); await page.setInputFiles('#importar', ruta); await page.waitForSelector('#dlg[open]'); await page.click('#dlg-ok'); await page.waitForURL(/#\/proyectos/); await wait(400);

  // ---------- 13. Sin internet ----------
  await page.evaluate(() => navigator.serviceWorker.ready); await page.goto(BASE); await page.reload(); await wait(700);
  const fotoId = (await estadoFotos()).find(f => f.anot.length)?.id || (await estadoFotos())[0].id;
  await ctx.setOffline(true);
  await page.goto(BASE + '#/foto/' + fotoId); await page.reload(); await page.waitForSelector('#lienzo', { timeout: 6000 });
  check('Sin internet: la foto y su editor abren', await page.isVisible('#lienzo'));
  await page.click('.herr[data-herr="medida"]'); await trazar([0.1, 0.8], [0.4, 0.8]); await escribirDialogo('1.00 m'); await wait(800);
  check('Sin internet: se pueden dibujar y guardar medidas', (await page.evaluate(async id => (await dbObtener('fotos', id)).anotaciones.some(a => a.texto === '1.00 m'), fotoId)));
  await ctx.setOffline(false);

  // ---------- 14. Dibujar con el dedo (toque real) ----------
  const tctx = await browser.newContext({ viewport: { width: 1228, height: 800 }, hasTouch: true, isMobile: false, locale: 'es-MX' });
  await tctx.addInitScript(SKIP);
  const tp = await tctx.newPage(); await tp.goto(BASE); await tp.waitForSelector('main');
  // copiar datos al contexto táctil restaurando la misma copia
  await tp.goto(BASE + '#/ajustes'); await tp.waitForSelector('#importar', { state: 'attached' }); await tp.setInputFiles('#importar', ruta); await tp.waitForSelector('#dlg[open]'); await tp.click('#dlg-ok'); await tp.waitForURL(/#\/proyectos/); await wait(500);
  const tid = (await tp.evaluate(async () => (await dbTodos('fotos')).map(f => f.id)))[0];
  await tp.goto(BASE + '#/foto/' + tid); await tp.waitForSelector('#lienzo'); await wait(400);
  const cdp = await tctx.newCDPSession(tp);
  const tb = await tp.locator('#lienzo').boundingBox();
  const y0 = await tp.evaluate(() => window.scrollY);
  const tx1 = tb.x + tb.width * .15, ty = tb.y + tb.height * .55, tx2 = tb.x + tb.width * .55;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx1, y: ty }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx1 + (tx2 - tx1) * i / 8, y: ty + i }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tp.waitForSelector('#dlg-texto[open]', { timeout: 4000 });
  check('Con el dedo: arrastrar sobre la foto dibuja la medida (sin hacer scroll)', (await tp.evaluate(() => window.scrollY)) === y0);
  await tp.fill('#dlg-texto-input', '1.80 m'); await tp.keyboard.press('Enter'); await wait(900);
  check('Con el dedo: la medida se guarda', await tp.evaluate(async id => (await dbObtener('fotos', id)).anotaciones.some(a => a.texto === '1.80 m'), tid));
  await tctx.close();

  // ---------- 15. Tamaños de pantalla ----------
  await page.goto(BASE + '#/foto/' + fotoId); await page.waitForSelector('#lienzo');
  for (const [w, h, n] of [[390, 844, 'celular'], [360, 640, 'celular chico'], [800, 1228, 'vertical'], [1228, 800, 'horizontal'], [1600, 900, 'pantalla grande']]) {
    await page.setViewportSize({ width: w, height: h }); await wait(500);
    for (const [v, hash] of [['foto', '#/foto/' + fotoId], ['galería', '#/proyecto/' + ids.p + '/fotos'], ['ajustes', '#/ajustes']]) {
      await page.goto(BASE + hash); await wait(600);
      const r = await page.evaluate(() => {
        const c = document.getElementById('lienzo'); const rc = c && c.getBoundingClientRect();
        const peq = [...document.querySelectorAll('.btn, .chip, .color-sw, .tab:not(.disabled), select, input:not([type=file]):not([hidden]), summary')].filter(e => e.offsetParent !== null)
          .map(e => [e.className || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(x => x[1] < 43 && x[1] > 0);
        return { sobra: document.documentElement.scrollWidth > innerWidth + 1, canvasDentro: !c || (rc.left >= -1 && rc.right <= innerWidth + 1 && rc.width > 100), peq: peq.slice(0, 3) };
      });
      check(`${n} (${w}px) ${v}: sin desbordes, lienzo dentro de la pantalla y botones de 44 px`, !r.sobra && r.canvasDentro && !r.peq.length, JSON.stringify(r));
    }
    if (n === 'celular') { await page.goto(BASE + '#/foto/' + fotoId); await wait(700); await page.screenshot({ path: SH + '6-detalle-celular.png' }); await page.goto(BASE + '#/proyecto/' + ids.p + '/fotos'); await wait(900); await page.screenshot({ path: SH + '7-galeria-celular.png' }); }
    if (n === 'vertical') { await page.goto(BASE + '#/foto/' + fotoId); await wait(700); await page.screenshot({ path: SH + '8-detalle-vertical.png' }); }
  }
  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  console.log(`\nPruebas de fotos: ${ok} correctas, ${fail} fallidas`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
