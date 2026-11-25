/* ObraPro - avances.js (Etapa 17)
   Pestaña "Avances": cómo va la obra por ETAPAS (tablaroca, pintura…) y por SEMANAS.
   Cada etapa lleva su porcentaje; el avance general es el promedio ponderado. Al "cerrar la semana" se guarda
   una foto del avance (queda el historial). Sin dinero: se puede mandar al cliente o al trabajador.
   Datos en p.avances = { etapas:[{id,nombre,pct,peso,inicio,fin,nota}], semanas:[{id,lunes,nota,general,etapas:[{id,nombre,pct,peso}]}] } */
'use strict';

const ETAPAS_SUGERIDAS = ['Preparación y protección', 'Tablaroca', 'Impermeabilización', 'Resane y sellador', 'Pintura', 'Limpieza y entrega'];

function datosAvances(p) {
  const a = p.avances = p.avances || {};
  if (!Array.isArray(a.etapas)) a.etapas = [];
  if (!Array.isArray(a.semanas)) a.semanas = [];
  return a;
}

/* Promedio ponderado por el peso de cada etapa (peso vacío = 1). Con una decimal. */
function avanceGeneral(etapas) {
  let s = 0, w = 0;
  for (const e of etapas) { const pe = Number(e.peso) > 0 ? Number(e.peso) : 1; s += Math.max(0, Math.min(100, Number(e.pct) || 0)) * pe; w += pe; }
  return w ? Math.round(s / w * 10) / 10 : 0;
}

const estadoEtapa = pct => pct >= 100 ? 'Terminada' : pct > 0 ? 'En proceso' : 'Pendiente';

const isoFecha = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function lunesDe(iso) {
  const [y, m, d] = String(iso).split('-').map(Number), f = new Date(y, m - 1, d);
  f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
  return isoFecha(f);
}
function domingoDe(lunes) { const [y, m, d] = lunes.split('-').map(Number), f = new Date(y, m - 1, d + 6); return isoFecha(f); }
const semanaTxt = lunes => `Semana del ${fecha(lunes)} al ${fecha(domingoDe(lunes))}`;
const pctTxt = x => String(+(+x).toFixed(1)) + ' %';

/* Historial ordenado de la semana más vieja a la más nueva, con el cambio contra la anterior. */
function historialSemanas(semanas) {
  const l = semanas.slice().sort((a, b) => a.lunes.localeCompare(b.lunes));
  return l.map((s, i) => Object.assign({}, s, { cambio: i ? Math.round((s.general - l[i - 1].general) * 10) / 10 : null }));
}

const leerNum = t => parseFloat(String(t == null ? '' : t).trim().replace(',', '.'));

/* ---------- PDF ---------- */

async function generarPDFAvances(p) {
  const a = datosAvances(p), c = datosContratista();
  await cargarFuentesPDF();
  const H = new HojaPDF(), g = avanceGeneral(a.etapas);
  await dibujarEncabezado(H, c, 'Avance de obra por etapas', fecha(hoy()));
  H.h2('Proyecto');
  H.filaDato('Proyecto', p.nombre); H.filaDato('Cliente', p.cliente); H.filaDato('Dirección', p.direccion); H.filaDato('Responsable', p.responsable || c.empresa);

  H.h2('Avance general');
  H.cabe(110);
  const bw = H.ancho - 190;
  H.ctx.fillStyle = T.fondo; H.ctx.fillRect(PDF_M, H.y + 6, bw, 40);
  H.ctx.fillStyle = T.marca; H.ctx.fillRect(PDF_M, H.y + 6, bw * g / 100, 40);
  H.fuente(34, true); H.ctx.fillStyle = T.tinta; H.ctx.fillText(pctTxt(g), PDF_M + bw + 18, H.y + 42); H.y += 70;

  if (a.etapas.length) {
    H.h2('Etapas');
    H.tabla([{ t: 'Etapa', f: .4, neg: true }, { t: 'Estado', f: .2 }, { t: 'Avance', f: .15, ali: 'right' }, { t: 'Periodo', f: .25 }],
      a.etapas.map(e => [{ t: e.nombre, sub: e.nota || '' }, estadoEtapa(e.pct), pctTxt(e.pct),
        [e.inicio ? fecha(e.inicio) : '', e.fin ? fecha(e.fin) : ''].filter(Boolean).join(' → ') || '—']));
  } else H.parrafo('Aún no hay etapas capturadas.', { color: T.gris });

  const hist = historialSemanas(a.semanas).reverse();
  if (hist.length) {
    H.h2('Avance por semana');
    H.tabla([{ t: 'Semana', f: .4, neg: true }, { t: 'General', f: .15, ali: 'right' }, { t: 'Cambio', f: .16, ali: 'right' }, { t: 'Notas', f: .29 }],
      hist.map(s => [{ t: semanaTxt(s.lunes), sub: s.etapas.map(e => `${e.nombre} ${pctTxt(e.pct)}`).join(' · ') }, pctTxt(s.general),
        s.cambio == null ? '—' : (s.cambio > 0 ? '+' : '') + String(s.cambio) + ' pts', s.nota || '']));
  }
  H.y += 10;
  H.parrafo('El porcentaje es una estimación del contratista y puede ajustarse. El avance general pondera cada etapa según su peso.', { px: 19, color: T.gris });
  const nombre = pieYNombre(H, p, 'Avance por etapas');
  return new File([await armarPDF(H.paginas, `Avance por etapas - ${p.nombre}`)], nombre, { type: 'application/pdf' });
}

