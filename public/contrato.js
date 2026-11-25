/* ObraPro - contrato.js (Etapa 16)
   Pestaña "Contrato": dos documentos distintos que no se mezclan con los avances de la pestaña "Obra".
   1) Contrato con el cliente: alcance, importes, anticipo, plazo, garantía y firmas. Sin costos ni utilidad.
   2) Orden de trabajo para quien hace la obra: qué hacer, cantidades, croquis, materiales y lo que se le paga a él.
      Nunca lleva el precio de venta al cliente ni tu utilidad.
   Los datos viven en p.contrato = { cliente:{...}, trabajador:{...} } y entran en la copia de seguridad. */
'use strict';

const ESQUEMAS_PAGO_TRAB = [['total', 'Precio total pactado'], ['destajo', 'Por destajo (precio por unidad)'], ['jornal', 'Por día (jornal)']];
const QUIEN_MATERIALES = [['contratista', 'Los pone el contratista (tú)'], ['trabajador', 'Los pone el trabajador']];

function datosContrato(p) {
  const c = p.contrato = p.contrato || {};
  /* completa lo que falte SOBRE el mismo objeto, para que la pantalla y el PDF compartan los datos */
  const completa = (clave, base) => { const o = c[clave] = c[clave] || {}; for (const k of Object.keys(base)) if (o[k] === undefined) o[k] = base[k]; return o; };
  completa('cliente', { numero: '', inicio: '', plazo: '', anticipo: 50, alcance: '', formaPago: '', garantia: '', notas: '' });
  const tr = completa('trabajador', { nombre: '', telefono: '', esquema: 'total', monto: null, inicio: '', fin: '', materiales: 'contratista',
    conCroquis: true, conMateriales: true, indicaciones: '' });
  if (!ESQUEMAS_PAGO_TRAB.some(x => x[0] === tr.esquema)) tr.esquema = 'total';
  if (!QUIEN_MATERIALES.some(x => x[0] === tr.materiales)) tr.materiales = 'contratista';
  return c;
}

/* Importes por concepto para el cliente: el costo directo ya con indirectos y utilidad repartidos,
   para no enseñar cuánto es costo y cuánto utilidad. La suma coincide exacta con el subtotal. */
function importesCliente(partidas, pr) {
  const t = calcularPresupuesto(partidas, { indirectos: pr.indirectos || 0, utilidad: pr.utilidad || 0, aplicarIva: pr.aplicarIva, iva: pr.iva || 0 });
  const subs = partidas.map(pt => calcularPartida(pt).subtotal);
  let imp = subs.map(s => t.directo > 0 ? Math.round(s * t.subtotal / t.directo) : 0);
  if (imp.length && t.directo > 0) imp[imp.length - 1] += t.subtotal - imp.reduce((a, b) => a + b, 0);
  return { t, imp };
}

