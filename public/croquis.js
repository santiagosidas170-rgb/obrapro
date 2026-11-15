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
  return { cajas, sinMedidas, aberturas: cq.aberturas || {}, hayNuevos: nuevos.length > 0 };
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
    const alto = n * tam * 1.3, y0 = Y + h / 2 - alto / 2 + tam * 0.65;
    for (let i = 0; i < n; i++) {
      ctx.font = `${lineas[i][1] ? 700 : 400} ${tam}px ${FUENTE_CQ}`;
      ctx.fillStyle = lineas[i][1] ? '#16212d' : '#4a5866';
      ctx.fillText(lineas[i][0], X + w / 2, y0 + i * tam * 1.3, Math.max(20, w - 6));
    }
  }
  /* barra de escala */
  const metros = k * 1 >= 45 ? 1 : 2, bx = 14, by = v.H - 16, bl = metros * k;
  ctx.fillStyle = '#16212d'; ctx.fillRect(bx, by, bl, 3); ctx.fillRect(bx, by - 4, 2, 11); ctx.fillRect(bx + bl - 2, by - 4, 2, 11);
  ctx.font = `400 ${Math.max(10, Math.min(16, k * 0.22))}px ${FUENTE_CQ}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(metros + ' m', bx + bl + 8, by + 6);
  ctx.restore();
}

/* Imagen del croquis lista para el PDF o la hoja del reporte. */
function croquisCanvas(d, ancho, altoMax) {
  const L = limitesCroquis(d.cajas), bw = Math.max(L.maxx - L.minx, 0.5), bh = Math.max(L.maxy - L.miny, 0.5);
  const alto = Math.round(Math.max(ancho * 0.35, Math.min(altoMax, ancho * bh / bw + 70)));
  const cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
  const v = vistaCroquis(d.cajas, ancho, alto, 34);
  dibujarCroquis(cv.getContext('2d'), d.cajas, d.aberturas, v, { grilla: false });
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
    const cq = p.croquis = Object.assign({ pos: {}, aberturas: {} }, p.croquis || {});
    cq.pos = cq.pos || {};
    for (const c of d.cajas) cq.pos[c.id] = { x: c.x, y: c.y, rot: !!c.rot };
    cq.aberturas = d.aberturas;
    p.actualizado = ahora();
    await dbGuardar('proyectos', p);
  };
  if (d.hayNuevos) await guardar();                 /* así el acomodo inicial no cambia solo después */

  cuerpo.innerHTML = `
    <div class="row-between"><h2>Croquis de referencia</h2><span class="muted small" id="cq-estado">Se guarda solo</span></div>
    <p class="muted small">Arrastra cada espacio para acomodarlo como está en la casa; las orillas se pegan solas. Toca un espacio para girarlo o agregarle puertas y ventanas.</p>
    <div class="card croquis-card"><canvas id="cq-canvas" tabindex="0" aria-label="Croquis. Toca un espacio y mueve con las flechas del teclado"></canvas></div>
    <div id="cq-sel" class="card"></div>
    ${d.sinMedidas.length ? `<p class="small aviso-texto" id="cq-sinmedidas">Sin medidas, no salen en el croquis: ${esc(d.sinMedidas.join(', '))}.</p>` : ''}
    <div class="actions">
      <button class="btn" id="cq-auto">Acomodar de nuevo</button>
      <button class="btn primary" id="cq-pdf">Descargar PDF</button>
      <button class="btn" id="cq-png">Descargar imagen</button>
    </div>
    <p class="muted small">${esc(LEYENDA_CROQUIS)}</p>`;

  const cv = $('#cq-canvas'), ctx = cv.getContext('2d');
  let v = null, sel = null, drag = null;
  const ajustar = () => {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    v = vistaCroquis(d.cajas, r.width, r.height, 28);
  };
  const dibujar = () => { if (!v) return; dibujarCroquis(ctx, d.cajas, d.aberturas, v, { sel, grilla: true }); };
  const refrescar = () => { ajustar(); dibujar(); };

  const cajaSel = () => d.cajas.find(c => c.id === sel);
  const dibujarPanel = () => {
    const panel = $('#cq-sel'), c = cajaSel();
    if (!c) { panel.innerHTML = '<p class="muted">Toca un espacio del croquis para elegirlo.</p>'; return; }
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
  const textoLado = l => (LADOS_CROQUIS.find(x => x[0] === l) || [0, ''])[1];

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
      const ancho = parseFloat(String(r.ancho).replace(',', '.')), largoMuro = (r.lado === 'N' || r.lado === 'S') ? c.w : c.h;
      const desdeTxt = String(r.desde || '').replace(',', '.').trim();
      let desde = desdeTxt === '' ? (largoMuro - ancho) / 2 : parseFloat(desdeTxt);
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

  /* --- arrastre --- */
  const punto = e => { const r = cv.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
  const aMetrosPt = (px, py) => ({ x: v.minx + (px - v.ox) / v.k, y: v.miny + (py - v.oy) / v.k });
  const golpe = (px, py) => { const m = aMetrosPt(px, py); for (let i = d.cajas.length - 1; i >= 0; i--) { const c = d.cajas[i]; if (m.x >= c.x && m.x <= c.x + c.w && m.y >= c.y && m.y <= c.y + c.h) return c; } return null; };
  cv.addEventListener('pointerdown', e => {
    const { px, py } = punto(e), c = golpe(px, py);
    if (!c) { if (sel) { sel = null; dibujar(); dibujarPanel(); } return; }
    cv.setPointerCapture(e.pointerId); cv.focus();
    const m = aMetrosPt(px, py);
    drag = { c, dx: m.x - c.x, dy: m.y - c.y, x0: e.clientX, y0: e.clientY, movio: false };
    if (sel !== c.id) { sel = c.id; dibujarPanel(); }
    d.cajas.splice(d.cajas.indexOf(c), 1); d.cajas.push(c);       /* la tomada queda encima */
    dibujar();
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.movio && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    drag.movio = true;
    const { px, py } = punto(e), m = aMetrosPt(px, py), c = drag.c;
    const nuevo = imanCroquis({ x: m.x - drag.dx, y: m.y - drag.dy, w: c.w, h: c.h }, d.cajas.filter(o => o !== c), 0.15 / Math.max(v.k / 40, 0.5));
    c.x = nuevo.x; c.y = nuevo.y;
    dibujar();
  });
  const soltar = async () => {
    if (!drag) return;
    const movio = drag.movio; drag = null;
    if (movio) { await guardar(); refrescar(); $('#cq-estado').textContent = 'Guardado'; }
  };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('keydown', async e => {
    const c = cajaSel(); if (!c) return;
    const paso = e.shiftKey ? 0.5 : 0.05, mv = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
    if (!mv) return;
    e.preventDefault(); c.x = Math.round((c.x + mv[0]) * 100) / 100; c.y = Math.round((c.y + mv[1]) * 100) / 100;
    refrescar(); await guardar();
  });

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

  window.addEventListener('resize', refrescar, { once: false });
  const alSalir = () => { if (!location.hash.includes('/croquis')) { window.removeEventListener('resize', refrescar); window.removeEventListener('hashchange', alSalir); } };
  window.addEventListener('hashchange', alSalir);
  dibujarPanel();
  requestAnimationFrame(refrescar);
}

/* Quita acentos y signos raros para nombres de archivo. */
function nombreSeguro(t) {
  return String(t || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim() || 'proyecto';
}
