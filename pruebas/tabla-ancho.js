/* Comprueba que la tabla de conceptos cabe completa (sin deslizar) en pantallas de 640 px o más. */
const { chromium } = require('playwright');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
require('fs').mkdirSync(SALIDA, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8123/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1228, height: 800 }, locale: 'es-MX' });
  await ctx.addInitScript(() => sessionStorage.setItem('obrapro-splash', '1'));
  const p = await ctx.newPage(); await p.goto(BASE); await p.waitForSelector('main');
  const id = await p.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'P', cliente: 'C', estado: 'pendiente', tipoTrabajo: 'otro', fecha: '2026-11-02', archivado: false, creado: ahora(), actualizado: ahora() }; await dbGuardar('proyectos', pr);
    const nombres = ['Pintura vinílica en muros y plafones', 'Piso cerámico o porcelanato', 'Instalaciones hidráulicas y sanitarias en baño principal', 'Limpieza final de obra'];
    for (const [i, n] of nombres.entries()) await dbGuardar('partidas', { id: nuevoId(), proyectoId: pr.id, espacioId: null, descripcion: n, categoria: 'Otros', unidad: 'm2', cantidad: 125.5, tipoCantidad: ['medida', 'estimada', 'confirmada', 'estimada'][i], origen: null, precioMaterial: 35000, precioManoObra: 28000, desperdicio: 10, notas: '', creado: ahora() + i, actualizado: ahora() });
    return pr.id; });
  let mal = 0;
  for (const [w, h] of [[640, 900], [800, 1228], [1000, 800], [1228, 800], [1400, 800], [1600, 900]]) {
    for (const tab of ['presupuesto', 'conceptos']) {
      await p.setViewportSize({ width: w, height: h }); await p.goto(BASE + '#/proyecto/' + id + '/' + tab); await p.waitForSelector('.table-wrap'); await p.waitForTimeout(700);
      const r = await p.evaluate(() => { const t = document.querySelector('.table-wrap'); return { sw: t.scrollWidth, cw: t.clientWidth, sub: [...document.querySelectorAll('th')].some(x => /Subtotal/.test(x.textContent)) }; });
      const ok = r.sw <= r.cw + 1; if (!ok) mal++;
      console.log(ok ? '✔' : '✘', `${w}px ${tab}: tabla ${r.sw}px en contenedor de ${r.cw}px`);
    }
  }
  console.log(mal ? `\n${mal} pantallas donde la tabla se corta` : '\nLa tabla cabe completa en todas las pantallas');
  await b.close(); process.exit(mal ? 1 : 0);
})();
