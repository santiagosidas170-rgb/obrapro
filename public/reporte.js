/* ObraPro - reporte.js (Etapa 7)
   Datos del contratista (logo y firma), pestaña "Reporte" con selección de espacios,
   firma del cliente y la hoja imprimible que se guarda como PDF. */
'use strict';

/* ---------- Opciones del reporte de un proyecto ---------- */

const OPCIONES_REPORTE = [
  ['fotos', 'Fotos de cada espacio'],
  ['medidas', 'Dibujar las medidas sobre las fotos'],
  ['fotosGenerales', 'Fotos que no son de un espacio'],
  ['conceptos', 'Conceptos de obra'],
  ['presupuesto', 'Resumen del presupuesto'],
  ['firmas', 'Recuadros de firma']
];

function opcionesReporte(p) {
  const r = p.reporte = Object.assign({ sel: null, fotos: true, medidas: true, fotosGenerales: true,
    conceptos: true, presupuesto: true, firmas: true }, p.reporte || {});
  return r;
}

function datosContratista() {
  return Object.assign({ empresa: '', telefono: '', correo: '', logo: '', firma: '' }, ajustes.rep || {});
}

/* ---------- Lienzo para firmar (dedo, lápiz o ratón) ---------- */

function crearPadFirma(cont) {
  cont.innerHTML = '<canvas class="firma-lienzo" width="900" height="300" aria-label="Área para firmar con el dedo o el lápiz"></canvas>';
  const c = cont.firstElementChild;
  const ctx = c.getContext('2d');
  ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d150c';
  let dibujando = false, hayTrazo = false, ult = null;
  const punto = e => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
  };
  c.addEventListener('pointerdown', e => {
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    dibujando = true; ult = punto(e);
    ctx.beginPath(); ctx.arc(ult.x, ult.y, 2.5, 0, 7); ctx.fillStyle = '#1d150c'; ctx.fill();
    hayTrazo = true; cont.dispatchEvent(new Event('firma'));
  });
  c.addEventListener('pointermove', e => {
    if (!dibujando) return;
    e.preventDefault();
    const p = punto(e);
    ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ult = p;
  });
  const fin = () => { dibujando = false; };
  c.addEventListener('pointerup', fin);
  c.addEventListener('pointercancel', fin);
  return {
    vacio: () => !hayTrazo,
    limpiar: () => { ctx.clearRect(0, 0, c.width, c.height); hayTrazo = false; cont.dispatchEvent(new Event('firma')); },
    dataURL: () => c.toDataURL('image/png')
  };
}

/* ---------- Logo: se reduce y se guarda como texto dentro de los ajustes ---------- */