/* ---------- Pestaña "Avances" ---------- */

async function pestanaAvances(p) {
  const cuerpo = $('#tab-body'); if (!cuerpo) return;
  const a = datosAvances(p);
  const guardar = async () => { p.actualizado = ahora(); await dbGuardar('proyectos', p); };
  const g = avanceGeneral(a.etapas), hist = historialSemanas(a.semanas).reverse();
  const bar = pc => `<span class="barra-av" role="img" aria-label="${pctTxt(pc)}"><span style="width:${Math.max(0, Math.min(100, pc))}%"></span></span>`;

  cuerpo.innerHTML = `
    <div class="row-between"><h2>Avances de la obra</h2></div>
    <p class="muted small">Cómo va la obra por etapas y por semana. Las fotos, pagos y gastos siguen en <a href="#/proyecto/${p.id}/obra">Obra</a> y los acuerdos en <a href="#/proyecto/${p.id}/contrato">Contrato</a>.</p>

    <section class="card" id="av-general">
      <h3>Avance general</h3>
      <div class="av-grande"><strong id="av-pct">${pctTxt(g)}</strong>${bar(g)}</div>
      <div class="actions">
        <button class="btn primary" id="av-cerrar"${a.etapas.length ? '' : ' disabled'}>Cerrar semana</button>
        <button class="btn" id="av-pdf"${a.etapas.length ? '' : ' disabled'}>PDF de avance</button>
      </div>
      ${a.etapas.length ? '<p class="small muted">"Cerrar semana" guarda cómo va cada etapa hoy, para ver el historial.</p>' : ''}
    </section>

    <section class="card" id="av-etapas">
      <h3>Etapas (${a.etapas.length})</h3>
      ${a.etapas.length ? a.etapas.map(e => `
        <div class="av-etapa" data-id="${e.id}">
          <div class="av-fila"><strong>${esc(e.nombre)}</strong><span class="badge">${estadoEtapa(e.pct)}</span></div>
          <div class="av-fila">${bar(e.pct)}<span class="av-n">${pctTxt(e.pct)}</span></div>
          ${e.inicio || e.fin || e.nota ? `<small class="muted">${esc([e.inicio ? fecha(e.inicio) : '', e.fin ? fecha(e.fin) : ''].filter(Boolean).join(' → '))}${e.nota ? (e.inicio || e.fin ? ' · ' : '') + esc(e.nota) : ''}</small>` : ''}
          <div class="av-chips">${[0, 25, 50, 75, 100].map(n => `<button class="btn chip${Math.round(e.pct) === n ? ' on' : ''}" data-set="${n}">${n} %</button>`).join('')}
            <button class="btn" data-editar>Editar</button></div>
        </div>`).join('')
        : '<p class="muted">Aún no hay etapas. Agrega las tuyas o carga las sugeridas y ajústalas.</p>'}
      <div class="actions">
        <button class="btn primary" id="av-agregar">+ Agregar etapa</button>
        ${a.etapas.length ? '' : '<button class="btn" id="av-sugeridas">Cargar etapas sugeridas</button>'}
      </div>
    </section>

    <section class="card" id="av-semanas">
      <h3>Semanas (${hist.length})</h3>
      ${hist.length ? hist.map(s => `
        <button class="fila-mov av-sem" data-sem="${s.id}"><span class="fm-main"><strong>${esc(semanaTxt(s.lunes))}</strong>
          <small>${esc(s.etapas.map(e => `${e.nombre} ${pctTxt(e.pct)}`).join(' · '))}${s.nota ? ' · ' + esc(s.nota) : ''}</small></span>
          <span class="fm-monto">${pctTxt(s.general)}${s.cambio == null ? '' : `<small> ${s.cambio > 0 ? '+' : ''}${s.cambio} pts</small>`}</span></button>`).join('')
        : '<p class="muted">Todavía no has cerrado ninguna semana.</p>'}
    </section>`;

  const dialogoEtapa = async (e) => {
    let valores = { nombre: e ? e.nombre : '', pct: e ? String(e.pct) : '0', peso: e ? String(e.peso || 1) : '1', inicio: e ? e.inicio : '', fin: e ? e.fin : '', nota: e ? e.nota : '' };
    for (;;) {
      const r = await formularioMov({ titulo: e ? 'Editar etapa' : 'Agregar etapa', puedeEliminar: !!e, textoGuardar: 'Guardar', valores,
        campos: [{ k: 'nombre', t: 'Nombre de la etapa', req: true }, { k: 'pct', t: 'Avance (0 a 100 %)' },
          { k: 'peso', t: 'Peso en el avance general', ayuda: '1 = normal. Pon 2 si esta etapa pesa el doble que las demás.' },
          { k: 'inicio', t: 'Inicio', tipo: 'date' }, { k: 'fin', t: 'Terminar el', tipo: 'date' }, { k: 'nota', t: 'Nota' }] });
      if (!r) return null; if (r === 'eliminar') return r; valores = r;
      const pc = r.pct === '' ? 0 : leerNum(r.pct), pe = r.peso === '' ? 1 : leerNum(r.peso);
      if (!(pc >= 0 && pc <= 100)) { aviso('El avance debe estar entre 0 y 100.', 'error'); continue; }
      if (!(pe > 0 && pe <= 100)) { aviso('El peso debe ser mayor que 0.', 'error'); continue; }
      if (r.inicio && r.fin && r.fin < r.inicio) { aviso('La fecha final es anterior a la de inicio.', 'error'); continue; }
      return { nombre: r.nombre.slice(0, 80), pct: Math.round(pc * 10) / 10, peso: pe, inicio: r.inicio || '', fin: r.fin || '', nota: (r.nota || '').slice(0, 120) };
    }
  };

  $('#av-agregar').addEventListener('click', async () => {
    const r = await dialogoEtapa(null); if (!r || r === 'eliminar') return;
    a.etapas.push(Object.assign({ id: nuevoId() }, r)); await guardar(); pestanaAvances(p);
  });
  const sug = $('#av-sugeridas');
  if (sug) sug.addEventListener('click', async () => {
    for (const n of ETAPAS_SUGERIDAS) a.etapas.push({ id: nuevoId(), nombre: n, pct: 0, peso: 1, inicio: '', fin: '', nota: '' });
    await guardar(); pestanaAvances(p);
  });
  $$('.av-etapa').forEach(el => {
    const e = a.etapas.find(x => x.id === el.dataset.id);
    el.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', async () => { e.pct = Number(b.dataset.set); await guardar(); pestanaAvances(p); }));
    el.querySelector('[data-editar]').addEventListener('click', async () => {
      const r = await dialogoEtapa(e); if (!r) return;
      if (r === 'eliminar') {
        if (!await confirmar('Quitar etapa', `¿Quitar "${e.nombre}"? El historial de semanas ya cerradas se conserva.`, 'Quitar')) return;
        a.etapas = a.etapas.filter(x => x !== e);
      } else Object.assign(e, r);
      await guardar(); pestanaAvances(p);
    });
  });

  $('#av-cerrar').addEventListener('click', async () => {
    const r = await formularioMov({ titulo: 'Cerrar semana', textoGuardar: 'Guardar', valores: { fecha: hoy(), nota: '' },
      campos: [{ k: 'fecha', t: 'Un día de esa semana', tipo: 'date', req: true, ayuda: 'La semana va de lunes a domingo.' }, { k: 'nota', t: 'Nota de la semana (qué se hizo, qué falta)', tipo: 'textarea' }] });
    if (!r) return;
    const lunes = lunesDe(r.fecha), ya = a.semanas.find(s => s.lunes === lunes);
    const foto = { id: ya ? ya.id : nuevoId(), lunes, nota: (r.nota || (ya && ya.nota) || '').slice(0, 300), general: g, etapas: a.etapas.map(e => ({ id: e.id, nombre: e.nombre, pct: e.pct, peso: e.peso || 1 })), creado: ahora() };
    if (ya) a.semanas[a.semanas.indexOf(ya)] = foto; else a.semanas.push(foto);
    await guardar(); aviso(ya ? 'Se actualizó esa semana.' : 'Semana guardada.'); pestanaAvances(p);
  });
  $$('.av-sem').forEach(b => b.addEventListener('click', async () => {
    const s = a.semanas.find(x => x.id === b.dataset.sem);
    const r = await formularioMov({ titulo: semanaTxt(s.lunes), puedeEliminar: true, valores: { nota: s.nota || '' }, campos: [{ k: 'nota', t: 'Nota de la semana', tipo: 'textarea' }] });
    if (!r) return;
    if (r === 'eliminar') { if (!await confirmar('Eliminar semana', 'Se borra solo esta semana del historial.', 'Eliminar')) return; a.semanas = a.semanas.filter(x => x !== s); }
    else s.nota = (r.nota || '').slice(0, 300);
    await guardar(); pestanaAvances(p);
  }));
  const pdf = $('#av-pdf');
  pdf.addEventListener('click', async () => {
    pdf.disabled = true; const t0 = pdf.textContent; pdf.textContent = 'Preparando PDF…';
    try { const f = await generarPDFAvances(p); descargarArchivo(f); aviso('Descargando ' + f.name + '. Búscalo en la carpeta Descargas.'); }
    catch (er) { console.error(er); aviso('No se pudo crear el PDF: ' + er.message, 'error'); }
    pdf.disabled = false; pdf.textContent = t0;
  });
}

