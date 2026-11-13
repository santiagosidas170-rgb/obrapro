/* ObraPro - seguimiento.js (Etapa 9)
   Pestaña "Obra": estado del proyecto, pagos recibidos, gastos reales y bitácora con fotos de avance.
   Todo se guarda en la tabla "seguimiento" (tipo: pago | gasto | bitacora). Dinero en centavos enteros. */
'use strict';

const CONCEPTOS_PAGO = [['anticipo', 'Anticipo'], ['estimacion', 'Estimación / avance'], ['finiquito', 'Finiquito'], ['otro', 'Otro']];
const METODOS_PAGO = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['cheque', 'Cheque'], ['tarjeta', 'Tarjeta'], ['otro', 'Otro']];
const CATEGORIAS_GASTO = [['material', 'Material'], ['mano_obra', 'Mano de obra'], ['transporte', 'Transporte y fletes'],
  ['herramienta', 'Herramienta y renta'], ['subcontrato', 'Subcontrato'], ['otro', 'Otro']];

/* ---------- Formulario genérico en ventana ---------- */
/* campos: [{k, t (etiqueta), tipo: text|textarea|date|money|select, op (opciones), req, ayuda}]
   Devuelve los valores, 'eliminar', o null si se cancela. */
function formularioMov({ titulo, campos, valores = {}, puedeEliminar = false, textoGuardar = 'Guardar' }) {
  return new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg-form';
    const html = campos.map(c => {
      const v = valores[c.k];
      const id = 'fm-' + c.k;
      let ctl;
      if (c.tipo === 'select') ctl = `<select id="${id}">${c.op.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      else if (c.tipo === 'textarea') ctl = `<textarea id="${id}" rows="4">${esc(v || '')}</textarea>`;
      else if (c.tipo === 'date') ctl = `<input id="${id}" type="date" value="${esc(v || '')}">`;
      else if (c.tipo === 'money') ctl = `<input id="${id}" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${v == null ? '' : (v / 100).toFixed(2)}">`;
      else ctl = `<input id="${id}" type="text" autocomplete="off" maxlength="120" value="${esc(v || '')}">`;
      return `<label class="field"><span>${esc(c.t)}${c.req ? ' *' : ''}</span>${ctl}${c.ayuda ? `<small class="muted">${esc(c.ayuda)}</small>` : ''}</label>`;
    }).join('');
    dlg.innerHTML = `<form method="dialog" novalidate>
      <h2>${esc(titulo)}</h2>${html}
      <p class="error-msg" id="fm-error" role="alert" hidden></p>
      <div class="dlg-actions">
        ${puedeEliminar ? '<button type="button" class="btn danger-outline" data-eliminar>Eliminar</button>' : ''}
        <button value="cancel" class="btn">Cancelar</button>
        <button value="ok" class="btn primary">${esc(textoGuardar)}</button>
      </div></form>`;
    document.body.appendChild(dlg);
    let resultado = null;
    const leer = () => {
      const out = {};
      for (const c of campos) {
        const el = dlg.querySelector('#fm-' + c.k);
        let v = el.value.trim();
        if (c.tipo === 'money') {
          const r = leerDinero(v);
          if (r.error) return { error: `${c.t}: ${r.error}` };
          if (r.vacio || r.valor <= 0) { if (c.req) return { error: `${c.t}: escribe un monto mayor que cero.` }; v = null; }
          else v = r.valor;
        } else if (c.req && !v) return { error: `Falta: ${c.t}.` };
        out[c.k] = v;
      }
      return { valores: out };
    };
    dlg.querySelector('form').addEventListener('submit', e => {
      if (e.submitter && e.submitter.value === 'cancel') return;
      const r = leer();
      if (r.error) { e.preventDefault(); const m = dlg.querySelector('#fm-error'); m.textContent = r.error; m.hidden = false; return; }
      resultado = r.valores;
    });
    const el = dlg.querySelector('[data-eliminar]');
    if (el) el.addEventListener('click', () => { resultado = 'eliminar'; dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(resultado); });
    dlg.showModal();
    const primero = dlg.querySelector('input:not([type=date]), textarea, select');
    if (primero) primero.focus();
  });
}

/* ---------- Totales del proyecto ---------- */

