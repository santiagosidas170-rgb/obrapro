const { chromium } = require('playwright');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
require('fs').mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8123/';
const SH = SALIDA + '/s-';
let ok = 0, fail = 0;
const check = (n, c, x='') => { if (c) { ok++; console.log('✔', n); } else { fail++; console.log('✘', n, x); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1228, height: 800 }, locale: 'es-MX' });
  const errores = [];
  let page = await ctx.newPage();
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

  // 1. El logo es lo primero que se ve
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForSelector('#splash');
  await wait(350);
  await page.screenshot({ path: SH + '1-inicio.png' });
  const primero = await page.evaluate(() => {
    const s = document.getElementById('splash'); const r = s.getBoundingClientRect();
    const centro = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    const img = s.querySelector('img');
    return { cubre: r.width === innerWidth && r.height === innerHeight, z: getComputedStyle(s).zIndex, encima: s.contains(centro), logoCargado: img.complete && img.naturalWidth > 0,
      textoNombre: s.querySelector('.nombre').textContent, anim: getComputedStyle(img).animationName };
  });
  check('Splash cubre toda la pantalla y queda por encima de la app', primero.cubre && primero.encima && Number(primero.z) >= 100, JSON.stringify(primero));
  check('El logo carga y se anima al abrir', primero.logoCargado && primero.anim === 'revelar', JSON.stringify(primero));
  await wait(900); await page.screenshot({ path: SH + '2-revelando.png' });
  await wait(900); await page.screenshot({ path: SH + '3-completo.png' });
  const colorLogo = await page.evaluate(() => new Promise(res => {
    const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0, b = 0, n = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k + 3] === 255) { r += d[k]; g += d[k + 1]; b += d[k + 2]; n++; }
      res([Math.round(r / n), Math.round(g / n), Math.round(b / n), n > 1000]); }; i.src = 'logo.png'; }));
  check('El logo conserva su color original #9F7A5A (159,122,90)', colorLogo.join() === '159,122,90,true', colorLogo.join());

  // 2. Después aparece la app
  await page.waitForSelector('#splash', { state: 'detached', timeout: 6000 });
  check('El splash desaparece solo y deja ver la app', await page.isVisible('h1:has-text("Proyectos")'));
  await page.screenshot({ path: SH + '4-app.png' });

  // 3. Paleta de la app
  const pal = await page.evaluate(() => {
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const btn = document.querySelector('.btn.primary'); const b = getComputedStyle(btn);
    return { brand: css('--brand'), accent: css('--accent'), btnBg: b.backgroundColor, btnTxt: b.color, texto: getComputedStyle(document.body).color, nav: getComputedStyle(document.querySelector('.sidenav')).backgroundColor };
  });
  check('Botón principal usa el bronce del logo (#C9A27C) con texto oscuro', pal.btnBg === 'rgb(201, 162, 124)' && pal.btnTxt === 'rgb(29, 21, 12)', JSON.stringify(pal));
  check('Color de marca = color exacto del logo', pal.brand === '#9f7a5a', pal.brand);
  check('Texto en blanco cálido', pal.texto === 'rgb(242, 237, 229)', pal.texto);
  const brandImg = await page.evaluate(() => { const i = document.querySelector('.sidenav .brand img'); return i.complete && i.naturalWidth > 0 && i.getAttribute('src'); });
  check('El logo aparece en el menú lateral', brandImg === 'logo-sm.png', String(brandImg));
  const vacio = await page.evaluate(() => { const i = document.querySelector('.empty-ico'); return !!i && i.complete && i.naturalWidth > 0; });
  check('El logo aparece en la pantalla de "sin proyectos"', vacio);

  // 4. En la misma sesión no se repite al recargar
  await page.reload(); await page.waitForSelector('main');
  check('Al recargar en la misma sesión no vuelve a salir', (await page.$('#splash')) === null);

  // 5. Sesión nueva (como abrir la app de nuevo) -> sí sale; tocar la pantalla la salta
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1228, height: 800 }, locale: 'es-MX' });
  page = await ctx2.newPage(); await page.goto(BASE); await page.waitForSelector('#splash');
  check('Al abrir la app de nuevo vuelve a salir el logo', await page.isVisible('#splash'));
  await wait(400); await page.click('#splash');
  await page.waitForSelector('#splash', { state: 'detached', timeout: 3000 });
  check('Tocar la pantalla salta el splash', true);
  const flag = await page.evaluate(() => sessionStorage.getItem('obrapro-splash'));
  check('Marca la sesión para no repetirlo', flag === '1');

  // 6. Teclado (tablet con teclado físico)
  const p3 = await ctx2.newPage(); await p3.evaluate(() => sessionStorage.clear()).catch(() => {});
  await p3.goto(BASE); await p3.evaluate(() => sessionStorage.clear()); await p3.reload(); await p3.waitForSelector('#splash');
  await wait(300); await p3.keyboard.press('Enter');
  await p3.waitForSelector('#splash', { state: 'detached', timeout: 3000 });
  check('Enter también salta el splash', true);

  // 7. Sin internet: el logo sale igual (está en la caché)
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await wait(600);
  await ctx2.setOffline(true);
  const p4 = await ctx2.newPage(); await p4.goto(BASE); await p4.evaluate(() => sessionStorage.clear()); await p4.reload().catch(() => {});
  await p4.waitForSelector('#splash', { timeout: 5000 });
  const off = await p4.evaluate(() => { const i = document.querySelector('#splash img'); return i.complete && i.naturalWidth > 0; });
  check('Sin internet el splash muestra el logo desde la caché', off);
  await p4.screenshot({ path: SH + '5-sin-internet.png' });
  await ctx2.setOffline(false);

  // 8. Reducir movimiento: sin animaciones y más corto
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'es-MX' });
  const p5 = await ctx3.newPage(); await p5.goto(BASE); await p5.waitForSelector('#splash');
  const dur = await p5.evaluate(() => getComputedStyle(document.querySelector('#splash .marca')).animationDuration);
  check('Reducir movimiento: el logo aparece sin animación', parseFloat(dur) < 0.001, dur);
  await wait(250); await p5.screenshot({ path: SH + '6-celular.png' });
  const t0 = Date.now(); await p5.waitForSelector('#splash', { state: 'detached', timeout: 4000 });
  check('Reducir movimiento: el splash dura menos de 2 segundos', Date.now() - t0 < 1800, String(Date.now() - t0));
  await ctx3.close();

  // 9. Celular chico y vertical: el logo cabe y se ve completo
  for (const [w, h, n] of [[360, 640, 'celular-chico'], [800, 1228, 'vertical'], [1228, 800, 'horizontal'], [1600, 900, 'grande']]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-MX' });
    const p = await c.newPage(); await p.goto(BASE); await p.waitForSelector('#splash'); await wait(2300);
    const r = await p.evaluate(() => { const m = document.querySelector('#splash .marca').getBoundingClientRect(), t = document.querySelector('#splash .lema').getBoundingClientRect();
      return { dentro: m.top >= 0 && m.bottom <= innerHeight && m.left >= 0 && m.right <= innerWidth && t.bottom <= innerHeight, ancho: Math.round(m.width) }; });
    check(`${n} (${w}×${h}): logo y textos caben completos (logo ${r.ancho}px)`, r.dentro, JSON.stringify(r));
    if (n === 'vertical') await p.screenshot({ path: SH + '7-vertical.png' });
    await c.close();
  }
  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  console.log(`\nPruebas del splash y el logo: ${ok} correctas, ${fail} fallidas`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
