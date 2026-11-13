const { chromium } = require('playwright');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
require('fs').mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8123/';
const SH = SALIDA + '/d-';
let ok = 0, fail = 0;
const check = (n, c, x='') => { if (c) { ok++; console.log('✔', n); } else { fail++; console.log('✘', n, x); } };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1228, height: 800 }, locale: 'es-MX', acceptDownloads: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('obrapro-splash','1'); } catch(e){} });
  const page = await ctx.newPage();
  const errores = [], malas = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('requestfailed', r => malas.push('FALLÓ ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) malas.push(r.status() + ' ' + r.url()); });

  await page.goto(BASE);
  await page.waitForSelector('.empty');
  await page.screenshot({ path: SH + 'vacio-horizontal.png' });

  // Datos de ejemplo directamente en la base de datos
  const ids = await page.evaluate(async () => {
    const mk = (n, cl, dir, est, tipo) => ({ id: nuevoId(), nombre: n, cliente: cl, direccion: dir, estado: est, tipoTrabajo: tipo,
      fecha: '2026-11-02', responsable: 'Santiago', telefono: '', correo: '', observaciones: '', archivado: false, creado: ahora(), actualizado: ahora() });
    const ps = [mk('Casa López', 'Juan López', 'Av. Juárez 123, Mazatlán', 'levantamiento', 'remodelacion'),
      mk('Local Centro', 'María Pérez', 'Belisario Domínguez 45', 'presupuestado', 'ampliacion'),
      mk('Depto Marina', 'Carlos Ruiz', 'Marina Mazatlán, torre B', 'ejecucion', 'mantenimiento'),
      mk('Oficina Norte', 'Ana Soto', 'Blvd. Sánchez Taboada 900', 'terminado', 'construccion'),
      mk('Bodega Sur', 'Luis Mena', 'Calle 5 de Mayo 78', 'pendiente', 'otro')];
    for (const p of ps) await dbGuardar('proyectos', p);
    const sp = (pid, n, l, a, h, u, est) => ({ id: nuevoId(), proyectoId: pid, nombre: n, tipo: n, unidad: u, forma: 'rectangular', largo: l, ancho: a, altura: h,
      tramos: [], perimetroManual: null, estadoActual: est, trabajos: '', observaciones: '', orden: 0, creado: ahora(), actualizado: ahora() });
    const e = [sp(ps[0].id, 'Sala', 4, 3.5, 2.5, 'm', 'regular'), sp(ps[0].id, 'Cocina', 420, 310, 250, 'cm', 'malo'),
      sp(ps[0].id, 'Recámara principal', 12, 10, 8, 'ft', 'bueno'),
      Object.assign(sp(ps[0].id, 'Patio', null, null, 2.5, 'm', 'obra_negra'), { forma: 'irregular',
        tramos: [{ id: nuevoId(), descripcion: 'Zona principal', largo: 5, ancho: 3, signo: 1 }, { id: nuevoId(), descripcion: 'Ala', largo: 2, ancho: 1.5, signo: 1 },
                 { id: nuevoId(), descripcion: 'Cisterna', largo: 0.8, ancho: 0.6, signo: -1 }] })];
    for (const s of e) await dbGuardar('espacios', s);
    return { p: ps[0].id, e: e.map(x => x.id) };
  });
  await page.goto(BASE + '#/proyectos'); await page.reload();
  await page.waitForSelector('.project-card');

  // --- Tipografía ---
  const fuente = await page.evaluate(async () => {
    await document.fonts.ready;
    return { ff: getComputedStyle(document.body).fontFamily, c400: document.fonts.check('400 16px Lato'), c700: document.fonts.check('700 16px Lato'),
      cargadas: [...document.fonts].filter(f => f.family.includes('Lato') && f.status === 'loaded').map(f => f.weight) };
  });
  check('Tipografía Lato en el cuerpo', fuente.ff.startsWith('Lato'), fuente.ff);
  check('Lato 400 y 700 cargadas desde la app', fuente.cargadas.includes('400') && fuente.cargadas.includes('700'), JSON.stringify(fuente));
  const h1 = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
  check('Títulos en Lato', h1.startsWith('Lato'));

  // --- Tema grafito ---
  const colores = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme }));
  check('Fondo grafito cálido (paleta del logo)', colores.bg === 'rgb(24, 23, 22)', colores.bg);

  // --- Favicon, manifiesto e íconos ---
  const enlaces = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="manifest"]')].map(l => ({ rel: l.rel, href: l.href })));
  check('Favicon ICO/PNG, apple-touch y manifest declarados', enlaces.length === 4, JSON.stringify(enlaces));
  for (const l of enlaces) {
    const r = await page.request.get(l.href);
    check('Responde 200: ' + l.href.split('/').slice(-1)[0], r.status() === 200);
  }
  const man = await (await page.request.get(BASE + 'manifest.json')).json();
  for (const ic of man.icons) {
    const r = await page.request.get(BASE + ic.src);
    check('Ícono del manifiesto existe: ' + ic.src + ' (' + ic.purpose + ')', r.status() === 200);
  }
  check('Manifiesto con colores del logo/grafito', man.theme_color === '#121110' && man.background_color === '#181716');
  const faviconOk = await page.evaluate(() => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth === 32); i.onerror = () => res(false); i.src = 'favicon-32.png'; }));
  check('El favicon PNG (logo) se decodifica como imagen', faviconOk);

  // --- Animaciones (movimiento normal) ---
  await page.goto(BASE + '#/ajustes'); await page.goto(BASE + '#/proyectos');
  await page.waitForSelector('.project-card');
  const anim = await page.evaluate(() => ({ cls: document.getElementById('main').className, n: getComputedStyle(document.querySelector('.project-card')).animationName,
    d: getComputedStyle(document.querySelector('.project-card')).animationDuration }));
  check('Animación de entrada en tarjetas', anim.cls.includes('enter') && anim.n === 'fade-up' && anim.d !== '0s', JSON.stringify(anim));
  await page.waitForTimeout(1300);
  check('La animación se retira al terminar (no reanima al buscar)', await page.evaluate(() => !document.getElementById('main').classList.contains('enter')));
  await page.hover('.project-card');
  await page.waitForTimeout(350);
  const hov = await page.evaluate(() => getComputedStyle(document.querySelector('.project-card:hover')).transform);
  check('Tarjeta se eleva al pasar el cursor', hov !== 'none', hov);
  await page.screenshot({ path: SH + 'lista-horizontal.png' });

  // --- Reducir movimiento ---
  const ctx2 = await browser.newContext({ viewport: { width: 1228, height: 800 }, reducedMotion: 'reduce' });
  await ctx2.addInitScript(() => { try { sessionStorage.setItem('obrapro-splash','1'); } catch(e){} });
  const pg2 = await ctx2.newPage();
  await pg2.goto(BASE); await pg2.waitForSelector('.empty, .project-card', { timeout: 5000 }).catch(() => {});
  const red = await pg2.evaluate(() => { const e = document.querySelector('main > *'); return getComputedStyle(e).animationDuration; });
  check('"Reducir movimiento" apaga las animaciones', parseFloat(red) < 0.001, red);
  await ctx2.close();

  // --- Espacios: tabla en horizontal / vertical / celular ---
  await page.goto(BASE + '#/proyecto/' + ids.p + '/espacios');
  await page.waitForSelector('tbody tr'); await page.waitForTimeout(900);
  await page.screenshot({ path: SH + 'espacios-horizontal.png' });
  await page.goto(BASE + '#/espacio/' + ids.e[3]); await page.waitForSelector('.tramo'); await page.waitForTimeout(900);
  await page.screenshot({ path: SH + 'irregular-horizontal.png', fullPage: true });
  const bump = await page.evaluate(() => document.getElementById('r-sup').textContent);
  check('Resultado de espacio irregular correcto (17.52 m²)', bump === '17.52 m²', bump);

  // Nuevo tramo se anima solo el nuevo
  await page.click('#agregar-tramo');
  const nuevos = await page.evaluate(() => document.querySelectorAll('.tramo.nuevo').length);
  check('Solo el tramo nuevo se anima', nuevos === 1, String(nuevos));
  // Quitar tramo con ícono dibujado (no carácter ✕)
  check('Botón quitar usa ícono SVG', await page.evaluate(() => !!document.querySelector('[data-quitar] svg') && !document.querySelector('[data-quitar]').textContent.includes('✕')));

  // Ajustes y diálogo
  await page.goto(BASE + '#/ajustes'); await page.waitForSelector('#exportar'); await page.waitForTimeout(800);
  await page.screenshot({ path: SH + 'ajustes-horizontal.png', fullPage: true });
  await page.goto(BASE + '#/proyecto/' + ids.p + '/datos'); await page.click('#eliminar'); await page.waitForTimeout(450);
  await page.screenshot({ path: SH + 'dialogo-horizontal.png' });
  await page.click('text=Cancelar');

  // --- Tamaños: vertical y celular ---
  const vistas = [['proyectos', '#/proyectos'], ['nuevo', '#/nuevo'], ['datos', '#/proyecto/' + ids.p + '/datos'], ['espacios', '#/proyecto/' + ids.p + '/espacios'],
    ['espacio', '#/espacio/' + ids.e[0]], ['irregular', '#/espacio/' + ids.e[3]], ['ajustes', '#/ajustes'], ['catalogo', '#/catalogo'], ['archivados', '#/archivados']];
  for (const [nombre, w, h] of [['celular', 390, 844], ['celular-chico', 360, 640], ['vertical', 800, 1228], ['horizontal', 1228, 800], ['pantalla-grande', 1600, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    let desb = [], chicos = [];
    for (const [v, hash] of vistas) {
      await page.goto(BASE + hash); await page.waitForTimeout(250);
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const sobra = document.documentElement.scrollWidth > window.innerWidth + 1;
        const peq = [...document.querySelectorAll('.btn, .chip, .tab:not(.disabled), input:not([type=file]):not([hidden]), select, .sidenav a')]
          .filter(e => e.offsetParent !== null).map(e => ({ e, r: e.getBoundingClientRect() })).filter(x => x.r.height < 43 && x.r.height > 0)
          .map(x => (x.e.className || x.e.tagName) + ':' + Math.round(x.r.height));
        return { sobra, peq };
      });
      if (r.sobra) desb.push(v);
      if (r.peq.length) chicos.push(v + '→' + r.peq.slice(0, 2).join(','));
      if (v === 'espacios' && w === 390) { /* tarjetas */ }
    }
    check(`${nombre} (${w}px): sin desbordamiento horizontal en ${vistas.length} vistas`, desb.length === 0, desb.join(','));
    check(`${nombre} (${w}px): botones y campos de al menos 44 px`, chicos.length === 0, chicos.join(' | '));
  }

  // Celular: tabla como tarjetas
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '#/proyecto/' + ids.p + '/espacios'); await page.waitForSelector('tbody tr'); await page.waitForTimeout(900);
  const tarjeta = await page.evaluate(() => {
    const tr = document.querySelector('tbody tr'); const td = tr.querySelectorAll('td')[2];
    return { disp: getComputedStyle(tr).display, label: getComputedStyle(td, '::before').content, thead: getComputedStyle(document.querySelector('thead')).position };
  });
  check('Celular: filas de la tabla como tarjetas con etiquetas', tarjeta.disp === 'grid' && tarjeta.label.includes('Superficie') && tarjeta.thead === 'absolute', JSON.stringify(tarjeta));
  await page.screenshot({ path: SH + 'espacios-celular.png', fullPage: true });
  await page.goto(BASE + '#/proyectos'); await page.waitForSelector('.project-card'); await page.waitForTimeout(900);
  await page.screenshot({ path: SH + 'lista-celular.png' });
  await page.goto(BASE + '#/espacio/' + ids.e[3]); await page.waitForSelector('.tramo'); await page.waitForTimeout(900);
  await page.screenshot({ path: SH + 'irregular-celular.png', fullPage: true });
  await page.goto(BASE + '#/nuevo'); await page.waitForTimeout(900);
  await page.screenshot({ path: SH + 'nuevo-celular.png' });

  await page.setViewportSize({ width: 800, height: 1228 });
  await page.goto(BASE + '#/proyecto/' + ids.p + '/espacios'); await page.waitForSelector('tbody tr'); await page.waitForTimeout(900);
  await page.screenshot({ path: SH + 'espacios-vertical.png' });
  await page.goto(BASE + '#/espacio/' + ids.e[0]); await page.waitForTimeout(900);
  await page.screenshot({ path: SH + 'espacio-vertical.png' });

  // --- Sin internet: tipografía y diseño siguen ahí ---
  await page.setViewportSize({ width: 1228, height: 800 });
  await page.goto(BASE); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForTimeout(800);
  const cache = await page.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return { k, n: (await c.keys()).length }; });
  check('Service Worker guarda 21 archivos en caché v1.1.0 (incluye el logo)', cache.k[0] === 'obrapro-v1.1.0' && cache.n === 21, JSON.stringify(cache));
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('.project-card');
  const off = await page.evaluate(async () => { await document.fonts.ready; return { l: document.fonts.check('700 16px Lato'), bg: getComputedStyle(document.body).backgroundColor,
    cargadas: [...document.fonts].filter(f => f.status === 'loaded').length }; });
  check('Sin internet: Lato y paleta se conservan', off.l && off.bg === 'rgb(24, 23, 22)' && off.cargadas >= 2, JSON.stringify(off));
  await ctx.setOffline(false);

  check('Sin respuestas de error ni peticiones fallidas', malas.filter(m => !m.includes('favicon.ico')).length === 0, malas.join(' | '));
  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  console.log(`\nPruebas de diseño: ${ok} correctas, ${fail} fallidas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
