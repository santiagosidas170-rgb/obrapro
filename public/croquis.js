/* ObraPro - croquis.js  (Etapa 12)
   Croquis de referencia: cada espacio se dibuja a escala con sus medidas; el usuario arrastra
   los cuartos para acomodarlos como están en la casa y marca puertas y ventanas.
   No es un plano: es una referencia para el cliente. Guarda todo en p.croquis:
   { pos: { espacioId: {x, y, rot} }, aberturas: { espacioId: [{id, tipo, lado, ancho, desde}] } }  (metros). */
'use strict';

const LEYENDA_CROQUIS = 'Croquis de referencia. No es el plano oficial ni está a escala exacta; las medidas son las tomadas en la visita.';
const LADOS_CROQUIS = [['N', 'Arriba'], ['S', 'Abajo'], ['O', 'Izquierda'], ['E', 'Derecha']];
const FUENTE_CQ = 'Lato, "Segoe UI", Arial, sans-serif';

const num2 = n => (Math.round(n * 100) / 100).toFixed(2);

/* Cajas (en metros) de los espacios con medidas + los que no tienen. No guarda nada. */
function datosCroquis(p, espacios) {
  const cq = p.croquis || {};
  const pos = Object.assign({}, cq.pos || {});
  const cajas = [], sinMedidas = [], nuevos = [];
  for (const e of espacios) {
    const b = cajaEspacio(e);
    if (!b) { sinMedidas.push(e.nombre || 'Sin nombre'); continue; }
    const rot = !!(pos[e.id] && pos[e.id].rot);
    const w = rot ? b.h : b.w, h = rot ? b.w : b.h;
    const sup = calcularEspacio(e).superficie;
    const c = { id: e.id, nombre: e.nombre || 'Sin nombre', w, h, bw: b.w, bh: b.h, aprox: b.aprox, sup, rot, x: 0, y: 0 };
    if (pos[e.id] && isFinite(pos[e.id].x) && isFinite(pos[e.id].y)) { c.x = pos[e.id].x; c.y = pos[e.id].y; }
    else nuevos.push(c);
    cajas.push(c);
  }
  if (nuevos.length) {
    const fijas = cajas.filter(c => !nuevos.includes(c));
    const origenY = fijas.length ? limitesCroquis(fijas).maxy + 0.4 : 0;
    const total = nuevos.reduce((a, c) => a + c.w * c.h, 0);
    const lay = distribuirCroquis(nuevos, Math.max(8, Math.sqrt(total) * 1.8), origenY);
    for (const c of nuevos) { c.x = lay[c.id].x; c.y = lay[c.id].y; }
  }
  const elementos = (cq.elementos || []).filter(e => defElemento(e.tipo) && e.w > 0 && e.h > 0 && isFinite(e.x) && isFinite(e.y));
  return { cajas, sinMedidas, aberturas: cq.aberturas || {}, elementos, hayNuevos: nuevos.length > 0 };
}

/* Vista: escala (píxeles por metro) y desplazamiento para que todo quepa. */
function vistaCroquis(cajas, W, H, margen) {
  const L = limitesCroquis(cajas), m = margen == null ? 28 : margen;
  const bw = Math.max(L.maxx - L.minx, 0.5), bh = Math.max(L.maxy - L.miny, 0.5);
  const k = Math.min((W - 2 * m) / bw, (H - 2 * m) / bh);
  return { k, minx: L.minx, miny: L.miny, ox: (W - bw * k) / 2, oy: (H - bh * k) / 2, W, H };
}

const pxX = (v, x) => v.ox + (x - v.minx) * v.k;
const pxY = (v, y) => v.oy + (y - v.miny) * v.k;