function pieYNombre(H, p, titulo) {
  H.paginas.forEach((cv, i) => {
    const x = cv.getContext('2d'); x.font = '400 18px Lato, Arial, sans-serif'; x.fillStyle = '#8a8176';
    const tx = `${p.nombre} · Página ${i + 1} de ${H.paginas.length}`; x.fillText(tx, (PDF_W - x.measureText(tx).width) / 2, PDF_H - 50);
  });
  return `${titulo} - ${p.nombre} - ${hoy()}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
}

async function bloqueFirmas(H, izq, der) {
  H.cabe(300); H.y += 30;
  const colW = (H.ancho - 100) / 2;
  for (let k = 0; k < 2; k++) {
    const x = PDF_M + k * (colW + 100), b = k ? der : izq;
    if (b.img) { try { const im = await cargarURL(b.img); const s = Math.min(colW / im.naturalWidth, 130 / im.naturalHeight); H.imagen(im, x + (colW - im.naturalWidth * s) / 2, H.y + 130 - im.naturalHeight * s, im.naturalWidth * s, im.naturalHeight * s); } catch (e) { /* sin firma */ } }
    H.ctx.fillStyle = T.tinta; H.ctx.fillRect(x, H.y + 140, colW, 3);
    H.fuente(23, true); H.ctx.fillText(b.nom, x + (colW - H.medir(b.nom)) / 2, H.y + 178);
    if (b.sub) { H.fuente(20, false); H.ctx.fillStyle = T.gris; H.ctx.fillText(b.sub, x + (colW - H.medir(b.sub)) / 2, H.y + 208); }
  }
  H.y += 230;
}

async function cargarFuentesPDF() {
  if (document.fonts && document.fonts.load) { try { await Promise.all([document.fonts.load('400 20px Lato'), document.fonts.load('700 20px Lato')]); } catch (e) { /* respaldo */ } }
}

/* ---------- 1) PDF del contrato con el cliente ---------- */

async function generarPDFContrato(p) {
  const ct = datosContrato(p).cliente, c = datosContratista();
  await cargarFuentesPDF();
  const [partidas, espacios] = await Promise.all([dbPorProyecto('partidas', p.id), dbPorProyecto('espacios', p.id)]);
  partidas.sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
  espacios.sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.creado || '').localeCompare(b.creado || ''));
  const nombreEsp = Object.fromEntries(espacios.map(s => [s.id, s.nombre || 'Sin nombre']));
  const pr = Object.assign({ indirectos: 0, utilidad: 0, aplicarIva: false, iva: 16, notas: '', vigencia: '', condiciones: '' }, p.presupuesto || {});
  const H = new HojaPDF();
  await dibujarEncabezado(H, c, 'Contrato de obra', fecha(hoy()));
  H.h2('Datos del contrato');
  H.filaDato('Contrato No.', ct.numero); H.filaDato('Cliente', p.cliente); H.filaDato('Teléfono', p.telefono); H.filaDato('Dirección de la obra', p.direccion);
  H.filaDato('Proyecto', p.nombre); H.filaDato('Contratista', c.empresa || p.responsable);
  H.filaDato('Inicio', ct.inicio ? fecha(ct.inicio) : ''); H.filaDato('Plazo', ct.plazo ? ct.plazo + ' días' : '');

  H.h2('Alcance de los trabajos');
  if (ct.alcance) H.parrafo(ct.alcance);
  else if (espacios.length) H.parrafo('Trabajos en: ' + espacios.map(s => s.nombre || 'Sin nombre').join(', ') + '. Ver el detalle de conceptos.');
  else H.parrafo('Por definir.', { color: T.gris });

  if (partidas.length) {
    const { t, imp } = importesCliente(partidas, pr);
    H.h2('Conceptos');
    H.tabla([{ t: 'Concepto', f: .54 }, { t: 'Cantidad', f: .2 }, { t: 'Importe', f: .26, ali: 'right' }],
      partidas.map((pt, i) => [{ t: pt.descripcion || 'Sin nombre', neg: true, sub: pt.espacioId ? nombreEsp[pt.espacioId] || '' : '' },
        pt.cantidad == null ? '—' : num(pt.cantidad) + ' ' + unidadTxt(pt.unidad), formatoPesos(imp[i])]),
      { pie: ['Subtotal', '', formatoPesos(t.subtotal)] });
    const filas = [['Subtotal', formatoPesos(t.subtotal)]];
    if (pr.aplicarIva) filas.push([`IVA (${pct(pr.iva)} %)`, formatoPesos(t.iva)]);
    const ant = Math.max(0, Math.min(100, Number(ct.anticipo) || 0)), mAnt = Math.round(t.total * ant / 100);
    const xr = PDF_M + H.ancho * .42, wr = H.ancho * .58;
    H.cabe(filas.length * 46 + 260);
    filas.forEach(([a, b]) => { H.fuente(22, false); H.ctx.fillStyle = T.tinta; H.ctx.fillText(a, xr, H.y + 30); H.ctx.fillText(b, xr + wr - H.medir(b), H.y + 30); H.ctx.fillStyle = T.linea; H.ctx.fillRect(xr, H.y + 42, wr, 1.5); H.y += 46; });
    H.ctx.fillStyle = T.fondo; H.ctx.fillRect(xr, H.y, wr, 58); H.ctx.fillStyle = T.marca; H.ctx.fillRect(xr, H.y, wr, 3);
    const lt = pr.aplicarIva ? 'Total (MXN)' : 'Total sin IVA (MXN)', vt = formatoPesos(t.total);
    H.fuente(26, true); H.ctx.fillStyle = T.tinta; H.ctx.fillText(lt, xr + 10, H.y + 39); H.ctx.fillText(vt, xr + wr - 10 - H.medir(vt), H.y + 39); H.y += 78;
    if (ant > 0 && ant < 100) {
      for (const [a, b] of [[`Anticipo (${pct(ant)} %)`, formatoPesos(mAnt)], ['Resto contra avance / entrega', formatoPesos(t.total - mAnt)]]) {
        H.fuente(22, false); H.ctx.fillStyle = T.tinta; H.ctx.fillText(a, xr, H.y + 30); H.ctx.fillText(b, xr + wr - H.medir(b), H.y + 30); H.ctx.fillStyle = T.linea; H.ctx.fillRect(xr, H.y + 42, wr, 1.5); H.y += 46;
      }
    }
    if (partidas.some(x => x.tipoCantidad === 'estimada')) H.parrafo('Algunas cantidades son estimadas y se confirman en obra; el importe puede ajustarse.', { px: 19, color: T.gris });
  }
  if (ct.formaPago) { H.h4('Forma de pago'); H.parrafo(ct.formaPago); }
  if (ct.garantia) { H.h4('Garantía'); H.parrafo(ct.garantia); }
  if (pr.vigencia) { H.h4('Vigencia'); H.parrafo(pr.vigencia); }
  if (pr.condiciones) { H.h4('Condiciones'); H.parrafo(pr.condiciones); }
  if (ct.notas) { H.h4('Notas'); H.parrafo(ct.notas); }
  H.y += 10;
  H.parrafo('Documento comercial entre las partes. No sustituye asesoría legal.', { px: 19, color: T.gris });
  const f = p.firmaCliente;
  await bloqueFirmas(H, { img: c.firma, nom: p.responsable || c.empresa || 'Contratista', sub: c.empresa && p.responsable ? c.empresa : 'Contratista' },
    { img: f && f.img, nom: (f && f.nombre) || p.cliente || 'Cliente', sub: f && f.img ? 'Firmó el ' + fecha(f.fecha) : 'Cliente' });
  const nombre = pieYNombre(H, p, 'Contrato');
  return new File([await armarPDF(H.paginas, `Contrato - ${p.nombre}`)], nombre, { type: 'application/pdf' });
}

/* ---------- 2) PDF de la orden de trabajo (para quien hace la obra) ---------- */

async function generarPDFOrden(p) {
  const tr = datosContrato(p).trabajador, ct = datosContrato(p).cliente, c = datosContratista();
  await cargarFuentesPDF();
  const [partidas, espacios] = await Promise.all([dbPorProyecto('partidas', p.id), dbPorProyecto('espacios', p.id)]);
  partidas.sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
  espacios.sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.creado || '').localeCompare(b.creado || ''));
  const nombreEsp = Object.fromEntries(espacios.map(s => [s.id, s.nombre || 'Sin nombre']));
  const H = new HojaPDF();
  await dibujarEncabezado(H, c, 'Orden de trabajo', fecha(hoy()));
  H.h2('Datos de la obra');
  H.filaDato('Proyecto', p.nombre); H.filaDato('Dirección', p.direccion); H.filaDato('Responsable', p.responsable || c.empresa);
  H.filaDato('Teléfono del responsable', c.telefono);
  H.filaDato('Trabajador', tr.nombre); H.filaDato('Teléfono', tr.telefono);
  H.filaDato('Inicio', tr.inicio ? fecha(tr.inicio) : ''); H.filaDato('Terminar el', tr.fin ? fecha(tr.fin) : '');

  H.h2('Pago acordado');
  H.filaDato('Esquema', etiqueta(ESQUEMAS_PAGO_TRAB, tr.esquema));
  H.filaDato(tr.esquema === 'destajo' ? 'Precio por unidad' : tr.esquema === 'jornal' ? 'Pago por día' : 'Monto', tr.monto > 0 ? formatoPesos(tr.monto) : 'Por acordar');
  H.filaDato('Materiales', etiqueta(QUIEN_MATERIALES, tr.materiales).replace('(tú)', ''));
  H.parrafo('El pago final se hace al revisar y aceptar el trabajo terminado.', { px: 20, color: T.gris });

  if (tr.indicaciones) { H.h2('Indicaciones'); H.parrafo(tr.indicaciones); }

  /* Qué hacer: conceptos por espacio, sin precios */
  if (partidas.length) {
    const mapa = new Map();
    for (const pt of partidas) { const k = pt.espacioId && nombreEsp[pt.espacioId] ? nombreEsp[pt.espacioId] : 'General'; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(pt); }
    H.h2('Trabajos a realizar');
    for (const [esp, lista] of mapa) {
      H.cabe(200);
      H.tabla([{ t: esp, f: .7, neg: true }, { t: 'Cantidad', f: .3 }],
        lista.map(pt => [{ t: pt.descripcion || 'Sin nombre', sub: pt.tipoCantidad === 'estimada' ? 'cantidad estimada, confirmar en obra' : '' },
          pt.cantidad == null ? '—' : num(pt.cantidad) + ' ' + unidadTxt(pt.unidad)]));
    }
  } else { H.h2('Trabajos a realizar'); H.parrafo('Aún no hay conceptos capturados.', { color: T.gris }); }

  const notasEsp = espacios.filter(s => s.trabajos || s.observaciones);
  if (notasEsp.length) {
    H.h2('Notas por espacio');
    for (const s of notasEsp) { H.cabe(110); H.h4(s.nombre || 'Sin nombre'); if (s.trabajos) H.parrafo(s.trabajos); if (s.observaciones) H.parrafo('Obs.: ' + s.observaciones, { color: T.gris }); }
  }

  if (tr.conCroquis) { const d = datosCroquis(p, espacios); if (d.cajas.length) croquisEnPDF(H, d); }

  if (tr.conMateriales && partidas.length) {
    const L = listasObra(partidas);
    if (L.materiales.length) {
      H.h2('Materiales (' + (tr.materiales === 'trabajador' ? 'los pone el trabajador' : 'los pone el contratista') + ')');
      H.tabla([{ t: 'Material', f: .62, neg: true }, { t: 'A comprar', f: .38 }],
        L.materiales.map(f => [{ t: f.descripcion, sub: f.desperdicio > 0 ? `incluye ${String(+f.desperdicio.toFixed(2))} % de desperdicio` : '' },
          f.sinCantidad ? '—' : num((f.unidad === 'pza' || f.unidad === 'salida') ? Math.ceil(f.comprar - 1e-9) : f.comprar) + ' ' + unidadTxt(f.unidad)]));
    }
  }
  H.y += 10;
  H.parrafo('Las cantidades salen de las medidas del levantamiento. Verifica en obra y avisa de cualquier diferencia antes de seguir.', { px: 19, color: T.gris });
  await bloqueFirmas(H, { img: c.firma, nom: p.responsable || c.empresa || 'Contratista', sub: 'Contratista' },
    { img: null, nom: tr.nombre || 'Trabajador', sub: 'Recibí la orden de trabajo' });
  const nombre = pieYNombre(H, p, 'Orden de trabajo');
  return new File([await armarPDF(H.paginas, `Orden de trabajo - ${p.nombre}`)], nombre, { type: 'application/pdf' });
}

/* ---------- Pestaña "Contrato" ---------- */

async function pestanaContrato(p) {
  const cuerpo = $('#tab-body'); if (!cuerpo) return;
  const d = datosContrato(p), ct = d.cliente, tr = d.trabajador;
  const [partidas, tp] = await Promise.all([dbPorProyecto('partidas', p.id), totalPresupuestoProyecto(p)]);
  const L = listasObra(partidas);
  const campo = (g, k, t, tipo = 'text', extra = '') => `<label class="field"><span>${t}</span>${tipo === 'textarea'
    ? `<textarea data-g="${g}" data-k="${k}" rows="3">${esc((g === 'c' ? ct : tr)[k] || '')}</textarea>`
    : `<input data-g="${g}" data-k="${k}" type="${tipo}" ${extra} value="${esc((g === 'c' ? ct : tr)[k] == null ? '' : (g === 'c' ? ct : tr)[k])}">`}</label>`;
  const montoTxt = tr.monto > 0 ? (tr.monto / 100).toFixed(2) : '';
  cuerpo.innerHTML = `
    <div class="row-between"><h2>Contrato y orden de trabajo</h2><span id="save-status" class="save-status">Los cambios se guardan solos</span></div>
    <p class="muted small">Aquí van los documentos de acuerdo. Los avances con fotos, pagos y gastos siguen aparte en la pestaña <a href="#/proyecto/${p.id}/obra">Obra</a>.</p>

    <section class="card" id="ct-cliente">
      <h3>Contrato con el cliente</h3>
      <p class="muted small">Lleva los conceptos con su importe y el total${tp.total != null ? ' (' + formatoPesos(tp.total) + (tp.conIva ? ' con IVA' : ' sin IVA') + ')' : ''}. No muestra tus costos ni tu utilidad.</p>
      <div class="grid2">
        ${campo('c', 'numero', 'Número de contrato')}
        ${campo('c', 'plazo', 'Plazo (días)', 'number', 'min="0" inputmode="numeric"')}
        ${campo('c', 'inicio', 'Fecha de inicio', 'date')}
        ${campo('c', 'anticipo', 'Anticipo (%)', 'number', 'min="0" max="100" inputmode="decimal"')}
      </div>
      ${campo('c', 'alcance', 'Alcance de los trabajos (si lo dejas vacío se usa la lista de espacios)', 'textarea')}
      ${campo('c', 'formaPago', 'Forma de pago', 'textarea')}
      ${campo('c', 'garantia', 'Garantía', 'textarea')}
      ${campo('c', 'notas', 'Notas', 'textarea')}
      <div class="actions"><button class="btn primary" id="ct-pdf">PDF del contrato (cliente)</button></div>
      ${!partidas.length ? '<p class="small muted">Aún no hay conceptos: el contrato saldrá sin tabla de importes.</p>' : ''}
    </section>

    <section class="card" id="ct-trab">
      <h3>Orden de trabajo (quien hace la obra)</h3>
      <p class="muted small">Lleva qué hacer, cantidades, croquis y materiales. <strong>No lleva el precio al cliente ni tu utilidad</strong>; solo lo que se le paga a él.</p>
      <div class="grid2">
        ${campo('t', 'nombre', 'Nombre del trabajador o cuadrilla')}
        ${campo('t', 'telefono', 'Teléfono', 'tel')}
        ${campo('t', 'inicio', 'Inicio', 'date')}
        ${campo('t', 'fin', 'Terminar el', 'date')}
        <label class="field"><span>Esquema de pago</span><select data-g="t" data-k="esquema">${ESQUEMAS_PAGO_TRAB.map(([k, t]) => `<option value="${k}"${k === tr.esquema ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>Monto que se le paga ($)</span><input id="ct-monto" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${montoTxt}"><small class="muted" id="ct-monto-err" role="alert"></small></label>
        <label class="field"><span>Materiales</span><select data-g="t" data-k="materiales">${QUIEN_MATERIALES.map(([k, t]) => `<option value="${k}"${k === tr.materiales ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      ${campo('t', 'indicaciones', 'Indicaciones para el trabajador', 'textarea')}
      <label class="check"><input type="checkbox" data-g="t" data-k="conCroquis"${tr.conCroquis ? ' checked' : ''}> Incluir el croquis</label>
      <label class="check"><input type="checkbox" data-g="t" data-k="conMateriales"${tr.conMateriales ? ' checked' : ''}> Incluir lista de materiales (cantidades, sin precios)</label>
      ${L.totalManoObra > 0 ? `<p class="small muted" id="ct-ref">Solo para ti (no sale en el PDF): la mano de obra de tu presupuesto es ${formatoPesos(L.totalManoObra)}.</p>` : ''}
      <div class="actions"><button class="btn primary" id="ct-orden">PDF de la orden de trabajo</button></div>
    </section>`;

  const guardar = () => { p.actualizado = ahora(); programarGuardado(() => dbGuardar('proyectos', p)); };
  $$('#tab-body [data-g]').forEach(el => {
    const obj = el.dataset.g === 'c' ? ct : tr, k = el.dataset.k;
    const alCambiar = () => {
      if (el.type === 'checkbox') obj[k] = el.checked;
      else if (el.type === 'number') { const n = parseFloat(el.value); obj[k] = el.value === '' ? '' : (isFinite(n) && n >= 0 ? (k === 'anticipo' ? Math.min(100, n) : n) : obj[k]); }
      else obj[k] = el.value;
      guardar();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' ? 'change' : 'input', alCambiar);
  });
  const monto = $('#ct-monto'), err = $('#ct-monto-err');
  monto.addEventListener('input', () => {
    const r = leerDinero(monto.value);
    if (r.error) { err.textContent = r.error; return; }
    err.textContent = ''; tr.monto = r.vacio ? null : r.valor; guardar();
  });
  const generar = (id, fn) => $(id).addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; const t0 = b.textContent; b.textContent = 'Preparando PDF…';
    try { const a = await fn(p); descargarArchivo(a); aviso('Descargando ' + a.name + '. Búscalo en la carpeta Descargas.'); }
    catch (er) { console.error(er); aviso('No se pudo crear el PDF: ' + er.message, 'error'); }
    b.disabled = false; b.textContent = t0;
  });
  generar('#ct-pdf', async pp => { await guardarPendiente(); return generarPDFContrato(pp); });
  generar('#ct-orden', async pp => { await guardarPendiente(); return generarPDFOrden(pp); });
}