async function procesarLogo(archivo) {
  const img = await cargarImagen(archivo);
  const k = Math.min(1, 600 / img.naturalWidth, 300 / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const png = /png|webp|gif|svg/i.test(archivo.type);
  if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(img, 0, 0, w, h);
  return png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
}

/* ---------- Ajustes: datos para el reporte ---------- */

function seccionAjustesReporte() {
  const r = datosContratista();
  return `<section class="card" id="sec-reporte">
    <h2>Datos para el reporte</h2>
    <p>Aparecen en el encabezado y en la firma de cada reporte en PDF. Todo es opcional.</p>
    <div class="grid2">
      <label class="field"><span>Nombre o empresa</span><input id="r-empresa" value="${esc(r.empresa)}" autocomplete="organization"></label>
      <label class="field"><span>Teléfono</span><input id="r-tel" type="tel" inputmode="tel" value="${esc(r.telefono)}"></label>
      <label class="field"><span>Correo</span><input id="r-correo" type="email" inputmode="email" value="${esc(r.correo)}"></label>
    </div>
    <h3>Logo</h3>
    <div class="logo-prev" id="r-logo-prev">${r.logo ? `<img src="${r.logo}" alt="Tu logo">` : '<span class="muted">Sin logo</span>'}</div>
    <div class="actions">
      <label class="btn" for="r-logo-file">${r.logo ? 'Cambiar logo…' : 'Elegir logo…'}</label>
      <input type="file" id="r-logo-file" accept="image/*" hidden>
      <button class="btn" id="r-logo-quitar"${r.logo ? '' : ' hidden'}>Quitar logo</button>
    </div>
    <h3>Tu firma</h3>
    <div id="r-firma-guardada">${r.firma ? `<div class="firma-prev"><img src="${r.firma}" alt="Tu firma guardada"></div>` : '<p class="muted">Sin firma guardada.</p>'}</div>
    <div id="r-firma-pad" class="firma-caja" hidden></div>
    <div class="actions">
      <button class="btn" id="r-firma-nueva">${r.firma ? 'Firmar de nuevo' : 'Firmar'}</button>
      <button class="btn primary" id="r-firma-guardar" hidden>Guardar firma</button>
      <button class="btn" id="r-firma-borrar" hidden>Borrar trazo</button>
      <button class="btn danger-outline" id="r-firma-quitar"${r.firma ? '' : ' hidden'}>Quitar firma</button>
    </div>
  </section>`;
}

function conectarAjustesReporte() {
  const rep = () => (ajustes.rep = datosContratista());
  const campo = (id, k) => $(id).addEventListener('input', e => { rep()[k] = e.target.value.trim(); programarGuardado(guardarAjustes); });
  campo('#r-empresa', 'empresa'); campo('#r-tel', 'telefono'); campo('#r-correo', 'correo');

  $('#r-logo-file').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      rep().logo = await procesarLogo(f);
      await guardarAjustes();
      $('#r-logo-prev').innerHTML = `<img src="${ajustes.rep.logo}" alt="Tu logo">`;
      $('#r-logo-quitar').hidden = false;
      aviso('Logo guardado.');
    } catch (err) { aviso('No se pudo leer la imagen del logo.', 'error'); }
  });
  $('#r-logo-quitar').addEventListener('click', async () => {
    rep().logo = ''; await guardarAjustes();
    $('#r-logo-prev').innerHTML = '<span class="muted">Sin logo</span>';
    $('#r-logo-quitar').hidden = true; aviso('Logo quitado.');
  });

  let pad = null;
  const cerrarPad = () => {
    pad = null; $('#r-firma-pad').hidden = true; $('#r-firma-pad').innerHTML = '';
    $('#r-firma-guardar').hidden = true; $('#r-firma-borrar').hidden = true; $('#r-firma-nueva').hidden = false;
  };
  $('#r-firma-nueva').addEventListener('click', () => {
    const caja = $('#r-firma-pad');
    caja.hidden = false; pad = crearPadFirma(caja);
    $('#r-firma-guardar').hidden = false; $('#r-firma-borrar').hidden = false; $('#r-firma-nueva').hidden = true;
  });
  $('#r-firma-borrar').addEventListener('click', () => pad && pad.limpiar());
  $('#r-firma-guardar').addEventListener('click', async () => {
    if (!pad || pad.vacio()) { aviso('Dibuja tu firma en el recuadro antes de guardarla.', 'error'); return; }
    rep().firma = pad.dataURL(); await guardarAjustes();
    $('#r-firma-guardada').innerHTML = `<div class="firma-prev"><img src="${ajustes.rep.firma}" alt="Tu firma guardada"></div>`;
    $('#r-firma-nueva').textContent = 'Firmar de nuevo'; $('#r-firma-quitar').hidden = false;
    cerrarPad(); aviso('Firma guardada.');
  });
  $('#r-firma-quitar').addEventListener('click', async () => {
    rep().firma = ''; await guardarAjustes();
    $('#r-firma-guardada').innerHTML = '<p class="muted">Sin firma guardada.</p>';
    $('#r-firma-nueva').textContent = 'Firmar'; $('#r-firma-quitar').hidden = true; aviso('Firma quitada.');
  });
}

/* ---------- Pestaña "Reporte" ---------- */