function dibujarAbertura(ctx, v, c, a) {
  const k = v.k, ancho = Math.min(a.ancho, (a.lado === 'N' || a.lado === 'S') ? c.w : c.h);
  const desde = Math.max(0, Math.min(a.desde, (a.lado === 'N' || a.lado === 'S' ? c.w : c.h) - ancho));
  let x0, y0, ax, ay, nx, ny;                       /* inicio, dirección a lo largo del muro, hacia adentro */
  if (a.lado === 'N') { x0 = c.x + desde; y0 = c.y; ax = 1; ay = 0; nx = 0; ny = 1; }
  else if (a.lado === 'S') { x0 = c.x + desde; y0 = c.y + c.h; ax = 1; ay = 0; nx = 0; ny = -1; }
  else if (a.lado === 'O') { x0 = c.x; y0 = c.y + desde; ax = 0; ay = 1; nx = 1; ny = 0; }
  else { x0 = c.x + c.w; y0 = c.y + desde; ax = 0; ay = 1; nx = -1; ny = 0; }
  const X0 = pxX(v, x0), Y0 = pxY(v, y0), len = ancho * k, grosor = Math.max(5, k * 0.13);
  ctx.save();
  ctx.lineCap = 'butt';
  /* hueco en el muro */
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = grosor + 2;
  ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X0 + ax * len, Y0 + ay * len); ctx.stroke();
  if (a.tipo === 'ventana') {
    ctx.strokeStyle = '#3b82c4'; ctx.lineWidth = Math.max(1.5, k * 0.025);
    for (const d of [-0.35, 0, 0.35]) {
      ctx.beginPath(); ctx.moveTo(X0 + nx * grosor * d, Y0 + ny * grosor * d);
      ctx.lineTo(X0 + ax * len + nx * grosor * d, Y0 + ay * len + ny * grosor * d); ctx.stroke();
    }
  } else {
    /* puerta: hoja abierta 90° y arco de giro */
    const hx = X0, hy = Y0;
    ctx.strokeStyle = '#1c2b3a'; ctx.lineWidth = Math.max(1.5, k * 0.03);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + nx * len, hy + ny * len); ctx.stroke();
    ctx.setLineDash([4, 3]); ctx.lineWidth = Math.max(1, k * 0.02);
    const a0 = Math.atan2(ny, nx), a1 = Math.atan2(ay, ax);
    const dif = ((a1 - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    ctx.beginPath(); ctx.arc(hx, hy, len, a0, a0 + dif, dif < 0); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}


/* ---------- Elementos que se pueden colocar (muebles, aparatos, instalaciones, notas) ---------- */

/* [tipo, nombre, grupo, ancho m, largo m, dibujo] */
const ELEMENTOS_CROQUIS = [
  ['cama-matrimonial', 'Cama matrimonial', 'Recámara', 1.5, 2.0, 'cama'], ['cama-individual', 'Cama individual', 'Recámara', 0.9, 1.9, 'cama'],
  ['closet', 'Clóset', 'Recámara', 1.8, 0.6, 'rect'], ['buro', 'Buró', 'Recámara', 0.5, 0.4, 'rect'], ['escritorio', 'Escritorio', 'Recámara', 1.2, 0.6, 'rect'],
  ['sofa', 'Sofá', 'Sala y comedor', 2.0, 0.9, 'rect'], ['mesa-comedor', 'Mesa de comedor', 'Sala y comedor', 1.6, 0.9, 'rect'],
  ['mesa-centro', 'Mesa de centro', 'Sala y comedor', 1.0, 0.6, 'rect'], ['mueble-tv', 'Mueble de TV', 'Sala y comedor', 1.4, 0.4, 'rect'],
  ['estufa', 'Estufa', 'Cocina', 0.6, 0.6, 'estufa'], ['refri', 'Refrigerador', 'Cocina', 0.7, 0.7, 'rect'],
  ['fregadero', 'Fregadero', 'Cocina', 0.9, 0.5, 'lavabo'], ['barra', 'Barra o isla', 'Cocina', 1.5, 0.8, 'rect'],
  ['wc', 'WC', 'Baño', 0.4, 0.7, 'wc'], ['lavabo', 'Lavabo', 'Baño', 0.55, 0.45, 'lavabo'],
  ['regadera', 'Regadera', 'Baño', 0.9, 0.9, 'regadera'], ['tina', 'Tina', 'Baño', 0.75, 1.6, 'lavabo'],
  ['escalera', 'Escalera', 'Estructura', 1.0, 2.4, 'escalera'], ['columna', 'Columna', 'Estructura', 0.3, 0.3, 'columna'],
  ['contacto', 'Contacto', 'Instalaciones', 0.3, 0.3, 'contacto'], ['apagador', 'Apagador', 'Instalaciones', 0.3, 0.3, 'apagador'],
  ['luminaria', 'Luminaria', 'Instalaciones', 0.4, 0.4, 'luminaria'], ['clima', 'Aire acondicionado', 'Instalaciones', 0.9, 0.3, 'rect'],
  ['tablero', 'Medidor o tablero', 'Instalaciones', 0.4, 0.5, 'rect'], ['nota', 'Nota de texto', 'Texto', 1.2, 0.4, 'nota']
];
const COLOR_GRUPO_CQ = { 'Recámara': '#f1e6d3', 'Sala y comedor': '#f1e6d3', 'Cocina': '#dde9f4', 'Baño': '#dde9f4', 'Estructura': '#d4d7da', 'Instalaciones': '#fbeec2', 'Texto': 'rgba(0,0,0,0)' };
const defElemento = tipo => ELEMENTOS_CROQUIS.find(x => x[0] === tipo);

/* Caja que ocupa un elemento ya girado (en metros). */
const cajaElemento = e => ({ x: e.x, y: e.y, w: e.rot ? e.h : e.w, h: e.rot ? e.w : e.h });

function dibujarElemento(ctx, v, e, selec) {
  const def = defElemento(e.tipo); if (!def) return;
  const k = v.k, b = cajaElemento(e), X = pxX(v, b.x), Y = pxY(v, b.y), W = b.w * k, Hh = b.h * k;
  const cx = X + W / 2, cy = Y + Hh / 2, w0 = e.w * k, h0 = e.h * k, dib = def[5];
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(e.rot ? Math.PI / 2 : 0);
  ctx.lineWidth = Math.max(1.2, k * 0.025); ctx.strokeStyle = '#4c5b69'; ctx.lineJoin = 'round';
  const lx = -w0 / 2, ly = -h0 / 2;
  const caja = (relleno) => { ctx.fillStyle = relleno || COLOR_GRUPO_CQ[def[2]]; ctx.beginPath(); ctx.rect(lx, ly, w0, h0); ctx.fill(); ctx.stroke(); };
  if (dib === 'nota') { /* solo texto */ }
  else if (dib === 'columna') { ctx.fillStyle = '#3a4650'; ctx.fillRect(lx, ly, w0, h0); }
  else if (dib === 'contacto') { caja(); ctx.beginPath(); ctx.arc(0, 0, Math.min(w0, h0) * 0.32, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w0 * 0.1, -h0 * 0.12); ctx.lineTo(-w0 * 0.1, h0 * 0.12); ctx.moveTo(w0 * 0.1, -h0 * 0.12); ctx.lineTo(w0 * 0.1, h0 * 0.12); ctx.stroke(); }
  else if (dib === 'apagador') { caja(); ctx.beginPath(); ctx.moveTo(-w0 * 0.25, h0 * 0.25); ctx.lineTo(w0 * 0.25, -h0 * 0.25); ctx.stroke(); ctx.beginPath(); ctx.arc(-w0 * 0.25, h0 * 0.25, Math.max(1.5, k * 0.025), 0, 7); ctx.stroke(); }
  else if (dib === 'luminaria') { ctx.fillStyle = COLOR_GRUPO_CQ[def[2]]; ctx.beginPath(); ctx.arc(0, 0, Math.min(w0, h0) / 2, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-w0 * 0.32, -h0 * 0.32); ctx.lineTo(w0 * 0.32, h0 * 0.32); ctx.moveTo(w0 * 0.32, -h0 * 0.32); ctx.lineTo(-w0 * 0.32, h0 * 0.32); ctx.stroke(); }
  else {
    caja();
    if (dib === 'cama') { ctx.strokeRect(lx + w0 * 0.08, ly + h0 * 0.05, w0 * 0.84, h0 * 0.2); }                         /* almohadas arriba */
    else if (dib === 'estufa') { for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(a * w0 * 0.24, c * h0 * 0.24, Math.min(w0, h0) * 0.15, 0, 7); ctx.stroke(); } }
    else if (dib === 'lavabo') { ctx.beginPath(); ctx.ellipse(0, 0, w0 * 0.36, h0 * 0.34, 0, 0, 7); ctx.stroke(); }
    else if (dib === 'wc') { ctx.strokeRect(lx + w0 * 0.1, ly + h0 * 0.04, w0 * 0.8, h0 * 0.26); ctx.beginPath(); ctx.ellipse(0, h0 * 0.16, w0 * 0.36, h0 * 0.3, 0, 0, 7); ctx.stroke(); }
    else if (dib === 'regadera') { ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + w0, ly + h0); ctx.moveTo(lx + w0, ly); ctx.lineTo(lx, ly + h0); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, Math.min(w0, h0) * 0.12, 0, 7); ctx.stroke(); }
    else if (dib === 'escalera') { const n = Math.max(3, Math.round(e.h / 0.25)); ctx.beginPath(); for (let i = 1; i < n; i++) { ctx.moveTo(lx, ly + h0 * i / n); ctx.lineTo(lx + w0, ly + h0 * i / n); } ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, ly + h0 * 0.9); ctx.lineTo(0, ly + h0 * 0.1); ctx.lineTo(-w0 * 0.12, ly + h0 * 0.2); ctx.moveTo(0, ly + h0 * 0.1); ctx.lineTo(w0 * 0.12, ly + h0 * 0.2); ctx.stroke(); }
  }
  ctx.restore();
  /* nombre o texto (sin girar) */
  const texto = dib === 'nota' ? (e.texto || 'Nota') : (['rect', 'cama'].includes(dib) ? def[1] : '');
  if (texto) {
    let tam = Math.max(9, Math.min(15, k * 0.2));
    ctx.font = `${dib === 'nota' ? 700 : 400} ${tam}px ${FUENTE_CQ}`;
    const ancho = ctx.measureText(texto).width;
    if (dib === 'nota' || ancho <= Math.max(W, Hh) - 6) {
      ctx.fillStyle = '#16212d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (dib !== 'nota' && Hh > W * 1.4) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2); ctx.fillText(texto, 0, 0); ctx.restore(); }
      else ctx.fillText(texto, cx, cy);
    }
  }
  if (selec) { ctx.save(); ctx.strokeStyle = '#1d6fd8'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(X - 3, Y - 3, W + 6, Hh + 6); ctx.restore(); }
}