async function totalPresupuestoProyecto(p) {
  const partidas = await dbPorProyecto('partidas', p.id);
  if (!partidas.length) return { total: null, costoDirecto: 0 };
  const pr = Object.assign({ indirectos: 0, utilidad: 0, aplicarIva: false, iva: 16 }, p.presupuesto || {});
  const t = calcularPresupuesto(partidas, { indirectos: pr.indirectos || 0, utilidad: pr.utilidad || 0, aplicarIva: pr.aplicarIva, iva: pr.iva || 0 });
  return { total: t.total, costoDirecto: t.directo, conIva: !!pr.aplicarIva };
}

const textoDe = (lista, k) => etiqueta(lista, k);

/* ---------- Pestaña "Obra" ---------- */

async function pestanaObra(p) {
  const [mov, fotos, tp] = await Promise.all([dbPorProyecto('seguimiento', p.id), dbPorProyecto('fotos', p.id), totalPresupuestoProyecto(p)]);
  const cuerpo = $('#tab-body');
  if (!cuerpo) return;
  const ord = (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || '').localeCompare(a.creado || '');
  const pagos = mov.filter(m => m.tipo === 'pago').sort(ord);
  const gastos = mov.filter(m => m.tipo === 'gasto').sort(ord);
  const bitacora = mov.filter(m => m.tipo === 'bitacora').sort(ord);
  const r = resumenObra({ total: tp.total, costoDirecto: tp.costoDirecto, pagos, gastos });
  const signo = c => (c < 0 ? '−' : '') + formatoPesos(Math.abs(c));

  const filaMov = m => m.tipo === 'pago'
    ? `<button class="fila-mov" data-id="${m.id}"><span class="fm-main"><strong>${esc(textoDe(CONCEPTOS_PAGO, m.concepto))}</strong>
        <small>${esc(fecha(m.fecha))} · ${esc(textoDe(METODOS_PAGO, m.metodo))}${m.nota ? ' · ' + esc(m.nota) : ''}</small></span><span class="fm-monto">${formatoPesos(m.monto)}</span></button>`
    : `<button class="fila-mov" data-id="${m.id}"><span class="fm-main"><strong>${esc(m.descripcion || textoDe(CATEGORIAS_GASTO, m.categoria))}</strong>
        <small>${esc(fecha(m.fecha))} · ${esc(textoDe(CATEGORIAS_GASTO, m.categoria))}${m.proveedor ? ' · ' + esc(m.proveedor) : ''}</small></span><span class="fm-monto">${formatoPesos(m.monto)}</span></button>`;

  const fotosDe = id => fotos.filter(f => f.bitacoraId === id).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  cuerpo.innerHTML = `
    <div class="row-between"><h2>Seguimiento de obra</h2>
      <label class="inline-sel"><span>Estado</span>
        <select id="ob-estado" aria-label="Estado del proyecto">${ESTADOS.map(([k, t]) => `<option value="${k}"${k === p.estado ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    </div>

    <div class="layout-obra">
      <section class="card" id="ob-resumen">
        <h3>Resumen</h3>
        ${tp.total == null ? '<p class="muted">Este proyecto aún no tiene presupuesto; el resumen solo muestra lo cobrado y lo gastado.</p>' : ''}
        <dl class="resumen-ob">
          ${tp.total != null ? `<div><dt>Presupuesto${tp.conIva ? ' (con IVA)' : ' (sin IVA)'}</dt><dd>${formatoPesos(tp.total)}</dd></div>` : ''}
          <div><dt>Cobrado</dt><dd class="ok">${formatoPesos(r.cobrado)}</dd></div>
          ${r.porCobrar != null ? `<div><dt>${r.porCobrar < 0 ? 'Cobrado de más' : 'Por cobrar'}</dt><dd>${formatoPesos(Math.abs(r.porCobrar))}</dd></div>` : ''}
          <div><dt>Gastado</dt><dd>${formatoPesos(r.gastado)}</dd></div>
          ${r.diferenciaCosto != null ? `<div><dt>Costo directo presupuestado</dt><dd>${formatoPesos(tp.costoDirecto)}</dd></div>
            <div><dt>${r.diferenciaCosto >= 0 ? 'Has gastado menos que lo presupuestado' : 'Has gastado más que lo presupuestado'}</dt><dd class="${r.diferenciaCosto >= 0 ? 'ok' : 'mal'}">${formatoPesos(Math.abs(r.diferenciaCosto))}</dd></div>` : ''}
          <div class="total"><dt>Utilidad a la fecha (cobrado − gastado)</dt><dd class="${r.utilidadReal >= 0 ? 'ok' : 'mal'}">${signo(r.utilidadReal)}</dd></div>
        </dl>
        ${r.avanceCobro != null ? `<div class="barra" role="img" aria-label="Cobrado ${r.avanceCobro} por ciento del presupuesto"><span style="width:${r.avanceCobro}%"></span></div>
          <p class="small muted">Cobrado: ${String(r.avanceCobro).replace(/\.0+$/, '')} % del presupuesto.</p>` : ''}
        <p class="small muted">Estos datos son solo para ti: no aparecen en el reporte, salvo el estado de pagos si lo eliges.</p>
      </section>

      <section class="card" id="ob-pagos">
        <div class="row-between"><h3>Pagos recibidos (${pagos.length})</h3><button class="btn primary" id="ob-nuevo-pago">Registrar pago</button></div>
        ${pagos.length ? `<div class="lista-mov">${pagos.map(filaMov).join('')}</div>` : '<p class="muted">Aún no registras pagos. Anota aquí cada anticipo o estimación que cobres.</p>'}
      </section>

      <section class="card" id="ob-gastos">
        <div class="row-between"><h3>Gastos reales (${gastos.length})</h3><button class="btn primary" id="ob-nuevo-gasto">Registrar gasto</button></div>
        ${gastos.length ? `<div class="lista-mov">${gastos.map(filaMov).join('')}</div>
          <p class="small muted">${Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(textoDe(CATEGORIAS_GASTO, k))}: ${formatoPesos(v)}`).join(' · ')}</p>`
          : '<p class="muted">Anota lo que realmente gastas en material, mano de obra y demás, para comparar con lo presupuestado.</p>'}
      </section>

      <section class="card" id="ob-bitacora">
        <div class="row-between"><h3>Bitácora (${bitacora.length})</h3><button class="btn primary" id="ob-nueva-nota">Nueva entrada</button></div>
        ${bitacora.length ? bitacora.map(b => {
          const fs = fotosDe(b.id);
          return `<article class="entrada" data-id="${b.id}">
            <header><strong>${esc(fecha(b.fecha))}</strong>
              <span class="actions tight">
                <button class="btn" data-acc="foto" data-id="${b.id}">Tomar foto</button>
                <button class="btn" data-acc="galeria" data-id="${b.id}">Fotos</button>
                <button class="btn ghost" data-acc="editar" data-id="${b.id}">Editar</button></span></header>
            <p>${esc(b.texto).replace(/\n/g, '<br>')}</p>
            ${fs.length ? `<div class="mini-fotos">${fs.map(f => `<a href="#/foto/${f.id}" aria-label="Abrir foto"><img alt="Foto de avance" data-mini="${f.id}"></a>`).join('')}</div>` : ''}
          </article>`;
        }).join('') : '<p class="muted">La bitácora es tu diario de la obra: qué se hizo hoy, pendientes, acuerdos con el cliente. Cada entrada puede llevar fotos de avance.</p>'}
      </section>
    </div>`;

  /* miniaturas */
  for (const f of fotos) {
    const img = cuerpo.querySelector(`img[data-mini="${f.id}"]`);
    if (img) img.src = urlDe(f.miniatura || f.imagen);
  }

  const refrescar = () => pestanaObra(p);
  const guardarMov = async m => { await dbGuardar('seguimiento', m); p.actualizado = ahora(); await dbGuardar('proyectos', p); };

  $('#ob-estado').addEventListener('change', async e => {
    p.estado = e.target.value; p.actualizado = ahora(); await dbGuardar('proyectos', p);
    const b = $('#badge'); if (b) { b.className = 'badge st-' + p.estado; b.textContent = etiqueta(ESTADOS, p.estado); }
    aviso('Estado: ' + etiqueta(ESTADOS, p.estado));
  });

  /* pagos y gastos: mismo flujo para nuevo y editar */
  const camposPago = [
    { k: 'fecha', t: 'Fecha', tipo: 'date', req: true },
    { k: 'concepto', t: 'Concepto', tipo: 'select', op: CONCEPTOS_PAGO },
    { k: 'monto', t: 'Monto (MXN)', tipo: 'money', req: true },
    { k: 'metodo', t: 'Forma de pago', tipo: 'select', op: METODOS_PAGO },
    { k: 'nota', t: 'Nota', tipo: 'text' }];
  const camposGasto = [
    { k: 'fecha', t: 'Fecha', tipo: 'date', req: true },
    { k: 'descripcion', t: 'Descripción', tipo: 'text', req: true },
    { k: 'categoria', t: 'Categoría', tipo: 'select', op: CATEGORIAS_GASTO },
    { k: 'monto', t: 'Monto (MXN)', tipo: 'money', req: true },
    { k: 'proveedor', t: 'Proveedor o persona', tipo: 'text' }];
  const editar = async (tipo, existente) => {
    const esPago = tipo === 'pago';
    const v = await formularioMov({
      titulo: existente ? (esPago ? 'Editar pago' : 'Editar gasto') : (esPago ? 'Registrar pago' : 'Registrar gasto'),
      campos: esPago ? camposPago : camposGasto,
      valores: existente || { fecha: hoy(), concepto: pagos.length ? 'estimacion' : 'anticipo', metodo: 'transferencia', categoria: 'material' },
      puedeEliminar: !!existente
    });
    if (v === null) return;
    if (v === 'eliminar') {
      if (!(await confirmar(esPago ? 'Eliminar pago' : 'Eliminar gasto', `Se borrará ${formatoPesos(existente.monto)} del ${fecha(existente.fecha)}. Esto cambia el resumen.`))) return;
      await dbBorrar('seguimiento', existente.id); p.actualizado = ahora(); await dbGuardar('proyectos', p);
      aviso('Eliminado.'); return refrescar();
    }
    const m = Object.assign(existente || { id: nuevoId(), proyectoId: p.id, tipo, creado: ahora() }, v, { actualizado: ahora() });
    await guardarMov(m); aviso(existente ? 'Cambios guardados.' : (esPago ? 'Pago registrado.' : 'Gasto registrado.')); refrescar();
  };
  $('#ob-nuevo-pago').addEventListener('click', () => editar('pago'));
  $('#ob-nuevo-gasto').addEventListener('click', () => editar('gasto'));
  $$('#ob-pagos .fila-mov').forEach(b => b.addEventListener('click', () => editar('pago', pagos.find(x => x.id === b.dataset.id))));
  $$('#ob-gastos .fila-mov').forEach(b => b.addEventListener('click', () => editar('gasto', gastos.find(x => x.id === b.dataset.id))));

  /* bitácora */
  const camposNota = [{ k: 'fecha', t: 'Fecha', tipo: 'date', req: true }, { k: 'texto', t: 'Qué pasó', tipo: 'textarea', req: true }];
  const editarNota = async existente => {
    const v = await formularioMov({ titulo: existente ? 'Editar entrada' : 'Nueva entrada de bitácora', campos: camposNota,
      valores: existente || { fecha: hoy() }, puedeEliminar: !!existente });
    if (v === null) return;
    if (v === 'eliminar') {
      const nf = fotosDe(existente.id).length;
      if (!(await confirmar('Eliminar entrada', nf ? `Se borrará la entrada y sus ${nf} foto(s) de avance. No se puede deshacer.` : 'Se borrará esta entrada de la bitácora.'))) return;
      for (const f of fotosDe(existente.id)) await dbBorrar('fotos', f.id);
      await dbBorrar('seguimiento', existente.id); p.actualizado = ahora(); await dbGuardar('proyectos', p);
      aviso('Entrada eliminada.'); return refrescar();
    }
    const m = Object.assign(existente || { id: nuevoId(), proyectoId: p.id, tipo: 'bitacora', creado: ahora() }, v, { actualizado: ahora() });
    await guardarMov(m); aviso('Entrada guardada.'); refrescar();
  };
  $('#ob-nueva-nota').addEventListener('click', () => editarNota());
  $$('#ob-bitacora [data-acc]').forEach(b => b.addEventListener('click', async () => {
    const entrada = bitacora.find(x => x.id === b.dataset.id);
    if (b.dataset.acc === 'editar') return editarNota(entrada);
    const archivos = await pedirArchivos({ camara: b.dataset.acc === 'foto', multiple: b.dataset.acc === 'galeria' });
    if (!archivos.length) return;
    const hechas = await agregarFotos(archivos, p.id, null, 'avance');
    for (const f of hechas) { f.bitacoraId = entrada.id; await dbGuardar('fotos', f); }
    if (hechas.length) aviso(hechas.length === 1 ? 'Foto agregada a la entrada.' : `${hechas.length} fotos agregadas.`);
    refrescar();
  }));
}