/* ---------- Reporte semanal ---------- */

/* Junta todo lo de una semana (lunes a domingo): avance al cierre, cambio contra la semana anterior,
   entradas de la bitácora con sus fotos y pagos recibidos. */
async function datosSemana(p, lunes) {
  const a = datosAvances(p), dom = domingoDe(lunes);
  const [seg, fotos] = await Promise.all([dbPorProyecto('seguimiento', p.id), dbPorProyecto('fotos', p.id)]);
  const cerrada = a.semanas.find(s => s.lunes === lunes) || null;
  const actual = cerrada || { lunes, nota: '', general: avanceGeneral(a.etapas), etapas: a.etapas.map(e => ({ id: e.id, nombre: e.nombre, pct: e.pct, peso: e.peso || 1 })) };
  const previas = a.semanas.filter(s => s.lunes < lunes).sort((x, y) => y.lunes.localeCompare(x.lunes));
  const prev = previas[0] || null;
  const enSemana = m => (m.fecha || '') >= lunes && (m.fecha || '') <= dom;
  const ord = (x, y) => (x.fecha || '').localeCompare(y.fecha || '') || (x.creado || '').localeCompare(y.creado || '');
  const entradas = seg.filter(m => m.tipo === 'bitacora' && enSemana(m)).sort(ord)
    .map(b => ({ fecha: b.fecha, texto: b.texto, fotos: fotos.filter(f => f.bitacoraId === b.id).sort((x, y) => (x.fecha || '').localeCompare(y.fecha || '')) }));
  const pagos = seg.filter(m => m.tipo === 'pago' && enSemana(m)).sort(ord);
  return { lunes, dom, cerrada: !!cerrada, actual, prev, cambio: prev ? Math.round((actual.general - prev.general) * 10) / 10 : null, entradas, pagos };
}

