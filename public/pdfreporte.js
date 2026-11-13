/* ObraPro - pdfreporte.js
   Genera el archivo PDF del reporte dentro de la app (sin depender de la ventana de impresión
   del navegador). Dibuja cada página en un canvas (tamaño carta, 150 ppp) y las junta en un PDF. */
'use strict';

const PDF_W = 1275, PDF_H = 1650, PDF_M = 100;       /* carta a 150 ppp */
const T = { tinta: '#1d1a16', bronce: '#6f5238', marca: '#9f7a5a', gris: '#5b5349', fondo: '#f1ebe2', linea: '#e4dccf' };

class HojaPDF {
  constructor() { this.paginas = []; this.nueva(); }
  nueva() {
    const c = document.createElement('canvas'); c.width = PDF_W; c.height = PDF_H;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, PDF_W, PDF_H);
    x.textBaseline = 'alphabetic';
    this.paginas.push(c); this.ctx = x; this.y = PDF_M;
  }
  get ancho() { return PDF_W - 2 * PDF_M; }
  /* ¿cabe h? Si no, pasa a otra página. */
  cabe(h) { if (this.y + h > PDF_H - PDF_M - 20) { this.nueva(); return false; } return true; }
  fuente(px, neg) { this.ctx.font = `${neg ? 700 : 400} ${px}px Lato, "Helvetica Neue", Arial, sans-serif`; }
  medir(t) { return this.ctx.measureText(t).width; }
  /* Parte un texto en líneas que caben en w (respeta saltos de línea). */
  lineas(texto, w) {
    const res = [];
    for (const par of String(texto == null ? '' : texto).split('\n')) {
      let actual = '';
      for (const pal of par.split(/\s+/).filter(Boolean)) {
        let p = pal;
        while (this.medir(p) > w) {                      /* palabra más larga que la línea */
          let n = p.length; while (n > 1 && this.medir(p.slice(0, n)) > w) n--;
          if (actual) { res.push(actual); actual = ''; }
          res.push(p.slice(0, n)); p = p.slice(n);
        }
        const prueba = actual ? actual + ' ' + p : p;
        if (this.medir(prueba) <= w) actual = prueba; else { res.push(actual); actual = p; }
      }
      res.push(actual);
    }
    return res.length ? res : [''];
  }
  /* Texto con saltos de página línea por línea. */
  parrafo(texto, { px = 23, neg = false, color = T.tinta, x = PDF_M, w = this.ancho, sep = 6, ali = 'left' } = {}) {
    this.fuente(px, neg); this.ctx.fillStyle = color;
    const alto = Math.round(px * 1.4);
    for (const l of this.lineas(texto, w)) {
      this.cabe(alto); this.fuente(px, neg); this.ctx.fillStyle = color;
      const xx = ali === 'right' ? x + w - this.medir(l) : ali === 'center' ? x + (w - this.medir(l)) / 2 : x;
      this.ctx.fillText(l, xx, this.y + px); this.y += alto;
    }
    this.y += sep;
  }
  h2(t) {
    this.cabe(110); this.y += 14;
    this.fuente(27, true); this.ctx.fillStyle = T.bronce;
    this.ctx.fillText(t.toUpperCase(), PDF_M, this.y + 27); this.y += 40;
    this.ctx.fillStyle = T.marca; this.ctx.fillRect(PDF_M, this.y, this.ancho, 3); this.y += 18;
  }
  h4(t) { this.cabe(70); this.parrafo(t, { px: 22, neg: true, color: T.bronce, sep: 0 }); }
  filaDato(et, v) {
    if (!v) return;
    const wEt = 240;
    this.fuente(23, false);
    const ls = this.lineas(v, this.ancho - wEt), alto = Math.round(23 * 1.4);
    this.cabe(alto * ls.length + 4);
    this.fuente(23, true); this.ctx.fillStyle = T.bronce; this.ctx.fillText(et, PDF_M, this.y + 23);
    this.fuente(23, false); this.ctx.fillStyle = T.tinta;
    ls.forEach((l, i) => this.ctx.fillText(l, PDF_M + wEt, this.y + 23 + i * alto));
    this.y += alto * ls.length + 4;
  }
  /* cols: [{t, f (fracción del ancho), ali}] · filas: [[celda...]] con celda = texto o {t, sub} */
  tabla(cols, filas, { pie = null, px = 21 } = {}) {
    const W = this.ancho, ctx = this.ctx, pad = 10;
    const xs = []; let acc = PDF_M; cols.forEach(c => { xs.push(acc); acc += W * c.f; });
    const anchoCol = i => W * cols[i].f - 2 * pad;
    const cabecera = () => {
      this.cabe(70);
      ctx.fillStyle = T.fondo; ctx.fillRect(PDF_M, this.y, W, px + 22);
      cols.forEach((c, i) => { this.fuente(px, true); ctx.fillStyle = T.tinta; this.celdaTxt(c.t, i, xs, anchoCol(i), c.ali, this.y + px + 8, pad, 1); });
      this.y += px + 22;
    };
    const medirFila = fila => Math.max(...fila.map((c, i) => {
      const t = typeof c === 'object' ? c.t : c;
      this.fuente(px, !!(typeof c === 'object' && c.neg) || cols[i].neg);
      let n = this.lineas(t, anchoCol(i)).length * Math.round(px * 1.35);
      if (typeof c === 'object' && c.sub) { this.fuente(px - 4, false); n += this.lineas(c.sub, anchoCol(i)).length * Math.round((px - 4) * 1.35); }
      return n;
    })) + 18;
    const dibujarFila = (fila, h, linea) => {
      fila.forEach((c, i) => {
        const t = typeof c === 'object' ? c.t : c;
        const neg = !!(typeof c === 'object' && c.neg) || !!cols[i].neg;
        this.fuente(px, neg); ctx.fillStyle = T.tinta;
        const usado = this.celdaTxt(t, i, xs, anchoCol(i), cols[i].ali, this.y + px + 8, pad, 0, neg);
        if (typeof c === 'object' && c.sub) { this.fuente(px - 4, false); ctx.fillStyle = T.gris; this.celdaTxt(c.sub, i, xs, anchoCol(i), cols[i].ali, this.y + px + 8 + usado, pad, 0); }
      });
      ctx.fillStyle = linea; ctx.fillRect(PDF_M, this.y + h - 1, W, linea === T.marca ? 3 : 1);
      this.y += h;
    };
    cabecera();
    for (const fila of filas) {
      const h = medirFila(fila);
      if (this.y + h > PDF_H - PDF_M - 20) { this.nueva(); cabecera(); }
      dibujarFila(fila, h, T.linea);
    }
    if (pie) {
      const h = medirFila(pie);
      if (this.y + h > PDF_H - PDF_M - 20) { this.nueva(); cabecera(); }
      this.ctx.fillStyle = T.marca; this.ctx.fillRect(PDF_M, this.y, W, 3);
      dibujarFila(pie.map(c => (typeof c === 'object' ? Object.assign({}, c, { neg: true }) : { t: c, neg: true })), h, T.linea);
    }
    this.y += 10;
  }
  /* Dibuja el texto de una celda; devuelve el alto usado. */
  celdaTxt(texto, i, xs, w, ali, yBase, pad, _x, neg) {
    const alto = Math.round(parseInt(this.ctx.font.match(/(\d+)px/)[1], 10) * 1.35);
    const ls = this.lineas(texto, w);
    ls.forEach((l, k) => {
      const xx = ali === 'right' ? xs[i] + pad + w - this.medir(l) : xs[i] + pad;
      this.ctx.fillText(l, xx, yBase + k * alto);
    });
    return ls.length * alto;
  }
  imagen(img, x, y, w, h) { this.ctx.drawImage(img, x, y, w, h); }
}

