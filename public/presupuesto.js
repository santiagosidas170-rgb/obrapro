/* ObraPro - presupuesto.js  (Etapa 6)
   Catálogo de conceptos, conceptos de cada proyecto (con cantidades medidas, estimadas
   o confirmadas) y presupuesto básico. Los precios los captura siempre el usuario:
   ObraPro no trae precios. Usa funciones de app.js, db.js y calc.js. */
'use strict';

const UNIDADES_CONCEPTO = [['m2', 'm²'], ['m', 'm'], ['m3', 'm³'], ['pza', 'pieza'], ['lote', 'lote'], ['servicio', 'servicio']];
const CATEGORIAS_CONCEPTO = ['Demolición', 'Albañilería', 'Aplanados', 'Pintura', 'Pisos y azulejos', 'Instalaciones eléctricas',
  'Instalaciones hidráulicas y sanitarias', 'Plafones', 'Carpintería', 'Herrería', 'Impermeabilización', 'Limpieza', 'Otros'];
const TIPOS_CANTIDAD = [['medida', 'Medida'], ['estimada', 'Estimada'], ['confirmada', 'Confirmada']];
const AYUDA_TIPO = {
  medida: 'Tomada de las medidas que capturaste en un espacio.',
  estimada: 'Un cálculo aproximado. Confírmala antes de presentar el presupuesto.',
  confirmada: 'Verificada en obra o aceptada por el cliente.'
};
const ORIGENES = { piso: ['Piso', 'm2'], muros: ['Muros', 'm2'], perimetro: ['Perímetro', 'm'] };

/* Conceptos de arranque: solo nombres, categorías y unidades. SIN precios. */
const CONCEPTOS_BASICOS = [
  ['Demolición de muro', 'Demolición', 'm2'], ['Demolición de piso', 'Demolición', 'm2'], ['Retiro de escombro', 'Demolición', 'm3'],
  ['Muro de block', 'Albañilería', 'm2'], ['Cadena o castillo', 'Albañilería', 'm'], ['Resane y reparación de grietas', 'Albañilería', 'm'],
  ['Aplanado de mortero en muros', 'Aplanados', 'm2'], ['Aplanado fino en muros y plafones', 'Aplanados', 'm2'],
  ['Pintura vinílica en muros y plafones', 'Pintura', 'm2'], ['Sellador', 'Pintura', 'm2'], ['Pintura de esmalte en herrería', 'Pintura', 'm2'],
  ['Piso cerámico o porcelanato', 'Pisos y azulejos', 'm2'], ['Azulejo en muros', 'Pisos y azulejos', 'm2'], ['Zoclo o rodapié', 'Pisos y azulejos', 'm'],
  ['Salida de contacto o apagador', 'Instalaciones eléctricas', 'pza'], ['Salida de luminaria', 'Instalaciones eléctricas', 'pza'], ['Cableado y canalización', 'Instalaciones eléctricas', 'lote'],
  ['Salida hidráulica', 'Instalaciones hidráulicas y sanitarias', 'pza'], ['Salida sanitaria o drenaje', 'Instalaciones hidráulicas y sanitarias', 'pza'],
  ['Mueble de baño (suministro e instalación)', 'Instalaciones hidráulicas y sanitarias', 'pza'],
  ['Plafón de tablaroca', 'Plafones', 'm2'], ['Plafón de PVC', 'Plafones', 'm2'],
  ['Puerta de madera', 'Carpintería', 'pza'], ['Closet o mueble de cocina', 'Carpintería', 'lote'],
  ['Ventana de herrería o aluminio', 'Herrería', 'pza'], ['Reja o barandal', 'Herrería', 'm'],
  ['Impermeabilización de azotea', 'Impermeabilización', 'm2'], ['Limpieza final de obra', 'Limpieza', 'servicio']
];