async function generarPDFSemanal(p, lunes, op) {
  const c = datosContratista(), d = await datosSemana(p, lunes);
  await cargarFuentesPDF();
  const H = new HojaPDF();
  await dibujarEncabezado(H, c, 'Reporte semanal', fecha(hoy()));
  H.h2('Proyecto');
  H.filaDato('Proyecto', p.nombre); H.filaDato('Cliente', p.cliente); H.filaDato('Dirección', p.direccion); H.filaDato('Responsable', p.responsable || c.empresa);
  H.filaDato('Semana', `${fecha(lunes)} al ${fecha(d.dom)}`);

  if (op.avance && d.actual.etapas.length) {
    H.h2('Avance de la semana');
    H.cabe(110);
    const bw = H.ancho - 190, g = d.actual.general;
    H.ctx.fillStyle = T.fondo; H.ctx.fillRect(PDF_M, H.y + 6, bw, 40);
    H.ctx.fillStyle = T.marca; H.ctx.fillRect(PDF_M, H.y + 6, bw * g / 100, 40);
    H.fuente(34, true); H.ctx.fillStyle = T.tinta; H.ctx.fillText(pctTxt(g), PDF_M + bw + 18, H.y + 42); H.y += 64;
    if (d.cambio != null) H.parrafo(`Contra la semana anterior: ${d.cambio > 0 ? '+' : ''}${d.cambio} puntos.`, { px: 22 });
    if (!d.cerrada) H.parrafo('Esta semana aún no está cerrada: se usan los porcentajes de hoy.', { px: 19, color: T.gris });
    const antes = new Map((d.prev ? d.prev.etapas : []).map(e => [e.id, e.pct]));
    H.tabla([{ t: 'Etapa', f: .4, neg: true }, { t: 'Estado', f: .2 }, { t: 'Antes', f: .13, ali: 'right' }, { t: 'Ahora', f: .13, ali: 'right' }, { t: 'Cambio', f: .14, ali: 'right' }],
      d.actual.etapas.map(e => { const a0 = antes.has(e.id) ? antes.get(e.id) : null, dif = a0 == null ? null : Math.round((e.pct - a0) * 10) / 10;
        return [e.nombre, estadoEtapa(e.pct), a0 == null ? '—' : pctTxt(a0), pctTxt(e.pct), dif == null ? '—' : (dif > 0 ? '+' : '') + dif + ' pts']; }));
    if (d.actual.nota) { H.h4('Nota de la semana'); H.parrafo(d.actual.nota); }
  }

  if (op.obra) {
    H.h2('Trabajos y fotos de la semana');
    if (!d.entradas.length) H.parrafo('No hay entradas en la bitácora de esta semana.', { color: T.gris });
    for (const e of d.entradas) {
      H.cabe(200);
      H.fuente(28, true); H.ctx.fillStyle = T.tinta; H.ctx.fillText(fecha(e.fecha), PDF_M, H.y + 28); H.y += 44;
      H.parrafo(e.texto || '');
      if (e.fotos.length) await fotosEnPDF(H, e.fotos, op.medidas, f => f.descripcion || '');
      H.ctx.fillStyle = T.linea; H.ctx.fillRect(PDF_M, H.y + 4, H.ancho, 2); H.y += 24;
    }
  }

  if (op.pagos) {
    H.h2('Pagos recibidos esta semana');
    if (!d.pagos.length) H.parrafo('No hubo pagos esta semana.', { color: T.gris });
    else {
      const tot = d.pagos.reduce((x, m) => x + (m.monto || 0), 0);
      H.tabla([{ t: 'Fecha', f: .2 }, { t: 'Concepto', f: .4 }, { t: 'Forma de pago', f: .2 }, { t: 'Monto', f: .2, ali: 'right' }],
        d.pagos.map(m => [fecha(m.fecha), { t: etiqueta(CONCEPTOS_PAGO, m.concepto), sub: m.nota || '' }, etiqueta(METODOS_PAGO, m.metodo), formatoPesos(m.monto)]),
        { pie: ['Total de la semana', '', '', formatoPesos(tot)] });
    }
  }
  H.y += 10;
  H.parrafo('El avance es una estimación del contratista y puede ajustarse.', { px: 19, color: T.gris });
  const nombre = pieYNombre(H, p, 'Reporte semanal');
  return { archivo: new File([await armarPDF(H.paginas, `Reporte semanal - ${p.nombre}`)], nombre, { type: 'application/pdf' }), datos: d };
}