function cargarURL(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('imagen')); i.src = src; });
}

/* ---------- Arma las páginas del reporte ---------- */

async function dibujarReporte(p, avanzar) {
  const o = opcionesReporte(p), c = datosContratista();
  if (document.fonts && document.fonts.load) { try { await Promise.all([document.fonts.load('400 20px Lato'), document.fonts.load('700 20px Lato')]); } catch (e) { /* usa la fuente de respaldo */ } }
  const [todos, fotos, partidas, seg] = await Promise.all([dbPorProyecto('espacios', p.id), dbPorProyecto('fotos', p.id), dbPorProyecto('partidas', p.id), dbPorProyecto('seguimiento', p.id)]);
  todos.sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.creado || '').localeCompare(b.creado || ''));
  const ids = new Set(o.sel || todos.map(s => s.id));
  const espacios = todos.filter(s => ids.has(s.id));
  const nombreEsp = Object.fromEntries(todos.map(s => [s.id, s.nombre || 'Sin nombre']));
  const excluidos = todos.length - espacios.length;
  const H = new HojaPDF(), ctx = () => H.ctx;
  const ordenFotos = fotos.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  /* Encabezado */
  let xTxt = PDF_M, altoEnc = 100;
  let logo = null;
  try { logo = await cargarURL(c.logo || 'logo.png'); } catch (e) { /* sin logo */ }
  if (logo) {
    const k = Math.min(300 / logo.naturalWidth, 170 / logo.naturalHeight);
    const w = logo.naturalWidth * k, h = logo.naturalHeight * k;
    H.imagen(logo, PDF_M, H.y, w, h); xTxt = PDF_M + w + 24; altoEnc = Math.max(altoEnc, h);
  }
  H.fuente(30, true); ctx().fillStyle = T.tinta; ctx().fillText(c.empresa || '', xTxt, H.y + 36);
  H.fuente(21, false); ctx().fillStyle = T.gris; ctx().fillText([c.telefono, c.correo].filter(Boolean).join(' · '), xTxt, H.y + 70);
  H.fuente(42, true); ctx().fillStyle = T.tinta;
  const tit = 'Reporte de levantamiento'; ctx().fillText(tit, PDF_W - PDF_M - H.medir(tit), H.y + 44);
  H.fuente(23, false); ctx().fillStyle = T.gris;
  const fch = fecha(p.fecha || hoy()); ctx().fillText(fch, PDF_W - PDF_M - H.medir(fch), H.y + 80);
  H.y += altoEnc + 22; ctx().fillStyle = T.marca; ctx().fillRect(PDF_M, H.y, H.ancho, 5); H.y += 20;
  await avanzar(0.1);

  /* Datos */
  H.h2('Datos del proyecto');
  [['Proyecto', p.nombre], ['Cliente', p.cliente], ['Teléfono', p.telefono], ['Correo', p.correo], ['Dirección', p.direccion],
    ['Tipo de trabajo', etiqueta(TIPOS_TRABAJO, p.tipoTrabajo)], ['Estado', etiqueta(ESTADOS, p.estado)], ['Responsable', p.responsable]]
    .forEach(([a, b]) => H.filaDato(a, b));
  if (p.observaciones) { H.y += 8; H.h4('Observaciones generales'); H.parrafo(p.observaciones); }

  /* Espacios */
  const calc = espacios.map(s => calcularEspacio(s));
  let totSup = 0; calc.forEach(r => { if (r.superficie) totSup += redondear2(r.superficie); });
  if (espacios.length) {
    H.h2('Espacios');
    H.tabla([{ t: 'Espacio', f: .22, neg: true }, { t: 'Medidas', f: .24 }, { t: 'Superficie', f: .14, ali: 'right' }, { t: 'Perímetro', f: .13, ali: 'right' }, { t: 'Muros', f: .14, ali: 'right' }, { t: 'Estado', f: .13 }],
      espacios.map((s, i) => [s.nombre || 'Sin nombre', medidasTexto(s), calc[i].superficie != null ? num(calc[i].superficie) + ' m²' : '—',
        calc[i].perimetro != null ? num(calc[i].perimetro) + ' m' : '—', calc[i].muros != null ? num(calc[i].muros) + ' m²' : '—', etiqueta(ESTADOS_ESPACIO, s.estadoActual)]),
      { pie: ['Superficie total', '', num(totSup) + ' m²', '', '', ''] });
  }
  await avanzar(0.2);

  /* Fotos (con las medidas dibujadas) en dos columnas */
  const fotosDe = async (lista) => {
    const colW = (H.ancho - 24) / 2;
    for (let i = 0; i < lista.length; i += 2) {
      const fila = [];
      for (const f of lista.slice(i, i + 2)) {
        let img;
        try { img = await cargarImagen(o.medidas && f.anotaciones && f.anotaciones.length ? await renderizarFoto(f) : f.imagen); } catch (e) { continue; }
        const w = colW, h = Math.min(w * img.naturalHeight / img.naturalWidth, 620);
        const ww = h < w * img.naturalHeight / img.naturalWidth ? h * img.naturalWidth / img.naturalHeight : w;
        const cat = etiqueta(CATEGORIAS_FOTO, f.categoria);
        H.fuente(19, false);
        fila.push({ img, w: ww, h, cap: cat + (f.descripcion ? ' · ' + f.descripcion : ''), capL: H.lineas(cat + (f.descripcion ? ' · ' + f.descripcion : ''), colW) });
      }
      if (!fila.length) continue;
      const alto = Math.max(...fila.map(f => f.h + 8 + f.capL.length * 26)) + 14;
      H.cabe(alto);
      fila.forEach((f, k) => {
        const x = PDF_M + k * (colW + 24);
        H.imagen(f.img, x, H.y, f.w, f.h);
        ctx().strokeStyle = '#cfc5b6'; ctx().lineWidth = 1.5; ctx().strokeRect(x, H.y, f.w, f.h);
        H.fuente(19, false); ctx().fillStyle = T.gris;
        f.capL.forEach((l, j) => ctx().fillText(l, x, H.y + f.h + 24 + j * 26));
      });
      H.y += alto;
    }
  };

  const hayDetalle = espacios.some(s => s.trabajos || s.observaciones) || o.fotos;
  if (espacios.length && hayDetalle) {
    H.h2('Detalle por espacio');
    let n = 0;
    for (const s of espacios) {
      H.cabe(150);
      H.fuente(29, true); ctx().fillStyle = T.tinta; ctx().fillText(s.nombre || 'Sin nombre', PDF_M, H.y + 29);
      if (s.tipo && s.tipo !== s.nombre) { const w0 = H.medir(s.nombre || 'Sin nombre'); H.fuente(21, false); ctx().fillStyle = T.gris; ctx().fillText(s.tipo, PDF_M + w0 + 14, H.y + 29); }
      H.y += 42;
      H.parrafo(medidasTexto(s) + ' · ' + etiqueta(ESTADOS_ESPACIO, s.estadoActual), { px: 21, color: T.gris });
      if (s.trabajos) { H.h4('Trabajos recomendados'); H.parrafo(s.trabajos); }
      if (s.observaciones) { H.h4('Observaciones'); H.parrafo(s.observaciones); }
      if (o.fotos) await fotosDe(ordenFotos.filter(f => f.espacioId === s.id));
      ctx().fillStyle = T.linea; ctx().fillRect(PDF_M, H.y + 4, H.ancho, 2); H.y += 24;
      await avanzar(0.2 + 0.4 * (++n / espacios.length));
    }
  }
  const gen = o.fotosGenerales && o.fotos ? ordenFotos.filter(f => !f.bitacoraId && (!f.espacioId || !nombreEsp[f.espacioId])) : [];
  if (gen.length) { H.cabe(300); H.fuente(29, true); ctx().fillStyle = T.tinta; ctx().fillText('Fotos generales', PDF_M, H.y + 29); H.y += 46; await fotosDe(gen); }

  /* Conceptos y presupuesto */
  const incl = partidas.filter(x => !x.espacioId || ids.has(x.espacioId) || !nombreEsp[x.espacioId]).sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
  const pr = Object.assign({ indirectos: 0, utilidad: 0, aplicarIva: false, iva: 16, notas: '', vigencia: '', condiciones: '' }, p.presupuesto || {});
  if (o.conceptos && incl.length) {
    let mat = 0, mo = 0, sub = 0, hayEst = false;
    const filas = incl.map(pt => {
      const r = calcularPartida(pt); mat += r.material; mo += r.manoObra; sub += r.subtotal;
      const est = pt.tipoCantidad === 'estimada'; if (est) hayEst = true;
      return [{ t: pt.descripcion || 'Sin nombre', neg: true, sub: [pt.espacioId ? nombreEsp[pt.espacioId] : '', pt.categoria].filter(Boolean).join(' · ') },
        pt.cantidad == null ? '—' : num(pt.cantidad) + ' ' + unidadTxt(pt.unidad) + (est ? ' *' : ''), formatoPesos(r.material), formatoPesos(r.manoObra), formatoPesos(r.subtotal)];
    });
    H.h2('Conceptos de obra');
    H.tabla([{ t: 'Concepto', f: .36 }, { t: 'Cantidad', f: .16 }, { t: 'Material', f: .16, ali: 'right' }, { t: 'Mano de obra', f: .16, ali: 'right' }, { t: 'Subtotal', f: .16, ali: 'right' }],
      filas, { pie: ['Costo directo', '', formatoPesos(mat), formatoPesos(mo), formatoPesos(sub)] });
    if (hayEst) H.parrafo('* Cantidad estimada, pendiente de confirmar en obra.', { px: 19, color: T.gris });
  }
  await avanzar(0.75);
  if (o.presupuesto && incl.length) {
    const t = calcularPresupuesto(incl, { indirectos: pr.indirectos || 0, utilidad: pr.utilidad || 0, aplicarIva: pr.aplicarIva, iva: pr.iva || 0 });
    H.cabe(560); H.h2('Presupuesto estimado');
    if (excluidos) H.parrafo('Incluye solo los espacios de este reporte: ' + (espacios.map(s => s.nombre || 'Sin nombre').join(', ') || 'ninguno') + '.', { px: 19, color: T.gris });
    const filas = [['Materiales', formatoPesos(t.material)], ['Mano de obra', formatoPesos(t.manoObra)], ['Costo directo', formatoPesos(t.directo)]];
    if (pr.indirectos) filas.push([`Indirectos (${pct(pr.indirectos)} %)`, formatoPesos(t.indirectos)]);
    if (pr.utilidad) filas.push([`Utilidad (${pct(pr.utilidad)} %)`, formatoPesos(t.utilidad)]);
    filas.push(['Subtotal', formatoPesos(t.subtotal)]);
    if (pr.aplicarIva) filas.push([`IVA (${pct(pr.iva)} %)`, formatoPesos(t.iva)]);
    const xr = PDF_M + H.ancho * .48, wr = H.ancho * .52;
    H.cabe(filas.length * 46 + 70);
    filas.forEach(([a, b]) => {
      H.fuente(22, false); ctx().fillStyle = T.tinta; ctx().fillText(a, xr, H.y + 30);
      ctx().fillText(b, xr + wr - H.medir(b), H.y + 30);
      ctx().fillStyle = T.linea; ctx().fillRect(xr, H.y + 42, wr, 1.5); H.y += 46;
    });
    ctx().fillStyle = T.fondo; ctx().fillRect(xr, H.y, wr, 58);
    ctx().fillStyle = T.marca; ctx().fillRect(xr, H.y, wr, 3);
    const lt = pr.aplicarIva ? 'Total (MXN)' : 'Total sin IVA (MXN)', vt = formatoPesos(t.total);
    H.fuente(26, true); ctx().fillStyle = T.tinta; ctx().fillText(lt, xr + 10, H.y + 39); ctx().fillText(vt, xr + wr - 10 - H.medir(vt), H.y + 39);
    H.y += 78;
    if (pr.vigencia) H.parrafo('Vigencia: ' + pr.vigencia, { px: 22 });
    if (pr.notas) H.parrafo('Notas: ' + pr.notas, { px: 22 });
    if (pr.condiciones) H.parrafo('Condiciones: ' + pr.condiciones, { px: 22 });
  }
  /* Estado de pagos (solo pagos; nunca gastos ni utilidad) */
  const pagosL = seg.filter(m => m.tipo === 'pago').sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  if (o.pagos && pagosL.length) {
    const cobrado = pagosL.reduce((a, m) => a + (m.monto || 0), 0);
    const tp = excluidos === 0 ? await totalPresupuestoProyecto(p) : { total: null };
    H.cabe(420); H.h2('Estado de pagos');
    H.tabla([{ t: 'Fecha', f: .17 }, { t: 'Concepto', f: .35 }, { t: 'Forma de pago', f: .25 }, { t: 'Monto', f: .23, ali: 'right' }],
      pagosL.map(m => [fecha(m.fecha), { t: etiqueta(CONCEPTOS_PAGO, m.concepto), sub: m.nota || '' }, etiqueta(METODOS_PAGO, m.metodo), formatoPesos(m.monto)]),
      { pie: ['Total cobrado', '', '', formatoPesos(cobrado)] });
    if (tp.total != null) {
      const filas = [['Presupuesto total' + (tp.conIva ? ' (con IVA)' : ' (sin IVA)'), formatoPesos(tp.total)], ['Cobrado', formatoPesos(cobrado)], [tp.total - cobrado < 0 ? 'Saldo a favor del cliente' : 'Saldo por pagar', formatoPesos(Math.abs(tp.total - cobrado))]];
      const xr = PDF_M + H.ancho * .38, wr = H.ancho * .62;
      H.cabe(filas.length * 46 + 20);
      filas.forEach(([a, b], i) => {
        H.fuente(22, i === 2); ctx().fillStyle = T.tinta; ctx().fillText(a, xr, H.y + 30); ctx().fillText(b, xr + wr - H.medir(b), H.y + 30);
        ctx().fillStyle = T.linea; ctx().fillRect(xr, H.y + 42, wr, 1.5); H.y += 46;
      });
    }
  }
  H.y += 14;
  H.parrafo(AVISO_MEDIDAS + ' La superficie de muros es bruta: no descuenta puertas ni ventanas.', { px: 19, color: T.gris });
  await avanzar(0.85);

  /* Firmas */
  if (o.firmas) {
    const f = p.firmaCliente;
    H.cabe(300); H.y += 30;
    const colW = (H.ancho - 100) / 2;
    const bloques = [
      { img: c.firma, nom: p.responsable || c.empresa || 'Responsable', sub: c.empresa && p.responsable ? c.empresa : '' },
      { img: f && f.img, nom: (f && f.nombre) || p.cliente || 'Cliente', sub: f && f.img ? 'Firmó el ' + fecha(f.fecha) : 'Cliente' }
    ];
    for (let k = 0; k < 2; k++) {
      const x = PDF_M + k * (colW + 100), b = bloques[k];
      if (b.img) { try { const im = await cargarURL(b.img); const s = Math.min(colW / im.naturalWidth, 130 / im.naturalHeight); H.imagen(im, x + (colW - im.naturalWidth * s) / 2, H.y + 130 - im.naturalHeight * s, im.naturalWidth * s, im.naturalHeight * s); } catch (e) { /* sin firma */ } }
      ctx().fillStyle = T.tinta; ctx().fillRect(x, H.y + 140, colW, 3);
      H.fuente(23, true); ctx().fillText(b.nom, x + (colW - H.medir(b.nom)) / 2, H.y + 178);
      if (b.sub) { H.fuente(20, false); ctx().fillStyle = T.gris; ctx().fillText(b.sub, x + (colW - H.medir(b.sub)) / 2, H.y + 208); }
    }
    H.y += 230;
  }

  /* Pie de página con numeración */
  H.paginas.forEach((cv, i) => {
    const x = cv.getContext('2d'); x.font = '400 18px Lato, Arial, sans-serif'; x.fillStyle = '#8a8176';
    const t = `${p.nombre} · Página ${i + 1} de ${H.paginas.length}`;
    x.fillText(t, (PDF_W - x.measureText(t).width) / 2, PDF_H - 50);
  });
  return H.paginas;
}