async function pestanaReporte(p) {
  const espacios = (await dbPorProyecto('espacios', p.id))
    .sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.creado || '').localeCompare(b.creado || ''));
  const cuerpo = $('#tab-body');
  if (!cuerpo) return;
  const o = opcionesReporte(p);
  const sel = new Set(o.sel || espacios.map(s => s.id));
  const c = datosContratista();
  const sinDatos = !c.empresa && !c.logo && !c.firma;

  cuerpo.innerHTML = `
    <div class="row-between"><h2>Reporte en PDF</h2><span id="save-status" class="save-status">Los cambios se guardan solos</span></div>
    <div class="layout-reporte">
      <section class="card">
        <h3>Espacios que se incluyen</h3>
        ${espacios.length ? `
          <div class="actions chicos">
            <button class="btn" id="rp-todos">Marcar todos</button>
            <button class="btn" id="rp-ninguno">Quitar todos</button>
          </div>
          <ul class="checks" id="rp-espacios">${espacios.map(s => `
            <li><label class="check"><input type="checkbox" value="${s.id}"${sel.has(s.id) ? ' checked' : ''}>
              <span>${esc(s.nombre || 'Sin nombre')}${s.tipo ? ` <small class="muted">· ${esc(s.tipo)}</small>` : ''}</span></label></li>`).join('')}
          </ul>` : '<p class="muted">Este proyecto aún no tiene espacios. El reporte llevará solo los datos del proyecto.</p>'}
        <h3>Contenido</h3>
        <ul class="checks">${OPCIONES_REPORTE.map(([k, t]) => `
          <li><label class="check"><input type="checkbox" data-op="${k}"${o[k] ? ' checked' : ''}><span>${esc(t)}</span></label></li>`).join('')}
        </ul>
        <p class="small muted">Si dejas espacios fuera, el presupuesto incluye solo los conceptos de los espacios marcados y los que no pertenecen a ningún espacio.</p>
      </section>

      <section class="card">
        <h3>Firma del cliente</h3>
        <div id="rp-firma-actual"></div>
        <label class="field"><span>Nombre de quien firma</span>
          <input id="rp-firma-nombre" value="${esc((p.firmaCliente && p.firmaCliente.nombre) || p.cliente || '')}"></label>
        <div id="rp-pad" class="firma-caja"></div>
        <div class="actions">
          <button class="btn" id="rp-borrar-trazo">Borrar trazo</button>
          <button class="btn primary" id="rp-guardar-firma">Guardar firma del cliente</button>
        </div>
        <p class="small muted">Es opcional. Si no hay firma, el reporte lleva una línea en blanco para firmar a mano.</p>
      </section>
    </div>
    ${sinDatos ? '<div class="banner">Aún no capturas tus datos, logo ni firma para el reporte. <a href="#/ajustes">Hazlo en Ajustes</a>.</div>' : ''}
    <div class="actions">
      <a class="btn primary grande" id="rp-ver" href="#/reporte/${p.id}">Ver reporte</a>
    </div>`;

  const guardar = () => { p.actualizado = ahora(); return dbGuardar('proyectos', p); };
  const leerSel = () => {
    const ids = $$('#rp-espacios input:checked').map(i => i.value);
    o.sel = ids.length === espacios.length ? null : ids;
    programarGuardado(guardar);
  };
  const lista = $('#rp-espacios');
  if (lista) {
    lista.addEventListener('change', leerSel);
    $('#rp-todos').addEventListener('click', () => { $$('#rp-espacios input').forEach(i => { i.checked = true; }); leerSel(); });
    $('#rp-ninguno').addEventListener('click', () => { $$('#rp-espacios input').forEach(i => { i.checked = false; }); leerSel(); });
  }
  $$('input[data-op]').forEach(i => i.addEventListener('change', () => { o[i.dataset.op] = i.checked; programarGuardado(guardar); }));

  const pintarFirma = () => {
    const f = p.firmaCliente;
    $('#rp-firma-actual').innerHTML = f && f.img
      ? `<div class="firma-prev"><img src="${f.img}" alt="Firma del cliente"></div>
         <p class="small muted">Firmó ${esc(f.nombre || '')} el ${esc(fecha(f.fecha))}.
         <button class="btn ghost" id="rp-quitar-firma">Quitar firma</button></p>`
      : '<p class="muted">El cliente aún no ha firmado.</p>';
    const q = $('#rp-quitar-firma');
    if (q) q.addEventListener('click', async () => {
      const ok = await confirmar('Quitar firma', 'Se borrará la firma del cliente de este proyecto.', 'Quitar');
      if (!ok) return;
      delete p.firmaCliente; await guardar(); pintarFirma(); aviso('Firma quitada.');
    });
  };
  pintarFirma();
  const pad = crearPadFirma($('#rp-pad'));
  $('#rp-borrar-trazo').addEventListener('click', () => pad.limpiar());
  $('#rp-guardar-firma').addEventListener('click', async () => {
    if (pad.vacio()) { aviso('Pide al cliente que firme en el recuadro.', 'error'); return; }
    p.firmaCliente = { img: pad.dataURL(), nombre: $('#rp-firma-nombre').value.trim(), fecha: hoy() };
    await guardar(); pad.limpiar(); pintarFirma(); aviso('Firma guardada con la fecha de hoy.');
  });
}