async function pestanaReporteSemanal(p, cont) {
  const r = p.reporte = p.reporte || {};
  const op = r.semanal = Object.assign({ avance: true, obra: true, medidas: true, pagos: false }, r.semanal || {});
  const guardar = () => { p.actualizado = ahora(); programarGuardado(() => dbGuardar('proyectos', p)); };
  const OPS = [['avance', 'Avance por etapas (desde la pestaña Avances)'], ['obra', 'Trabajos y fotos de la semana (de la bitácora en Obra)'], ['medidas', 'Dibujar las medidas sobre las fotos'], ['pagos', 'Pagos recibidos esta semana (nunca gastos)']];
  cont.innerHTML = `
    <div class="row-between"><h2>Reporte semanal</h2><span id="save-status" class="save-status">Los cambios se guardan solos</span></div>
    <section class="card" id="rs-card">
      <label class="field"><span>Un día de la semana del reporte</span><input type="date" id="rs-fecha" value="${hoy()}"></label>
      <p id="rs-semana" class="strong"></p>
      <h3>Contenido</h3>
      <ul class="checks">${OPS.map(([k, t]) => `<li><label class="check"><input type="checkbox" data-sop="${k}"${op[k] ? ' checked' : ''}><span>${esc(t)}</span></label></li>`).join('')}</ul>
      <div id="rs-resumen" class="small muted"></div>
      <div class="actions"><button class="btn primary grande" id="rs-pdf">Descargar PDF semanal</button></div>
    </section>`;
  const lunes = () => lunesDe($('#rs-fecha').value || hoy());
  const refrescar = async () => {
    const f = $('#rs-fecha').value; if (!f) { $('#rs-semana').textContent = 'Elige una fecha.'; $('#rs-pdf').disabled = true; return; }
    $('#rs-pdf').disabled = false;
    const l = lunes(), d = await datosSemana(p, l), nf = d.entradas.reduce((x, e) => x + e.fotos.length, 0);
    $('#rs-semana').textContent = semanaTxt(l);
    $('#rs-resumen').innerHTML = [
      datosAvances(p).etapas.length ? `Avance general: <strong>${pctTxt(d.actual.general)}</strong>${d.cambio == null ? '' : ` (${d.cambio > 0 ? '+' : ''}${d.cambio} pts contra la semana anterior)`}${d.cerrada ? '' : ' · semana sin cerrar: se usan los porcentajes de hoy'}`
        : 'Aún no hay etapas en la pestaña Avances.',
      `${d.entradas.length} entrada${d.entradas.length === 1 ? '' : 's'} de bitácora y ${nf} foto${nf === 1 ? '' : 's'}`,
      `${d.pagos.length} pago${d.pagos.length === 1 ? '' : 's'} recibido${d.pagos.length === 1 ? '' : 's'}`].map(x => `<div>${x}</div>`).join('');
  };
  $('#rs-fecha').addEventListener('change', refrescar);
  $$('[data-sop]').forEach(i => i.addEventListener('change', () => { op[i.dataset.sop] = i.checked; guardar(); }));
  $('#rs-pdf').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; const t0 = b.textContent; b.textContent = 'Preparando PDF…';
    try { await guardarPendiente(); const { archivo } = await generarPDFSemanal(p, lunes(), op); descargarArchivo(archivo); aviso('Descargando ' + archivo.name + '. Búscalo en la carpeta Descargas.'); }
    catch (er) { console.error(er); aviso('No se pudo crear el PDF: ' + er.message, 'error'); }
    b.disabled = false; b.textContent = t0;
  });
  await refrescar();
}