const unidadTxt = u => (UNIDADES_CONCEPTO.find(x => x[0] === u) || [0, u || ''])[1];
const opcionesCat = sel => CATEGORIAS_CONCEPTO.map(c => `<option value="${esc(c)}"${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');

/* ---------- Campos de formulario con validación ---------- */

function campoDinero(id, texto, centavos) {
  return `<label class="field"><span>${texto} <em class="unit-tag">MXN</em></span>
    <input id="f-${id}" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(dineroTxt(centavos))}">
    <small class="err" id="e-${id}"></small></label>`;
}
function campoNum(id, texto, valor, marca) {
  return `<label class="field"><span>${texto} ${marca ? `<em class="unit-tag">${esc(marca)}</em>` : ''}</span>
    <input id="f-${id}" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(valor == null ? '' : valor)}">
    <small class="err" id="e-${id}"></small></label>`;
}

/* Conecta un campo: valida al escribir, guarda si es válido y da formato al salir. */
function enlazarCampo(id, leer, asignar, { formatear, alCambiar, obligatorio = false, msgVacio = 'Este dato es obligatorio.' } = {}) {
  const inp = $('#f-' + id), err = $('#e-' + id);
  const marcar = msg => { inp.classList.toggle('invalid', !!msg); if (err) err.textContent = msg || ''; };
  inp.addEventListener('input', () => {
    const r = leer(inp.value);
    if (r.error) { marcar(r.error); return; }
    marcar(''); asignar(r.vacio ? null : r.valor);
    if (alCambiar) alCambiar();
  });
  inp.addEventListener('change', () => {
    const r = leer(inp.value);
    if (r.error) { marcar(r.error); return; }
    if (r.vacio && obligatorio) { marcar(msgVacio); return; }
    marcar('');
    if (!r.vacio && formatear) inp.value = formatear(r.valor);
  });
}

function filasNavegables(raiz) {
  $$('tbody tr[data-id]', raiz).forEach(tr => {
    const ir = () => { location.hash = '#/partida/' + tr.dataset.id; };
    tr.addEventListener('click', e => { if (!e.target.closest('a')) ir(); });
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') ir(); });
  });
}

/* ---------- Datos ---------- */

async function conceptosOrdenados() {
  const lista = await dbTodos('catalogo');
  const pos = c => { const i = CATEGORIAS_CONCEPTO.indexOf(c.categoria); return i < 0 ? 999 : i; };
  return lista.sort((a, b) => pos(a) - pos(b) || (a.descripcion || '').localeCompare(b.descripcion || '', 'es'));
}

async function agregarBasicos() {
  const existentes = new Set((await dbTodos('catalogo')).map(c => normalizar(c.descripcion)));
  let n = 0;
  for (const [descripcion, categoria, unidad] of CONCEPTOS_BASICOS) {
    if (existentes.has(normalizar(descripcion))) continue;
    await dbGuardar('catalogo', { id: nuevoId(), descripcion, categoria, unidad, precioMaterial: null, precioManoObra: null, desperdicio: null, creado: ahora(), actualizado: ahora() });
    n++;
  }
  return n;
}

function textoPrecios(c) {
  if (c.precioMaterial == null && c.precioManoObra == null) return '<span class="tag aviso">Sin precio</span>';
  return `Material ${c.precioMaterial == null ? '—' : formatoPesos(c.precioMaterial)} · Mano de obra ${c.precioManoObra == null ? '—' : formatoPesos(c.precioManoObra)}`;
}

/* Copia los valores de un concepto del catálogo a una partida nueva del proyecto
   (si después cambias el catálogo, los presupuestos anteriores no cambian). */
async function crearPartida(proyectoId, c) {
  const pt = {
    id: nuevoId(), proyectoId, espacioId: null, catalogoId: c ? c.id : null,
    descripcion: c ? c.descripcion : '', categoria: c ? c.categoria : 'Otros', unidad: c ? c.unidad : 'm2',
    cantidad: null, tipoCantidad: 'estimada', origen: null,
    precioMaterial: c ? c.precioMaterial : null, precioManoObra: c ? c.precioManoObra : null,
    desperdicio: c && c.desperdicio != null ? c.desperdicio : 0, notas: '', creado: ahora(), actualizado: ahora()
  };
  await dbGuardar('partidas', pt);
  return pt;
}

async function desvincularPartidas(espacioId) {
  for (const pt of await dbTodos('partidas')) {
    if (pt.espacioId === espacioId) { pt.espacioId = null; await dbGuardar('partidas', pt); }
    if (pt.origen && pt.origen.espacioId === espacioId) { pt.origen = null; if (pt.tipoCantidad === 'medida') pt.tipoCantidad = 'estimada'; await dbGuardar('partidas', pt); }
  }
}

/* Valor actual de una medida de un espacio (m o m²), redondeado a 2 decimales. */
function valorOrigen(espacio, campo) {
  if (!espacio) return null;
  const c = calcularEspacio(espacio);
  const v = campo === 'piso' ? c.superficie : campo === 'muros' ? c.muros : c.perimetro;
  return v == null ? null : redondear2(v);
}
function origenDesactualizado(pt, espacios) {
  if (!pt.origen) return false;
  const v = valorOrigen(espacios.find(e => e.id === pt.origen.espacioId), pt.origen.campo);
  return v == null || v !== pt.cantidad;
}

/* ---------- Catálogo ---------- */

async function vistaCatalogo() {
  const lista = await conceptosOrdenados();
  main().innerHTML = `
    <header class="page-head">
      <h1>Catálogo de conceptos</h1>
      <a class="btn primary" href="#/concepto/nuevo">+ Nuevo concepto</a>
    </header>
    <p class="muted">Tus conceptos de trabajo con <strong>tus propios precios</strong>: ObraPro no trae precios. Al agregar un concepto a un proyecto se
      copian sus valores; si después cambias el catálogo, los presupuestos anteriores no cambian.</p>
    <div class="toolbar">
      <input id="q" type="search" placeholder="Buscar concepto" aria-label="Buscar concepto">
      <select id="f-cat" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>${opcionesCat('')}</select>
    </div>
    <div id="cat-grupos"></div>
    <div class="actions"><button class="btn" id="basicos">Agregar conceptos básicos (sin precios)</button></div>`;

  const dibujar = () => {
    const q = normalizar($('#q').value), cat = $('#f-cat').value;
    const items = lista.filter(c => (!cat || c.categoria === cat) && (!q || normalizar(c.descripcion + ' ' + c.categoria).includes(q)));
    if (!lista.length) {
      $('#cat-grupos').innerHTML = `<div class="empty">${ICONO_CASA}<p>Tu catálogo está vacío.</p>
        <p class="small">Crea tus conceptos con tus precios, o agrega una lista de conceptos básicos sin precios para llenarlos tú.</p></div>`;
      return;
    }
    if (!items.length) { $('#cat-grupos').innerHTML = '<p class="empty">Ningún concepto coincide con la búsqueda.</p>'; return; }
    const grupos = {};
    items.forEach(c => { (grupos[c.categoria] = grupos[c.categoria] || []).push(c); });
    $('#cat-grupos').innerHTML = Object.keys(grupos).sort((a, b) => CATEGORIAS_CONCEPTO.indexOf(a) - CATEGORIAS_CONCEPTO.indexOf(b)).map(cat => `
      <section class="cat-grupo">
        <h2 class="cat-titulo">${esc(cat)} <span class="muted small">(${grupos[cat].length})</span></h2>
        ${grupos[cat].map(c => `<a class="cat-fila" href="#/concepto/${c.id}">
          <span class="cat-desc">${esc(c.descripcion)}</span><span class="cat-unidad">${esc(unidadTxt(c.unidad))}</span>
          <span class="cat-precio">${textoPrecios(c)}</span></a>`).join('')}
      </section>`).join('');
  };
  dibujar();
  $('#q').addEventListener('input', dibujar);
  $('#f-cat').addEventListener('change', dibujar);
  $('#basicos').addEventListener('click', async () => {
    const n = await agregarBasicos();
    aviso(n ? `${n} concepto(s) básico(s) agregados, sin precios.` : 'Ya tienes todos los conceptos básicos.');
    if (n) enrutar();
  });
}

async function vistaConcepto(id) {
  const nuevo = id === 'nuevo';
  let c = nuevo ? null : await dbObtener('catalogo', id);
  if (!nuevo && !c) {
    main().innerHTML = '<div class="card"><p>No se encontró el concepto.</p><a class="btn" href="#/catalogo">Volver</a></div>';
    return;
  }
  if (nuevo) c = { id: nuevoId(), descripcion: '', categoria: 'Otros', unidad: 'm2', precioMaterial: null, precioManoObra: null, desperdicio: null, creado: ahora() };
  let guardado = !nuevo;

  main().innerHTML = `
    <header class="page-head">
      <a class="btn ghost" href="#/catalogo">← Catálogo</a>
      <div class="title-block"><h1 id="titulo">${esc(c.descripcion || 'Nuevo concepto')}</h1></div>
      <span id="save-status" class="save-status">${nuevo ? 'Se guarda al escribir el nombre' : 'Los cambios se guardan solos'}</span>
    </header>
    <form id="cform" novalidate class="card form-angosto">
      ${campo('descripcion', 'Concepto *', c.descripcion, 'text', 'autocomplete="off" placeholder="Ej. Pintura vinílica en muros"')}
      <div class="grid2">
        <label class="field"><span>Categoría</span><select id="f-categoria">${opcionesCat(c.categoria)}</select></label>
        <label class="field"><span>Unidad de medida</span><select id="f-unidad">${opciones(UNIDADES_CONCEPTO, c.unidad)}</select></label>
        ${campoDinero('precioMaterial', 'Precio del material por unidad', c.precioMaterial)}
        ${campoDinero('precioManoObra', 'Precio de la mano de obra por unidad', c.precioManoObra)}
        ${campoNum('desperdicio', 'Desperdicio sugerido (opcional)', c.desperdicio, '%')}
      </div>
      <p class="muted small">Déjalos vacíos si todavía no sabes el precio. El desperdicio se aplica solo al material.</p>
    </form>
    <div class="actions danger-zone" id="zona-eliminar"${nuevo ? ' hidden' : ''}><button class="btn danger-outline" id="eliminar">Eliminar concepto</button></div>`;

  $('#cform').addEventListener('submit', e => e.preventDefault());
  const guardar = () => {
    if (!c.descripcion.trim()) { estadoGuardado('Escribe el nombre del concepto para guardarlo', 'error'); return; }
    c.actualizado = ahora();
    programarGuardado(async () => {
      await dbGuardar('catalogo', c); guardado = true;
      const z = $('#zona-eliminar'); if (z) z.hidden = false;     /* ya existe: se puede eliminar */
    });
  };
  $('#f-descripcion').addEventListener('input', e => { c.descripcion = e.target.value.trim(); $('#titulo').textContent = c.descripcion || 'Nuevo concepto'; mostrarError('descripcion', ''); guardar(); });
  $('#f-descripcion').addEventListener('change', () => { if (!c.descripcion) mostrarError('descripcion', 'Escribe el nombre del concepto.'); });
  $('#f-categoria').addEventListener('change', e => { c.categoria = e.target.value; guardar(); });
  $('#f-unidad').addEventListener('change', e => { c.unidad = e.target.value; guardar(); });
  enlazarCampo('precioMaterial', leerDinero, v => { c.precioMaterial = v; }, { formatear: dineroTxt, alCambiar: guardar });
  enlazarCampo('precioManoObra', leerDinero, v => { c.precioManoObra = v; }, { formatear: dineroTxt, alCambiar: guardar });
  enlazarCampo('desperdicio', leerPorcentaje, v => { c.desperdicio = v; }, { alCambiar: guardar });

  const el = $('#eliminar');
  if (el) el.addEventListener('click', async () => {
    if (!await confirmar('Eliminar concepto', `¿Eliminar "${c.descripcion}" del catálogo? Los conceptos que ya agregaste a proyectos no cambian.`)) return;
    _pendiente && clearTimeout(_pendiente.timer); _pendiente = null;
    await dbBorrar('catalogo', c.id);
    aviso('Concepto eliminado.');
    location.hash = '#/catalogo';
  });
  if (nuevo) $('#f-descripcion').focus();
}

/* ---------- Selector del catálogo (ventana) ---------- */

/* Devuelve el concepto elegido, 'blanco' para uno vacío, o undefined si se cancela. */
async function elegirConcepto() {
  const lista = await conceptosOrdenados();
  const dlg = $('#dlg-catalogo'), busc = $('#cat-buscar'), cont = $('#cat-lista');
  let elegido;
  const dibujar = () => {
    const q = normalizar(busc.value);
    const items = lista.filter(c => !q || normalizar(c.descripcion + ' ' + c.categoria).includes(q));
    let ultima = '';
    cont.innerHTML = '<button type="button" class="cat-item cat-blanco" data-id="">+ Concepto en blanco (lo capturo yo)</button>' +
      (items.length ? items.map(c => {
        const t = c.categoria !== ultima ? `<div class="cat-sep">${esc(c.categoria)}</div>` : ''; ultima = c.categoria;
        return `${t}<button type="button" class="cat-item" data-id="${c.id}"><span class="cat-desc">${esc(c.descripcion)}</span>
          <span class="cat-unidad">${esc(unidadTxt(c.unidad))}</span><span class="cat-precio">${textoPrecios(c)}</span></button>`;
      }).join('') : `<p class="muted small cat-vacio">${lista.length ? 'Ningún concepto coincide.' : 'Tu catálogo está vacío. Puedes agregar conceptos básicos desde el menú Catálogo.'}</p>`);
  };
  if (!dlg._listo) {
    dlg._listo = true;
    busc.addEventListener('input', () => dlg._dibujar());
    busc.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    cont.addEventListener('click', e => {
      const b = e.target.closest('.cat-item'); if (!b) return;
      dlg._elegido = b.dataset.id ? dlg._lista.find(x => x.id === b.dataset.id) : 'blanco';
      dlg.close('ok');
    });
  }
  dlg._dibujar = dibujar; dlg._lista = lista; dlg._elegido = undefined; busc.value = '';
  dibujar();
  return new Promise(resolve => {
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? dlg._elegido : undefined);
    dlg.showModal(); busc.focus();
  });
}

/* ---------- Tabla de conceptos (se usa en Conceptos y en Presupuesto) ---------- */

function tablaPartidas(partidas, nombreEsp, espacios, titulo) {
  let mat = 0, mo = 0, sub = 0;
  const filas = partidas.map(pt => {
    const r = calcularPartida(pt); mat += r.material; mo += r.manoObra; sub += r.subtotal;
    const sinPrecio = pt.precioMaterial == null && pt.precioManoObra == null;
    const viejo = origenDesactualizado(pt, espacios);
    return `<tr data-id="${pt.id}" tabindex="0">
      <td><a href="#/partida/${pt.id}"><strong>${esc(pt.descripcion || 'Sin nombre')}</strong></a>
        <small class="sub">${esc([pt.espacioId ? nombreEsp[pt.espacioId] : '', pt.categoria].filter(Boolean).join(' · '))}</small>
        ${sinPrecio ? '<span class="tag aviso">Sin precio</span>' : ''}${viejo ? '<span class="tag aviso">Medida cambió</span>' : ''}</td>
      <td data-label="Cantidad">${pt.cantidad == null ? '<span class="tag aviso">Sin cantidad</span>' : esc(num(pt.cantidad) + ' ' + unidadTxt(pt.unidad))}
        <span class="badge tq-${esc(pt.tipoCantidad)}">${esc(etiqueta(TIPOS_CANTIDAD, pt.tipoCantidad))}</span></td>
      <td class="n" data-label="Material">${formatoPesos(r.material)}</td>
      <td class="n" data-label="Mano de obra">${formatoPesos(r.manoObra)}</td>
      <td class="n" data-label="Subtotal"><strong>${formatoPesos(r.subtotal)}</strong></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="tabla tabla-conceptos" aria-label="${esc(titulo || 'Conceptos')}">
    <thead><tr><th>Concepto</th><th>Cantidad</th><th class="n">Material</th><th class="n">Mano de obra</th><th class="n">Subtotal</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="2">Costo directo</td><td class="n" data-label="Material">${formatoPesos(mat)}</td><td class="n" data-label="Mano de obra">${formatoPesos(mo)}</td><td class="n" data-label="Subtotal">${formatoPesos(sub)}</td></tr></tfoot>
  </table></div>`;
}

async function datosPresupuesto(p) {
  const [partidas, espacios] = await Promise.all([dbPorProyecto('partidas', p.id), dbPorProyecto('espacios', p.id)]);
  partidas.sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
  return { partidas, espacios, nombreEsp: Object.fromEntries(espacios.map(e => [e.id, e.nombre || 'Sin nombre'])) };
}

/* ---------- Pestaña "Conceptos" ---------- */

async function pestanaConceptos(p) {
  const { partidas, espacios, nombreEsp } = await datosPresupuesto(p);
  const cuerpo = $('#tab-body');
  if (!cuerpo) return;
  const cuenta = t => partidas.filter(x => x.tipoCantidad === t).length;
  cuerpo.innerHTML = `
    <div class="row-between">
      <h2>Conceptos (${partidas.length})</h2>
      <button class="btn primary" id="agregar-concepto">+ Agregar concepto</button>
    </div>
    ${partidas.length ? `
      <p class="chips-info">
        <span class="badge tq-medida">${cuenta('medida')} medida(s)</span>
        <span class="badge tq-estimada">${cuenta('estimada')} estimada(s)</span>
        <span class="badge tq-confirmada">${cuenta('confirmada')} confirmada(s)</span>
      </p>
      ${tablaPartidas(partidas, nombreEsp, espacios)}
      <p class="note">Toca un concepto para editar su cantidad y precios. Los importes están en pesos mexicanos (MXN).
        El desperdicio se aplica solo al material. Ve a la pestaña Presupuesto para ver el total.</p>`
    : `<div class="empty">${ICONO_CASA}<p>Este proyecto aún no tiene conceptos.</p>
        <p class="small">Agrega los trabajos que se necesitan, desde tu catálogo o en blanco, y toma sus cantidades de las medidas de cada espacio.</p></div>`}`;
  filasNavegables(cuerpo);
  $('#agregar-concepto').addEventListener('click', async () => {
    const c = await elegirConcepto();
    if (c === undefined) return;
    const pt = await crearPartida(p.id, c === 'blanco' ? null : c);
    location.hash = '#/partida/' + pt.id;
  });
}

/* ---------- Editor de un concepto del proyecto ---------- */

async function vistaPartida(id) {
  const pt = await dbObtener('partidas', id);
  if (!pt) {
    main().innerHTML = '<div class="card"><p>No se encontró el concepto.</p><a class="btn" href="#/proyectos">Volver</a></div>';
    return;
  }
  const [p, espacios] = await Promise.all([dbObtener('proyectos', pt.proyectoId), dbPorProyecto('espacios', pt.proyectoId)]);
  if (!$('#main')) return;

  main().innerHTML = `
    <header class="page-head">
      <a class="btn ghost" href="#/proyecto/${pt.proyectoId}/conceptos">← Conceptos</a>
      <div class="title-block"><h1 id="titulo">${esc(pt.descripcion || 'Nuevo concepto')}</h1><p class="muted">${esc(p ? p.nombre : '')}</p></div>
      <span id="save-status" class="save-status">Los cambios se guardan solos</span>
    </header>
    <div class="layout-espacio">
      <form id="pform" novalidate class="col-main">
        <fieldset><legend>Concepto</legend>
          ${campo('descripcion', 'Descripción *', pt.descripcion, 'text', 'autocomplete="off" placeholder="Ej. Pintura vinílica en muros"')}
          <div class="grid2">
            <label class="field"><span>Categoría</span><select id="f-categoria">${opcionesCat(pt.categoria)}</select></label>
            <label class="field"><span>Espacio</span><select id="f-espacio"><option value="">Sin espacio (toda la obra)</option>
              ${espacios.map(e => `<option value="${e.id}"${e.id === pt.espacioId ? ' selected' : ''}>${esc(e.nombre || 'Sin nombre')}</option>`).join('')}</select></label>
          </div>
        </fieldset>

        <fieldset><legend>Cantidad</legend>
          <div class="grid2">
            ${campoNum('cantidad', 'Cantidad', pt.cantidad, '')}
            <label class="field"><span>Unidad</span><select id="f-unidad">${opciones(UNIDADES_CONCEPTO, pt.unidad)}</select></label>
          </div>
          <div class="field"><span>¿Qué tan segura es esta cantidad?</span>
            <div class="seg" role="group" aria-label="Tipo de cantidad">
              ${TIPOS_CANTIDAD.map(([v, t]) => `<button type="button" class="seg-b" data-tipo="${v}" aria-pressed="${v === pt.tipoCantidad}">${t}</button>`).join('')}
            </div>
            <small class="muted" id="ayuda-tipo"></small></div>
          <div class="origen" id="origen"></div>
        </fieldset>

        <fieldset><legend>Precios (por unidad)</legend>
          <div class="grid3">
            ${campoDinero('precioMaterial', 'Material', pt.precioMaterial)}
            ${campoDinero('precioManoObra', 'Mano de obra', pt.precioManoObra)}
            ${campoNum('desperdicio', 'Desperdicio del material', pt.desperdicio, '%')}
          </div>
          <p class="muted small">Los precios los capturas tú. Déjalos vacíos si todavía no los sabes.</p>
          ${campoTexto('notas', 'Notas (opcional)', pt.notas, 2)}
        </fieldset>
      </form>

      <aside class="col-side">
        <div class="card resultados" aria-live="polite">
          <h2>Cálculo</h2>
          <div class="res"><span>Material</span><strong id="c-mat">—</strong></div>
          <p class="formula" id="c-mat-f"></p>
          <div class="res"><span>Mano de obra</span><strong id="c-mo">—</strong></div>
          <p class="formula" id="c-mo-f"></p>
          <div class="res res-fuerte"><span>Subtotal</span><strong id="c-sub">—</strong></div>
          <p class="warn" id="c-aviso" hidden></p>
          <p class="note">Importes en pesos mexicanos (MXN).</p>
        </div>
        <div class="card acciones-foto">
          <button type="button" class="btn" id="al-catalogo">Guardar en el catálogo</button>
          <button type="button" class="btn" id="duplicar">Duplicar concepto</button>
          <button type="button" class="btn danger-outline" id="eliminar-partida">Eliminar concepto</button>
        </div>
      </aside>
    </div>`;

  $('#pform').addEventListener('submit', e => e.preventDefault());
  const guardar = () => { pt.actualizado = ahora(); programarGuardado(() => dbGuardar('partidas', pt)); };

  const recalcular = () => {
    const r = calcularPartida(pt), cant = pt.cantidad == null ? 0 : pt.cantidad;
    $('#c-mat').textContent = formatoPesos(r.material); $('#c-mo').textContent = formatoPesos(r.manoObra); $('#c-sub').textContent = formatoPesos(r.subtotal);
    $('#c-mat-f').textContent = pt.precioMaterial == null ? 'Sin precio de material.' : `${num(cant)} × ${formatoPesos(pt.precioMaterial)}${pt.desperdicio ? ` × (1 + ${pt.desperdicio} % de desperdicio)` : ''}`;
    $('#c-mo-f').textContent = pt.precioManoObra == null ? 'Sin precio de mano de obra.' : `${num(cant)} × ${formatoPesos(pt.precioManoObra)}`;
    const av = []; if (pt.cantidad == null) av.push('Falta la cantidad.'); if (pt.precioMaterial == null && pt.precioManoObra == null) av.push('Falta capturar al menos un precio.');
    $('#c-aviso').hidden = !av.length; $('#c-aviso').textContent = av.join(' ');
  };
  const pintarTipo = () => {
    $$('.seg-b').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tipo === pt.tipoCantidad)));
    $('#ayuda-tipo').textContent = AYUDA_TIPO[pt.tipoCantidad];
  };
  /* Espacio cuyas medidas se muestran para elegir la cantidad (no cambia nada hasta tocar una medida). */
  const conMedidas = espacios.filter(e => Object.keys(ORIGENES).some(k => valorOrigen(e, k) != null));
  let espOrigen = pt.origen ? pt.origen.espacioId : (conMedidas.find(e => e.id === pt.espacioId) ? pt.espacioId : '');
  const tomarMedida = (espacio, campo) => {
    pt.origen = { espacioId: espacio.id, campo };
    pt.cantidad = valorOrigen(espacio, campo); pt.unidad = ORIGENES[campo][1]; pt.tipoCantidad = 'medida';
    if (!pt.espacioId) { pt.espacioId = espacio.id; $('#f-espacio').value = espacio.id; }
    $('#f-cantidad').value = String(pt.cantidad); $('#f-unidad').value = pt.unidad; mostrarError('cantidad', '');
    espOrigen = espacio.id; pintarTipo(); pintarOrigen(); recalcular(); guardar();
  };
  const pintarOrigen = () => {
    const cont = $('#origen');
    if (!conMedidas.length) { cont.innerHTML = '<p class="muted small">Cuando captures las medidas de un espacio podrás tomar de ahí la cantidad (piso, muros o perímetro).</p>'; return; }
    const esp = espacios.find(e => e.id === espOrigen);
    let html = `<div class="field"><span>Tomar la cantidad de las medidas de un espacio</span>
      <select id="f-origen-esp"><option value="">Elige un espacio…</option>${conMedidas.map(e => `<option value="${e.id}"${e.id === espOrigen ? ' selected' : ''}>${esc(e.nombre || 'Sin nombre')}</option>`).join('')}</select></div>`;
    if (esp) {
      html += `<div class="origen-btns">${Object.entries(ORIGENES).map(([k, [t, u]]) => {
        const v = valorOrigen(esp, k);
        return v == null ? '' : `<button type="button" class="btn origen-b" data-campo="${k}" aria-pressed="${!!(pt.origen && pt.origen.espacioId === esp.id && pt.origen.campo === k)}">${t}: ${num(v)} ${unidadTxt(u)}</button>`;
      }).join('')}</div>`;
    }
    if (pt.origen) {
      const e = espacios.find(x => x.id === pt.origen.espacioId), v = valorOrigen(e, pt.origen.campo);
      html += `<p class="small muted">Tomada de ${esc(e ? e.nombre || 'Sin nombre' : 'un espacio que ya no existe')} · ${esc(ORIGENES[pt.origen.campo][0].toLowerCase())}.</p>`;
      if (origenDesactualizado(pt, espacios)) {
        html += `<p class="warn">${v == null ? 'Esa medida ya no está disponible.' : `La medida del espacio cambió a ${num(v)}.`}
          ${v == null ? '' : '<button type="button" class="btn" id="actualizar-origen">Actualizar cantidad</button>'}</p>`;
      }
    }
    cont.innerHTML = html;
    $('#f-origen-esp').addEventListener('change', e => { espOrigen = e.target.value; pintarOrigen(); });
    $$('.origen-b', cont).forEach(b => b.addEventListener('click', () => tomarMedida(esp, b.dataset.campo)));
    const act = $('#actualizar-origen');
    if (act) act.addEventListener('click', () => {
      const e = espacios.find(x => x.id === pt.origen.espacioId); pt.cantidad = valorOrigen(e, pt.origen.campo);
      $('#f-cantidad').value = String(pt.cantidad); pintarOrigen(); recalcular(); guardar();
    });
  };

  $('#f-descripcion').addEventListener('input', e => { pt.descripcion = e.target.value.trim(); $('#titulo').textContent = pt.descripcion || 'Nuevo concepto'; mostrarError('descripcion', ''); guardar(); });
  $('#f-descripcion').addEventListener('change', () => { if (!pt.descripcion) mostrarError('descripcion', 'Escribe el nombre del concepto.'); });
  $('#f-categoria').addEventListener('change', e => { pt.categoria = e.target.value; guardar(); });
  $('#f-espacio').addEventListener('change', e => { pt.espacioId = e.target.value || null; guardar(); });
  $('#f-unidad').addEventListener('change', e => { pt.unidad = e.target.value; recalcular(); guardar(); });
  enlazarCampo('cantidad', leerCantidad, v => {
    pt.cantidad = v;
    if (pt.origen && v !== valorOrigen(espacios.find(e => e.id === pt.origen.espacioId), pt.origen.campo)) {   /* se escribió a mano: ya no es "medida" */
      pt.origen = null; if (pt.tipoCantidad === 'medida') pt.tipoCantidad = 'estimada'; pintarTipo(); pintarOrigen();
    }
  }, { formatear: v => String(v), alCambiar: () => { recalcular(); guardar(); } });
  enlazarCampo('precioMaterial', leerDinero, v => { pt.precioMaterial = v; }, { formatear: dineroTxt, alCambiar: () => { recalcular(); guardar(); } });
  enlazarCampo('precioManoObra', leerDinero, v => { pt.precioManoObra = v; }, { formatear: dineroTxt, alCambiar: () => { recalcular(); guardar(); } });
  enlazarCampo('desperdicio', leerPorcentaje, v => { pt.desperdicio = v == null ? 0 : v; }, { alCambiar: () => { recalcular(); guardar(); } });
  $('#f-notas').addEventListener('input', e => { pt.notas = e.target.value; guardar(); });
  $$('.seg-b').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tipo === 'medida' && !pt.origen) { aviso('Una cantidad "Medida" se toma de un espacio. Elige un espacio y toca su medida.', 'error'); return; }
    pt.tipoCantidad = b.dataset.tipo; pintarTipo(); guardar();
  }));

  $('#al-catalogo').addEventListener('click', async () => {
    if (!pt.descripcion) { aviso('Escribe primero la descripción del concepto.', 'error'); return; }
    const todos = await dbTodos('catalogo');
    const igual = todos.find(c => normalizar(c.descripcion) === normalizar(pt.descripcion));
    const datos = { descripcion: pt.descripcion, categoria: pt.categoria, unidad: pt.unidad, precioMaterial: pt.precioMaterial, precioManoObra: pt.precioManoObra, desperdicio: pt.desperdicio || null };
    if (igual) {
      if (!await confirmar('Actualizar catálogo', `Ya existe "${igual.descripcion}" en tu catálogo. ¿Actualizar sus precios con los de este concepto?`, 'Actualizar', false)) return;
      await dbGuardar('catalogo', Object.assign(igual, datos, { actualizado: ahora() }));
      aviso('Catálogo actualizado.');
    } else {
      await dbGuardar('catalogo', Object.assign({ id: nuevoId(), creado: ahora(), actualizado: ahora() }, datos));
      aviso('Concepto guardado en el catálogo.');
    }
  });
  $('#duplicar').addEventListener('click', async () => {
    await guardarPendiente();
    const copia = Object.assign({}, pt, { id: nuevoId(), creado: ahora(), actualizado: ahora() });
    await dbGuardar('partidas', copia);
    aviso('Concepto duplicado.');
    location.hash = '#/partida/' + copia.id;
  });
  $('#eliminar-partida').addEventListener('click', async () => {
    if (!await confirmar('Eliminar concepto', `¿Eliminar "${pt.descripcion || 'este concepto'}" del proyecto? Esta acción no se puede deshacer.`)) return;
    _pendiente && clearTimeout(_pendiente.timer); _pendiente = null;
    await dbBorrar('partidas', pt.id);
    aviso('Concepto eliminado.');
    location.hash = `#/proyecto/${pt.proyectoId}/conceptos`;
  });

  pintarTipo(); pintarOrigen(); recalcular();
  if (!pt.descripcion) $('#f-descripcion').focus();
}