/* Dibuja el croquis completo. op: { sel, grilla, escala } */
function dibujarCroquis(ctx, cajas, aberturas, v, op = {}) {
  const k = v.k;
  ctx.save();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, v.W, v.H);
  if (op.grilla && k >= 12) {
    ctx.strokeStyle = '#e8edf3'; ctx.lineWidth = 1; ctx.beginPath();
    const x0 = Math.floor(v.minx - v.ox / k), x1 = Math.ceil(v.minx + (v.W - v.ox) / k);
    const y0 = Math.floor(v.miny - v.oy / k), y1 = Math.ceil(v.miny + (v.H - v.oy) / k);
    for (let x = x0; x <= x1; x++) { const px = Math.round(pxX(v, x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, v.H); }
    for (let y = y0; y <= y1; y++) { const py = Math.round(pxY(v, y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(v.W, py); }
    ctx.stroke();
  }
  const grosor = Math.max(3, k * 0.1);
  for (const c of cajas) {
    const X = pxX(v, c.x), Y = pxY(v, c.y), w = c.w * k, h = c.h * k;
    ctx.fillStyle = c.aprox ? '#f6f1e6' : '#eef3f9'; ctx.fillRect(X, Y, w, h);
    ctx.lineWidth = grosor; ctx.lineJoin = 'miter';
    ctx.strokeStyle = op.sel === c.id ? '#1d6fd8' : '#1c2b3a';
    if (c.aprox) ctx.setLineDash([grosor * 2.2, grosor]);
    ctx.strokeRect(X, Y, w, h); ctx.setLineDash([]);
  }
  for (const c of cajas) for (const a of (aberturas[c.id] || [])) dibujarAbertura(ctx, v, c, a);
  /* textos */
  for (const c of cajas) {
    const X = pxX(v, c.x), Y = pxY(v, c.y), w = c.w * k, h = c.h * k;
    const lineas = [[c.nombre, true]];
    lineas.push([c.aprox ? 'Irregular (aprox.)' : num2(c.bw) + ' × ' + num2(c.bh) + ' m', false]);
    if (c.sup > 0) lineas.push([num2(c.sup) + ' m²', false]);
    let tam = Math.max(10, Math.min(22, k * 0.3)), n = lineas.length;
    const caben = () => { ctx.font = `700 ${tam}px ${FUENTE_CQ}`; return lineas.every(([t, neg]) => { ctx.font = `${neg ? 700 : 400} ${tam}px ${FUENTE_CQ}`; return ctx.measureText(t).width <= w - 10; }) && n * tam * 1.3 <= h - 8; };
    while (tam > 8 && !caben()) tam -= 1;
    if (!caben()) { n = 1; if (!caben()) { tam = 8; } }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#16212d';
    const alto = n * tam * 1.3;
    let lw = 0; for (let i = 0; i < n; i++) { ctx.font = `${lineas[i][1] ? 700 : 400} ${tam}px ${FUENTE_CQ}`; lw = Math.max(lw, ctx.measureText(lineas[i][0]).width); }
    lw = Math.min(lw, w - 6);
    /* el texto se acomoda donde no lo tape un mueble: centro, arriba, abajo o una esquina */
    const libre = (tx, ty) => !(op.elementos || []).some(e => { const b = cajaElemento(e), ex = pxX(v, b.x), ey = pxY(v, b.y), ew = b.w * k, eh = b.h * k;
      return tx - lw / 2 < ex + ew && tx + lw / 2 > ex && ty - alto / 2 < ey + eh && ty + alto / 2 > ey; });
    const cx = X + w / 2, cy = Y + h / 2, m = 6;
    const cand = [[cx, cy], [cx, Y + alto / 2 + m], [cx, Y + h - alto / 2 - m], [X + lw / 2 + m, Y + alto / 2 + m], [X + w - lw / 2 - m, Y + alto / 2 + m],
      [X + lw / 2 + m, Y + h - alto / 2 - m], [X + w - lw / 2 - m, Y + h - alto / 2 - m]];
    const [tx, ty] = cand.find(([a, b2]) => libre(a, b2)) || cand[0];
    const y0 = ty - alto / 2 + tam * 0.65;
    for (let i = 0; i < n; i++) {
      ctx.font = `${lineas[i][1] ? 700 : 400} ${tam}px ${FUENTE_CQ}`;
      ctx.fillStyle = lineas[i][1] ? '#16212d' : '#4a5866';
      ctx.fillText(lineas[i][0], tx, y0 + i * tam * 1.3, Math.max(20, w - 6));
    }
  }
  for (const e of (op.elementos || [])) dibujarElemento(ctx, v, e, op.selElemento === e.id);
  /* barra de escala */
  const metros = k * 1 >= 45 ? 1 : 2, bx = 14, by = v.H - 16, bl = metros * k;
  ctx.fillStyle = '#16212d'; ctx.fillRect(bx, by, bl, 3); ctx.fillRect(bx, by - 4, 2, 11); ctx.fillRect(bx + bl - 2, by - 4, 2, 11);
  ctx.font = `400 ${Math.max(10, Math.min(16, k * 0.22))}px ${FUENTE_CQ}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(metros + ' m', bx + bl + 8, by + 6);
  ctx.restore();
}

/* Imagen del croquis lista para el PDF o la hoja del reporte. */
function croquisCanvas(d, ancho, altoMax) {
  const todas = d.cajas.concat((d.elementos || []).map(cajaElemento));
  const L = limitesCroquis(todas), bw = Math.max(L.maxx - L.minx, 0.5), bh = Math.max(L.maxy - L.miny, 0.5);
  const alto = Math.round(Math.max(ancho * 0.35, Math.min(altoMax, ancho * bh / bw + 70)));
  const cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
  const v = vistaCroquis(todas, ancho, alto, 34);
  dibujarCroquis(cv.getContext('2d'), d.cajas, d.aberturas, v, { grilla: false, elementos: d.elementos });
  return cv;
}

/* ---------- Pestaña "Croquis" ---------- */

async function pestanaCroquis(p) {
  const espacios = (await dbPorProyecto('espacios', p.id))
    .sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.creado || '').localeCompare(b.creado || ''));
  const cuerpo = $('#tab-body');
  if (!cuerpo) return;
  if (!espacios.length) {
    cuerpo.innerHTML = `<div class="card"><h2>Croquis de referencia</h2><p>Primero captura las medidas de al menos un espacio.</p>
      <a class="btn primary" href="#/proyecto/${p.id}/espacios">Ir a Espacios</a></div>`;
    return;
  }
  const d = datosCroquis(p, espacios);
  if (!d.cajas.length) {
    cuerpo.innerHTML = `<div class="card"><h2>Croquis de referencia</h2><p>Tus espacios aún no tienen largo y ancho. Captúralos para verlos aquí.</p>
      <a class="btn primary" href="#/proyecto/${p.id}/espacios">Ir a Espacios</a></div>`;
    return;
  }
  const guardar = async () => {
    const cq = p.croquis = Object.assign({ pos: {}, aberturas: {}, elementos: [] }, p.croquis || {});
    cq.pos = cq.pos || {};
    for (const c of d.cajas) cq.pos[c.id] = { x: c.x, y: c.y, rot: !!c.rot };
    cq.aberturas = d.aberturas;
    cq.elementos = d.elementos;
    p.actualizado = ahora();
    await dbGuardar('proyectos', p);
    const st = $('#cq-estado'); if (st) st.textContent = 'Guardado';
  };
  if (d.hayNuevos) await guardar();                 /* así el acomodo inicial no cambia solo después */

  cuerpo.innerHTML = `
    <div class="row-between"><h2>Croquis de referencia</h2><span class="muted small" id="cq-estado">Se guarda solo</span></div>
    <p class="muted small">Arrastra los espacios para acomodarlos. Agrega muebles e instalaciones con <strong>Agregar elemento</strong>. Mueve la vista arrastrando el fondo; acércate con ＋ o con dos dedos.</p>
    <div class="actions chicos">
      <button class="btn primary" id="cq-agregar">Agregar elemento</button>
      <button class="btn" id="cq-zmas" aria-label="Acercar">＋</button><button class="btn" id="cq-zmenos" aria-label="Alejar">－</button>
      <button class="btn" id="cq-todo">Ver todo</button>
    </div>
    <div class="card croquis-card"><canvas id="cq-canvas" tabindex="0" aria-label="Croquis. Toca un espacio o elemento y mueve con las flechas del teclado"></canvas></div>
    <div id="cq-sel" class="card"></div>
    ${d.sinMedidas.length ? `<p class="small aviso-texto" id="cq-sinmedidas">Sin medidas, no salen en el croquis: ${esc(d.sinMedidas.join(', '))}.</p>` : ''}
    <div class="actions">
      <button class="btn" id="cq-auto">Acomodar espacios de nuevo</button>
      <button class="btn primary" id="cq-pdf">Descargar PDF</button>
      <button class="btn" id="cq-png">Descargar imagen</button>
    </div>
    <p class="muted small">${esc(LEYENDA_CROQUIS)}</p>`;

  const cv = $('#cq-canvas'), ctx = cv.getContext('2d');
  cv.vistaActual = () => cam;                       /* para las pruebas automáticas */
  let base = null, cam = null, tam = null, sel = null /* {t:'s'|'e', id} */, drag = null, pinch = null;
  const ptrs = new Map();
  const todas = () => d.cajas.concat(d.elementos.map(cajaElemento));
  const ajustar = () => {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    base = vistaCroquis(todas(), r.width, r.height, 28); cam = Object.assign({}, base); tam = { w: r.width, h: r.height };
  };
  /* Si cambia el tamaño (barra de desplazamiento, girar la tablet) se conserva el acercamiento y el centro. */
  const alCambiarTam = () => {
    if (!cam || !tam) return;
    const r = cv.getBoundingClientRect();
    if (Math.abs(r.width - tam.w) < 1 && Math.abs(r.height - tam.h) < 1) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam.ox += (r.width - tam.w) / 2; cam.oy += (r.height - tam.h) / 2; cam.W = r.width; cam.H = r.height;
    base.ox += (r.width - tam.w) / 2; base.oy += (r.height - tam.h) / 2; base.W = r.width; base.H = r.height;
    tam = { w: r.width, h: r.height }; dibujar();
  };
  const dibujar = () => { if (cam) dibujarCroquis(ctx, d.cajas, d.aberturas, cam, { sel: sel && sel.t === 's' ? sel.id : null, grilla: true, elementos: d.elementos.map(e => e), selElemento: sel && sel.t === 'e' ? sel.id : null }); };
  const refrescar = () => { ajustar(); dibujar(); };
  const zoomEn = (f, px, py) => {
    const k2 = Math.max(base.k * 0.4, Math.min(base.k * 14, cam.k * f)), r = k2 / cam.k;
    cam.ox = px - (px - cam.ox) * r; cam.oy = py - (py - cam.oy) * r; cam.k = k2; dibujar();
  };
  const centro = () => { const r = cv.getBoundingClientRect(); return { x: r.width / 2, y: r.height / 2 }; };

  const cajaSel = () => sel && sel.t === 's' ? d.cajas.find(c => c.id === sel.id) : null;
  const elemSel = () => sel && sel.t === 'e' ? d.elementos.find(e => e.id === sel.id) : null;
  const textoLado = l => (LADOS_CROQUIS.find(x => x[0] === l) || [0, ''])[1];

  const dibujarPanel = () => {
    const panel = $('#cq-sel'), c = cajaSel(), e = elemSel();
    if (e) {
      const def = defElemento(e.tipo);
      panel.innerHTML = `<div class="row-between"><h3>${esc(e.tipo === 'nota' ? 'Nota: ' + (e.texto || '') : def[1])} <small class="muted">${num2(e.w)} × ${num2(e.h)} m</small></h3>
        <span class="actions tight"><button class="btn" id="cq-egirar">Girar 90°</button><button class="btn" id="cq-etam">${e.tipo === 'nota' ? 'Cambiar texto' : 'Cambiar tamaño'}</button>
        <button class="btn" id="cq-edup">Duplicar</button><button class="btn danger-outline" id="cq-edel">Eliminar</button></span></div>`;
      $('#cq-egirar').addEventListener('click', async () => { e.rot = !e.rot; dibujar(); await guardar(); });
      $('#cq-etam').addEventListener('click', () => editarElemento(e));
      $('#cq-edup').addEventListener('click', async () => {
        const n = Object.assign({}, e, { id: nuevoId(), x: Math.round((e.x + 0.3) * 100) / 100, y: Math.round((e.y + 0.3) * 100) / 100 });
        d.elementos.push(n); sel = { t: 'e', id: n.id }; dibujar(); dibujarPanel(); await guardar();
      });
      $('#cq-edel').addEventListener('click', async () => {
        d.elementos.splice(d.elementos.indexOf(e), 1); sel = null; dibujar(); dibujarPanel(); await guardar(); aviso('Elemento eliminado.');
      });
      return;
    }
    if (!c) { panel.innerHTML = '<p class="muted">Toca un espacio o un elemento del croquis para elegirlo.</p>'; return; }
    const ab = d.aberturas[c.id] || [];
    panel.innerHTML = `<div class="row-between"><h3>${esc(c.nombre)}</h3>
        <span class="actions tight"><button class="btn" id="cq-girar">Girar 90°</button>
        <button class="btn" data-nueva="puerta">Agregar puerta</button><button class="btn" data-nueva="ventana">Agregar ventana</button></span></div>
      ${ab.length ? `<ul class="lista-ab">${ab.map(a => `<li><button class="btn ghost" data-ab="${esc(a.id)}">${a.tipo === 'puerta' ? 'Puerta' : 'Ventana'} · muro ${esc(textoLado(a.lado).toLowerCase())} · ${num2(a.ancho)} m</button></li>`).join('')}</ul>`
        : '<p class="muted small">Sin puertas ni ventanas.</p>'}`;
    $('#cq-girar').addEventListener('click', async () => {
      const c0 = cajaSel(); c0.rot = !c0.rot; [c0.w, c0.h] = [c0.h, c0.w];
      d.aberturas[c0.id] = [];                      /* los lados cambian al girar: se vuelven a marcar */
      await guardar(); refrescar(); dibujarPanel();
      aviso('Giraste el espacio. Marca de nuevo sus puertas y ventanas.');
    });
    $$('[data-nueva]', panel).forEach(b => b.addEventListener('click', () => editarAbertura(c, null, b.dataset.nueva)));
    $$('[data-ab]', panel).forEach(b => b.addEventListener('click', () => editarAbertura(c, ab.find(a => a.id === b.dataset.ab), null)));
  };

  const num = t => parseFloat(String(t).replace(',', '.'));

  const editarAbertura = async (c, existente, tipoNuevo) => {
    let valores = existente ? { tipo: existente.tipo, lado: existente.lado, ancho: String(existente.ancho), desde: String(existente.desde) }
      : { tipo: tipoNuevo, lado: 'N', ancho: tipoNuevo === 'puerta' ? '0.90' : '1.20', desde: '' };
    for (;;) {
      const r = await formularioMov({
        titulo: existente ? 'Editar puerta o ventana' : (tipoNuevo === 'puerta' ? 'Agregar puerta' : 'Agregar ventana'),
        campos: [
          { k: 'tipo', t: 'Es una', tipo: 'select', op: [['puerta', 'Puerta'], ['ventana', 'Ventana']] },
          { k: 'lado', t: 'En qué muro', tipo: 'select', op: LADOS_CROQUIS, ayuda: 'Visto en el croquis: arriba, abajo, izquierda o derecha.' },
          { k: 'ancho', t: 'Ancho (m)', req: true },
          { k: 'desde', t: 'Distancia desde la esquina de arriba o la izquierda (m)', ayuda: 'Déjalo vacío para centrarla.' }],
        valores, puedeEliminar: !!existente });
      if (r === null) return;
      if (r === 'eliminar') { d.aberturas[c.id] = (d.aberturas[c.id] || []).filter(a => a.id !== existente.id); break; }
      const ancho = num(r.ancho), largoMuro = (r.lado === 'N' || r.lado === 'S') ? c.w : c.h;
      const desdeTxt = String(r.desde || '').replace(',', '.').trim();
      const desde = desdeTxt === '' ? (largoMuro - ancho) / 2 : parseFloat(desdeTxt);
      valores = r;
      if (!(ancho > 0)) { aviso('El ancho debe ser un número mayor que cero.'); continue; }
      if (ancho > largoMuro + 1e-9) { aviso(`El ancho no cabe: ese muro mide ${num2(largoMuro)} m.`); continue; }
      if (!(desde >= 0) || desde + ancho > largoMuro + 1e-9) { aviso(`Debe quedar dentro del muro (de 0 a ${num2(largoMuro - ancho)} m).`); continue; }
      const nuevo = { id: existente ? existente.id : nuevoId(), tipo: r.tipo, lado: r.lado, ancho: Math.round(ancho * 100) / 100, desde: Math.round(desde * 100) / 100 };
      const lista = (d.aberturas[c.id] || []).filter(a => !existente || a.id !== existente.id);
      lista.push(nuevo); d.aberturas[c.id] = lista;
      break;
    }
    await guardar(); dibujar(); dibujarPanel();
  };

  /* --- elementos: agregar, cambiar tamaño o texto --- */
  const agregarElemento = async () => {
    const r = await formularioMov({
      titulo: 'Agregar elemento',
      campos: [
        { k: 'tipo', t: 'Qué quieres poner', tipo: 'select', op: ELEMENTOS_CROQUIS.map(x => [x[0], x[2] + ' · ' + x[1]]) },
        { k: 'texto', t: 'Texto (solo para "Nota de texto")', ayuda: 'Por ejemplo: "Aquí va la tina" o "Quitar muro".' }],
      valores: { tipo: 'cama-matrimonial', texto: '' }, textoGuardar: 'Agregar' });
    if (!r) return;
    const def = defElemento(r.tipo);
    if (r.tipo === 'nota' && !String(r.texto).trim()) { aviso('Escribe el texto de la nota.'); return agregarElemento(); }
    const cs = cajaSel(), c = centro();
    let x, y;
    if (cs) { x = cs.x + cs.w / 2; y = cs.y + cs.h / 2; }
    else { x = cam ? cam.minx + (c.x - cam.ox) / cam.k : 0; y = cam ? cam.miny + (c.y - cam.oy) / cam.k : 0; }
    const n = { id: nuevoId(), tipo: r.tipo, x: Math.round((x - def[3] / 2) * 20) / 20, y: Math.round((y - def[4] / 2) * 20) / 20, w: def[3], h: def[4], rot: false, texto: r.tipo === 'nota' ? String(r.texto).trim().slice(0, 80) : '' };
    d.elementos.push(n); sel = { t: 'e', id: n.id };
    await guardar(); dibujar(); dibujarPanel();
  };
  const editarElemento = async e => {
    if (e.tipo === 'nota') {
      const r = await formularioMov({ titulo: 'Cambiar texto', campos: [{ k: 'texto', t: 'Texto', req: true }], valores: { texto: e.texto || '' } });
      if (!r) return; e.texto = String(r.texto).slice(0, 80);
    } else {
      let valores = { ancho: String(e.w), largo: String(e.h) };
      for (;;) {
        const r = await formularioMov({ titulo: 'Cambiar tamaño', campos: [{ k: 'ancho', t: 'Ancho (m)', req: true }, { k: 'largo', t: 'Largo (m)', req: true }], valores });
        if (!r) return; valores = r;
        const a = num(r.ancho), l = num(r.largo);
        if (!(a > 0 && l > 0) || a > 30 || l > 30) { aviso('Escribe medidas mayores que cero y menores de 30 m.'); continue; }
        e.w = Math.round(a * 100) / 100; e.h = Math.round(l * 100) / 100; break;
      }
    }
    await guardar(); dibujar(); dibujarPanel();
  };

  /* --- tocar, arrastrar, mover la vista y pellizcar --- */
  const punto = e => { const r = cv.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
  const aM = (px, py) => ({ x: cam.minx + (px - cam.ox) / cam.k, y: cam.miny + (py - cam.oy) / cam.k });
  const golpe = (px, py) => {
    const m = aM(px, py), holgura = 9 / cam.k;                  /* los elementos chicos se tocan con 9 px de margen */
    for (let i = d.elementos.length - 1; i >= 0; i--) {
      const e = d.elementos[i], b = cajaElemento(e);
      if (m.x >= b.x - holgura && m.x <= b.x + b.w + holgura && m.y >= b.y - holgura && m.y <= b.y + b.h + holgura) return { t: 'e', obj: e };
    }
    for (let i = d.cajas.length - 1; i >= 0; i--) { const c = d.cajas[i]; if (m.x >= c.x && m.x <= c.x + c.w && m.y >= c.y && m.y <= c.y + c.h) return { t: 's', obj: c }; }
    return null;
  };
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();                              /* sin selección de texto ni desplazamiento al arrastrar */
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* puntero simulado */ }
    cv.focus({ preventScroll: true });
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); drag = null; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; return; }
    const { px, py } = punto(e), h = golpe(px, py);
    if (!h) { drag = { pan: true, x0: e.clientX, y0: e.clientY, ox: cam.ox, oy: cam.oy, movio: false }; return; }
    const m = aM(px, py), o = h.obj;
    drag = { t: h.t, o, dx: m.x - o.x, dy: m.y - o.y, x0: e.clientX, y0: e.clientY, movio: false };
    if (!sel || sel.t !== h.t || sel.id !== o.id) { sel = { t: h.t, id: o.id }; dibujarPanel(); }
    if (h.t === 's') { d.cajas.splice(d.cajas.indexOf(o), 1); d.cajas.push(o); }   /* la tomada queda encima */
    dibujar();
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values()), dist = Math.hypot(a.x - b.x, a.y - b.y), r = cv.getBoundingClientRect();
      if (pinch.d > 0 && dist > 0) zoomEn(dist / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.d = dist; return;
    }
    if (!drag) return;
    if (!drag.movio && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    drag.movio = true;
    if (drag.pan) { cam.ox = drag.ox + (e.clientX - drag.x0); cam.oy = drag.oy + (e.clientY - drag.y0); dibujar(); return; }
    const { px, py } = punto(e), m = aM(px, py), o = drag.o;
    const cajaO = drag.t === 'e' ? cajaElemento(o) : o;
    const otros = d.cajas.filter(x => x !== o);
    const tol = 0.12 / Math.max(cam.k / base.k, 0.5);
    const nuevo = imanCroquis({ x: m.x - drag.dx, y: m.y - drag.dy, w: cajaO.w, h: cajaO.h }, otros, tol);
    o.x = nuevo.x; o.y = nuevo.y;
    dibujar();
  });
  const soltar = async e => {
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) pinch = null; return; }
    if (!drag) return;
    const dg = drag; drag = null;
    if (dg.pan) { if (!dg.movio && sel) { sel = null; dibujar(); dibujarPanel(); } return; }
    if (dg.movio) await guardar();
  };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('wheel', e => { e.preventDefault(); const { px, py } = punto(e); zoomEn(e.deltaY < 0 ? 1.15 : 1 / 1.15, px, py); }, { passive: false });
  cv.addEventListener('keydown', async e => {
    const o = cajaSel() || elemSel(); if (!o) return;
    const paso = e.shiftKey ? 0.5 : 0.05, mv = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
    if (!mv) { if ((e.key === 'Delete' || e.key === 'Backspace') && elemSel()) { e.preventDefault(); $('#cq-edel').click(); } return; }
    e.preventDefault(); o.x = Math.round((o.x + mv[0]) * 100) / 100; o.y = Math.round((o.y + mv[1]) * 100) / 100;
    dibujar(); await guardar();
  });

  $('#cq-agregar').addEventListener('click', agregarElemento);
  $('#cq-zmas').addEventListener('click', () => { const c = centro(); zoomEn(1.3, c.x, c.y); });
  $('#cq-zmenos').addEventListener('click', () => { const c = centro(); zoomEn(1 / 1.3, c.x, c.y); });
  $('#cq-todo').addEventListener('click', refrescar);
  $('#cq-auto').addEventListener('click', async () => {
    const lay = distribuirCroquis(d.cajas, Math.max(8, Math.sqrt(d.cajas.reduce((a, c) => a + c.w * c.h, 0)) * 1.8), 0);
    for (const c of d.cajas) { c.x = lay[c.id].x; c.y = lay[c.id].y; }
    await guardar(); refrescar(); aviso('Espacios acomodados de nuevo.');
  });
  const ocupado = (btn, texto, f) => async () => {
    const t0 = btn.textContent; btn.disabled = true; btn.textContent = texto;
    try { await f(); } catch (e) { console.error(e); aviso('No se pudo: ' + e.message); }
    btn.disabled = false; btn.textContent = t0;
  };
  const bpdf = $('#cq-pdf');
  bpdf.addEventListener('click', ocupado(bpdf, 'Preparando PDF…', async () => {
    const archivo = await generarPDFCroquis(p, d);
    descargarArchivo(archivo); aviso('Descargando ' + archivo.name + '. Búscalo en la carpeta Descargas.');
  }));
  const bpng = $('#cq-png');
  bpng.addEventListener('click', ocupado(bpng, 'Preparando…', async () => {
    const img = croquisCanvas(d, 1600, 1600);
    const blob = await new Promise(res => img.toBlob(res, 'image/png'));
    descargarArchivo(new File([blob], 'Croquis ' + nombreSeguro(p.nombre) + '.png', { type: 'image/png' }));
    aviso('Descargando la imagen del croquis.');
  }));

  window.addEventListener('resize', alCambiarTam);
  const alSalir = () => { if (!location.hash.includes('/croquis')) { window.removeEventListener('resize', alCambiarTam); window.removeEventListener('hashchange', alSalir); } };
  window.addEventListener('hashchange', alSalir);
  dibujarPanel();
  requestAnimationFrame(refrescar);
}

/* Quita acentos y signos raros para nombres de archivo. */
function nombreSeguro(t) {
  return String(t || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim() || 'proyecto';
}