/* ---------- La hoja del reporte ---------- */

function medidasTexto(s) {
  if (s.forma === 'irregular') return `${(s.tramos || []).length} tramo(s)`;
  return s.largo && s.ancho ? `${textoNumero(s.largo)} × ${textoNumero(s.ancho)} ${UNIDADES[s.unidad].corto}` + (s.altura ? ` · alto ${textoNumero(s.altura)}` : '') : 'Sin medidas';
}

function filaDato(t, v) { return v ? `<tr><th>${esc(t)}</th><td>${esc(v)}</td></tr>` : ''; }

const pct = x => String(+(+x).toFixed(2));

function parrafos(t) { return esc(t).replace(/\n/g, '<br>'); }

async function vistaReporte(id) {
  const p = await dbObtener('proyectos', id);
  if (!p) {
    main().innerHTML = '<div class="card"><p>No se encontró el proyecto.</p><a class="btn" href="#/proyectos">Volver</a></div>';
    return;
  }
  const o = opcionesReporte(p);
  const c = datosContratista();
  const [todosEsp, fotos, partidas] = await Promise.all([dbPorProyecto('espacios', p.id), dbPorProyecto('fotos', p.id), dbPorProyecto('partidas', p.id)]);
  todosEsp.sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.creado || '').localeCompare(b.creado || ''));
  const ids = new Set(o.sel || todosEsp.map(s => s.id));
  const espacios = todosEsp.filter(s => ids.has(s.id));
  const nombreEsp = Object.fromEntries(todosEsp.map(s => [s.id, s.nombre || 'Sin nombre']));
  const excluidos = todosEsp.length - espacios.length;

  main().innerHTML = `
    <div class="reporte-barra">
      <a class="btn ghost" href="#/proyecto/${p.id}/reporte">← Volver</a>
      <span class="muted" id="rp-estado">Preparando fotos…</span>
      <button class="btn primary" id="rp-imprimir" disabled>Guardar como PDF</button>
    </div>
    <p class="reporte-ayuda no-print">Se abrirá la ventana de impresión: elige <strong>Guardar como PDF</strong> como destino.
      Luego podrás compartir el archivo desde tu tablet.</p>
    <article class="hoja" id="hoja"></article>`;

  /* Fotos: con las medidas dibujadas si así se pidió */
  const urlFoto = async f => {
    if (o.medidas && f.anotaciones && f.anotaciones.length) {
      try { return urlDe(await renderizarFoto(f)); } catch (e) { /* usa la original */ }
    }
    return urlDe(f.imagen);
  };
  const ordenFotos = fotos.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const htmlFotos = async lista => {
    const trozos = [];
    for (const f of lista) {
      const cat = etiqueta(CATEGORIAS_FOTO, f.categoria);
      trozos.push(`<figure class="rp-foto"><img src="${await urlFoto(f)}" alt="${esc(f.descripcion || cat)}">
        <figcaption><strong>${esc(cat)}</strong>${f.descripcion ? ' · ' + esc(f.descripcion) : ''}</figcaption></figure>`);
    }
    return `<div class="rp-fotos">${trozos.join('')}</div>`;
  };

  /* Resumen de espacios */
  let totSup = 0;
  const calc = espacios.map(s => { const r = calcularEspacio(s); if (r.superficie) totSup += redondear2(r.superficie); return r; });
  const tablaEsp = espacios.length ? `
    <table class="rp-tabla">
      <thead><tr><th>Espacio</th><th>Medidas</th><th class="n">Superficie</th><th class="n">Perímetro</th><th class="n">Muros</th><th>Estado</th></tr></thead>
      <tbody>${espacios.map((s, i) => `<tr><td><strong>${esc(s.nombre || 'Sin nombre')}</strong></td><td>${esc(medidasTexto(s))}</td>
        <td class="n">${calc[i].superficie != null ? num(calc[i].superficie) + ' m²' : '—'}</td>
        <td class="n">${calc[i].perimetro != null ? num(calc[i].perimetro) + ' m' : '—'}</td>
        <td class="n">${calc[i].muros != null ? num(calc[i].muros) + ' m²' : '—'}</td>
        <td>${esc(etiqueta(ESTADOS_ESPACIO, s.estadoActual))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Superficie total</td><td class="n">${num(totSup)} m²</td><td colspan="3"></td></tr></tfoot>
    </table>` : '';

  /* Detalle por espacio */
  let detalle = '';
  for (const s of espacios) {
    const fs = o.fotos ? ordenFotos.filter(f => f.espacioId === s.id) : [];
    detalle += `<section class="rp-espacio">
      <h3>${esc(s.nombre || 'Sin nombre')}${s.tipo ? ` <small>${esc(s.tipo)}</small>` : ''}</h3>
      <p class="rp-meta">${esc(medidasTexto(s))} · ${esc(etiqueta(ESTADOS_ESPACIO, s.estadoActual))}</p>
      ${s.trabajos ? `<h4>Trabajos recomendados</h4><p>${parrafos(s.trabajos)}</p>` : ''}
      ${s.observaciones ? `<h4>Observaciones</h4><p>${parrafos(s.observaciones)}</p>` : ''}
      ${fs.length ? await htmlFotos(fs) : ''}
    </section>`;
  }
  const gen = o.fotosGenerales && o.fotos ? ordenFotos.filter(f => !f.espacioId || !nombreEsp[f.espacioId]) : [];
  if (gen.length) detalle += `<section class="rp-espacio"><h3>Fotos generales</h3>${await htmlFotos(gen)}</section>`;

  /* Conceptos y presupuesto */
  const incl = partidas.filter(x => !x.espacioId || ids.has(x.espacioId) || !nombreEsp[x.espacioId])
    .sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
  const pr = Object.assign({ indirectos: 0, utilidad: 0, aplicarIva: false, iva: 16, notas: '', vigencia: '', condiciones: '' }, p.presupuesto || {});
  let bloqueConceptos = '';
  if (o.conceptos && incl.length) {
    let mat = 0, mo = 0, sub = 0, hayEst = false;
    const filas = incl.map(pt => {
      const r = calcularPartida(pt); mat += r.material; mo += r.manoObra; sub += r.subtotal;
      const est = pt.tipoCantidad === 'estimada'; if (est) hayEst = true;
      return `<tr><td><strong>${esc(pt.descripcion || 'Sin nombre')}</strong>
        <small>${esc([pt.espacioId ? nombreEsp[pt.espacioId] : '', pt.categoria].filter(Boolean).join(' · '))}</small></td>
        <td>${pt.cantidad == null ? '—' : esc(num(pt.cantidad) + ' ' + unidadTxt(pt.unidad))}${est ? ' *' : ''}</td>
        <td class="n">${formatoPesos(r.material)}</td><td class="n">${formatoPesos(r.manoObra)}</td><td class="n">${formatoPesos(r.subtotal)}</td></tr>`;
    }).join('');
    bloqueConceptos = `<section class="rp-bloque"><h2>Conceptos de obra</h2>
      <table class="rp-tabla"><thead><tr><th>Concepto</th><th>Cantidad</th><th class="n">Material</th><th class="n">Mano de obra</th><th class="n">Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td colspan="2">Costo directo</td><td class="n">${formatoPesos(mat)}</td><td class="n">${formatoPesos(mo)}</td><td class="n">${formatoPesos(sub)}</td></tr></tfoot></table>
      ${hayEst ? '<p class="small">* Cantidad estimada, pendiente de confirmar en obra.</p>' : ''}</section>`;
  }
  let bloquePres = '';
  if (o.presupuesto && incl.length) {
    const t = calcularPresupuesto(incl, { indirectos: pr.indirectos || 0, utilidad: pr.utilidad || 0, aplicarIva: pr.aplicarIva, iva: pr.iva || 0 });
    const fila = (a, b, fuerte) => `<tr${fuerte ? ' class="total"' : ''}><td>${a}</td><td class="n">${b}</td></tr>`;
    bloquePres = `<section class="rp-bloque"><h2>Presupuesto estimado</h2>
      ${excluidos ? `<p class="small">Incluye solo los espacios de este reporte: ${esc(espacios.map(s => s.nombre || 'Sin nombre').join(', ') || 'ninguno')}.</p>` : ''}
      <table class="rp-tabla rp-resumen"><tbody>
        ${fila('Materiales', formatoPesos(t.material))}${fila('Mano de obra', formatoPesos(t.manoObra))}
        ${fila('Costo directo', formatoPesos(t.directo))}
        ${pr.indirectos ? fila(`Indirectos (${pct(pr.indirectos)} %)`, formatoPesos(t.indirectos)) : ''}
        ${pr.utilidad ? fila(`Utilidad (${pct(pr.utilidad)} %)`, formatoPesos(t.utilidad)) : ''}
        ${fila('Subtotal', formatoPesos(t.subtotal))}
        ${pr.aplicarIva ? fila(`IVA (${pct(pr.iva)} %)`, formatoPesos(t.iva)) : ''}
        ${fila(pr.aplicarIva ? 'Total (MXN)' : 'Total sin IVA (MXN)', formatoPesos(t.total), true)}
      </tbody></table>
      ${pr.vigencia ? `<p><strong>Vigencia:</strong> ${esc(pr.vigencia)}</p>` : ''}
      ${pr.notas ? `<p><strong>Notas:</strong> ${parrafos(pr.notas)}</p>` : ''}
      ${pr.condiciones ? `<p><strong>Condiciones:</strong> ${parrafos(pr.condiciones)}</p>` : ''}</section>`;
  }

  /* Firmas */
  const f = p.firmaCliente;
  const bloqueFirmas = o.firmas ? `<section class="rp-firmas">
    <div class="rp-firma">${c.firma ? `<img src="${c.firma}" alt="">` : '<div class="espacio"></div>'}<div class="linea"></div>
      <strong>${esc(p.responsable || c.empresa || 'Responsable')}</strong><span>${esc(c.empresa && p.responsable ? c.empresa : '')}</span></div>
    <div class="rp-firma">${f && f.img ? `<img src="${f.img}" alt="">` : '<div class="espacio"></div>'}<div class="linea"></div>
      <strong>${esc((f && f.nombre) || p.cliente || 'Cliente')}</strong><span>${f && f.img ? 'Firmó el ' + esc(fecha(f.fecha)) : 'Cliente'}</span></div>
  </section>` : '';

  const contacto = [c.telefono, c.correo].filter(Boolean).join(' · ');
  $('#hoja').innerHTML = `
    <header class="rp-encabezado">
      <div class="rp-marca">${c.logo ? `<img src="${c.logo}" alt="Logo">` : ''}
        <div><strong>${esc(c.empresa)}</strong>${contacto ? `<span>${esc(contacto)}</span>` : ''}</div></div>
      <div class="rp-titulo"><h1>Reporte de levantamiento</h1><span>${esc(fecha(p.fecha || hoy()))}</span></div>
    </header>
    <section class="rp-bloque"><h2>Datos del proyecto</h2>
      <table class="rp-datos"><tbody>
        ${filaDato('Proyecto', p.nombre)}${filaDato('Cliente', p.cliente)}${filaDato('Teléfono', p.telefono)}${filaDato('Correo', p.correo)}
        ${filaDato('Dirección', p.direccion)}${filaDato('Tipo de trabajo', etiqueta(TIPOS_TRABAJO, p.tipoTrabajo))}
        ${filaDato('Estado', etiqueta(ESTADOS, p.estado))}${filaDato('Responsable', p.responsable)}
      </tbody></table>
      ${p.observaciones ? `<h4>Observaciones generales</h4><p>${parrafos(p.observaciones)}</p>` : ''}
    </section>
    ${espacios.length ? `<section class="rp-bloque"><h2>Espacios</h2>${tablaEsp}</section>` : ''}
    ${detalle ? `<section class="rp-bloque"><h2>Detalle por espacio</h2>${detalle}</section>` : ''}
    ${bloqueConceptos}${bloquePres}
    <p class="small rp-aviso">${esc(AVISO_MEDIDAS)} La superficie de muros es bruta: no descuenta puertas ni ventanas.</p>
    ${bloqueFirmas}`;

  /* Espera a que carguen las imágenes y habilita el botón */
  const titulo0 = document.title;
  document.title = `Reporte - ${p.nombre} - ${hoy()}`;
  alSalir(() => { document.title = titulo0; });
  const imgs = $$('#hoja img');
  await Promise.all(imgs.map(im => im.decode ? im.decode().catch(() => {}) : Promise.resolve()));
  const est = $('#rp-estado'), btn = $('#rp-imprimir');
  if (!btn) return;
  est.textContent = `${espacios.length} espacio(s) · ${imgs.length} imagen(es)`;
  btn.disabled = false;
  btn.addEventListener('click', () => window.print());
}