/* ---------- Escritor de PDF (una imagen JPEG por página) ---------- */

async function armarPDF(canvases, titulo) {
  const enc = new TextEncoder(), partes = [], offs = [];
  let pos = 0;
  const add = d => { const u = typeof d === 'string' ? enc.encode(d) : d; partes.push(u); pos += u.length; };
  const obj = (n, cuerpo) => { offs[n] = pos; add(`${n} 0 obj\n`); add(cuerpo); add('\nendobj\n'); };
  const n = canvases.length;
  add('%PDF-1.4\n%âãÏÓ\n');
  const hex = Array.from(titulo).map(ch => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => `${4 + i * 3} 0 R`).join(' ')}] >>`);
  obj(3, `<< /Title <FEFF${hex}> /Producer (ObraPro) /Creator (ObraPro) >>`);
  for (let i = 0; i < n; i++) {
    const blob = await new Promise(r => canvases[i].toBlob(r, 'image/jpeg', 0.88));
    const jpg = new Uint8Array(await blob.arrayBuffer());
    const base = 4 + i * 3, flujo = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
    obj(base, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${base + 2} 0 R >> >> /Contents ${base + 1} 0 R >>`);
    obj(base + 1, `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
    offs[base + 2] = pos;
    add(`${base + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvases[i].width} /Height ${canvases[i].height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    add(jpg); add('\nendstream\nendobj\n');
    canvases[i].width = 1; canvases[i].height = 1;       /* libera memoria */
  }
  const total = 4 + n * 3, xref = pos;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  add(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(partes, { type: 'application/pdf' });
}

/* Genera el PDF del proyecto y devuelve un File listo para descargar o compartir. */
async function generarPDF(p, avanzar = async () => {}) {
  const paginas = await dibujarReporte(p, avanzar);
  const blob = await armarPDF(paginas, `Reporte - ${p.nombre}`);
  const nombre = `Reporte - ${p.nombre} - ${hoy()}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
  return new File([blob], nombre, { type: 'application/pdf' });
}