/* ---------- Pestaña "Presupuesto" ---------- */

async function pestanaPresupuesto(p) {
  const { partidas, espacios, nombreEsp } = await datosPresupuesto(p);
  const cuerpo = $('#tab-body');
  if (!cuerpo) return;
  const pr = p.presupuesto = Object.assign({
    indirectos: ajustes.ppIndirectos == null ? 0 : ajustes.ppIndirectos, utilidad: ajustes.ppUtilidad == null ? 0 : ajustes.ppUtilidad,
    aplicarIva: false, iva: ajustes.ppIva == null ? 16 : ajustes.ppIva, notas: '', vigencia: '', condiciones: ''
  }, p.presupuesto || {});

  const estim = partidas.filter(x => x.tipoCantidad === 'estimada').length, conf = partidas.filter(x => x.tipoCantidad === 'confirmada').length;
  const med = partidas.filter(x => x.tipoCantidad === 'medida').length;
  const sinPrecio = partidas.filter(x => x.precioMaterial == null && x.precioManoObra == null).length;
  const sinCantidad = partidas.filter(x => x.cantidad == null).length;
  const viejas = partidas.filter(x => origenDesactualizado(x, espacios)).length;
  const avisos = [];
  if (estim) avisos.push(`${estim} concepto(s) con cantidad <strong>estimada</strong>: confírmalas antes de presentar el presupuesto.`);
  if (sinPrecio) avisos.push(`${sinPrecio} concepto(s) <strong>sin precio</strong>: no suman al total.`);
  if (sinCantidad) avisos.push(`${sinCantidad} concepto(s) <strong>sin cantidad</strong>.`);
  if (viejas) avisos.push(`${viejas} cantidad(es) medida(s) <strong>cambiaron</strong> en su espacio: actualízalas en el concepto.`);

  cuerpo.innerHTML = `
    <div class="row-between"><h2>Presupuesto</h2><span id="save-status" class="save-status">Los cambios se guardan solos</span></div>
    <div class="banner">Presupuesto <strong>estimado</strong>. Los precios los capturas tú y las medidas fueron capturadas por el usuario: deben verificarse en campo.</div>
    <div class="layout-espacio layout-pres">
      <div class="col-main">
        <div class="card">
          <div class="row-between"><h2>Conceptos del presupuesto</h2><a class="btn" href="#/proyecto/${p.id}/conceptos">Editar conceptos</a></div>
          ${partidas.length ? tablaPartidas(partidas, nombreEsp, espacios, 'Conceptos del presupuesto')
            : `<div class="empty"><p>Aún no hay conceptos.</p><a class="btn primary" href="#/proyecto/${p.id}/conceptos">Agregar conceptos</a></div>`}
        </div>
        <div class="card">
          <h2>Notas y condiciones</h2>
          ${campoTexto('pr-notas', 'Notas', pr.notas, 3)}
          ${campo('pr-vigencia', 'Vigencia (fecha límite)', pr.vigencia, 'date')}
          ${campoTexto('pr-condiciones', 'Condiciones del presupuesto', pr.condiciones, 4)}
        </div>
      </div>
      <aside class="col-side">
        <div class="card resumen" aria-live="polite">
          <h2>Resumen</h2>
          <div class="res"><span>Materiales</span><strong id="t-mat">—</strong></div>
          <div class="res"><span>Mano de obra</span><strong id="t-mo">—</strong></div>
          <div class="res res-fuerte"><span>Costo directo</span><strong id="t-dir">—</strong></div>
          <div class="res res-input"><label for="f-indirectos">Indirectos</label><span class="pct"><input id="f-indirectos" inputmode="decimal" autocomplete="off" value="${esc(pr.indirectos)}"><em>%</em></span><strong id="t-ind">—</strong></div>
          <small class="err" id="e-indirectos"></small>
          <div class="res res-input"><label for="f-utilidad">Utilidad</label><span class="pct"><input id="f-utilidad" inputmode="decimal" autocomplete="off" value="${esc(pr.utilidad)}"><em>%</em></span><strong id="t-uti">—</strong></div>
          <small class="err" id="e-utilidad"></small>
          <div class="res res-fuerte"><span>Subtotal</span><strong id="t-sub">—</strong></div>
          <div class="res res-input"><span class="iva-sw"><button type="button" role="switch" class="switch" id="sw-iva" aria-checked="${pr.aplicarIva}" aria-label="Aplicar IVA"><span class="knob"></span></button><label id="l-iva" for="f-iva">IVA</label></span>
            <span class="pct"><input id="f-iva" inputmode="decimal" autocomplete="off" value="${esc(pr.iva)}"><em>%</em></span><strong id="t-iva">—</strong></div>
          <small class="err" id="e-iva"></small>
          <p class="muted small" id="ayuda-iva"></p>
          <div class="total-estimado"><span>Total estimado</span><strong id="t-total">—</strong></div>
        </div>
        <div class="card">
          <h2>Cantidades</h2>
          <p class="chips-info"><span class="badge tq-medida">${med} medida(s)</span> <span class="badge tq-estimada">${estim} estimada(s)</span> <span class="badge tq-confirmada">${conf} confirmada(s)</span></p>
          ${avisos.length ? `<ul class="avisos">${avisos.map(a => `<li>${a}</li>`).join('')}</ul>` : (partidas.length ? '<p class="muted small">Sin pendientes: todos los conceptos tienen cantidad y precio.</p>' : '')}
          ${partidas.length && p.estado !== 'presupuestado' ? '<button type="button" class="btn" id="marcar">Marcar proyecto como Presupuestado</button>' : ''}
        </div>
      </aside>
    </div>`;
  filasNavegables(cuerpo);

  const guardar = () => { p.actualizado = ahora(); programarGuardado(() => dbGuardar('proyectos', p)); };
  const recalcular = () => {
    const t = calcularPresupuesto(partidas, { indirectos: pr.indirectos || 0, utilidad: pr.utilidad || 0, aplicarIva: pr.aplicarIva, iva: pr.iva || 0 });
    $('#t-mat').textContent = formatoPesos(t.material); $('#t-mo').textContent = formatoPesos(t.manoObra); $('#t-dir').textContent = formatoPesos(t.directo);
    $('#t-ind').textContent = formatoPesos(t.indirectos); $('#t-uti').textContent = formatoPesos(t.utilidad); $('#t-sub').textContent = formatoPesos(t.subtotal);
    $('#t-iva').textContent = pr.aplicarIva ? formatoPesos(t.iva) : '—';
    $('#t-total').textContent = formatoMXN(t.total);
    $('#l-iva').textContent = pr.aplicarIva ? 'IVA aplicado' : 'IVA (no aplicado)';
    $('#ayuda-iva').textContent = pr.aplicarIva ? '' : 'El IVA no se suma al total hasta que lo actives y confirmes.';
  };
  enlazarCampo('indirectos', leerPorcentaje, v => { pr.indirectos = v == null ? 0 : v; }, { alCambiar: () => { recalcular(); guardar(); } });
  enlazarCampo('utilidad', leerPorcentaje, v => { pr.utilidad = v == null ? 0 : v; }, { alCambiar: () => { recalcular(); guardar(); } });
  enlazarCampo('iva', leerPorcentaje, v => { pr.iva = v == null ? 0 : v; }, { alCambiar: () => { recalcular(); guardar(); } });
  $('#sw-iva').addEventListener('click', async () => {
    if (!pr.aplicarIva) {
      if (!await confirmar('Aplicar IVA', `¿Sumar el IVA (${pr.iva} %) al total de este presupuesto? ObraPro no lo aplica sin tu confirmación.`, 'Aplicar IVA', false)) return;
      pr.aplicarIva = true;
    } else pr.aplicarIva = false;
    $('#sw-iva').setAttribute('aria-checked', String(pr.aplicarIva)); recalcular(); guardar();
  });
  $('#f-pr-notas').addEventListener('input', e => { pr.notas = e.target.value; guardar(); });
  $('#f-pr-vigencia').addEventListener('input', e => { pr.vigencia = e.target.value; guardar(); });
  $('#f-pr-condiciones').addEventListener('input', e => { pr.condiciones = e.target.value; guardar(); });
  const mk = $('#marcar');
  if (mk) mk.addEventListener('click', async () => {
    p.estado = 'presupuestado'; p.actualizado = ahora(); await dbGuardar('proyectos', p);
    aviso('Proyecto marcado como Presupuestado.'); enrutar();
  });
  recalcular();
}

/* ---------- Valores predeterminados (se muestran en Ajustes) ---------- */

function seccionAjustesPresupuesto() {
  return `<section class="card">
    <h2>Presupuestos</h2>
    <p class="muted">Porcentajes con los que se abre el presupuesto de un proyecto. En cada proyecto los puedes cambiar. El IVA nunca se suma sin que lo confirmes.</p>
    <div class="grid3">
      ${campoNum('a-ppIndirectos', 'Costos indirectos', ajustes.ppIndirectos, '%')}
      ${campoNum('a-ppUtilidad', 'Utilidad', ajustes.ppUtilidad, '%')}
      ${campoNum('a-ppIva', 'IVA', ajustes.ppIva, '%')}
    </div>
  </section>`;
}
function conectarAjustesPresupuesto() {
  for (const [id, clave, defecto] of [['a-ppIndirectos', 'ppIndirectos', 0], ['a-ppUtilidad', 'ppUtilidad', 0], ['a-ppIva', 'ppIva', 16]]) {
    enlazarCampo(id, leerPorcentaje, v => { ajustes[clave] = v == null ? defecto : v; }, { alCambiar: () => programarGuardado(guardarAjustes) });
  }
}
