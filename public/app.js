/* ObraPro - app.js
   Pantallas y navegación. Etapa 4: proyectos, espacios, medidas,
   guardado local y copia de seguridad. */
'use strict';

const VERSION_APP = '0.7.0 (Etapa 5: fotos)';

/* Íconos dibujados (la tipografía Lato no incluye ✓ ni ✕) */
const ICONO_CHECK = '<svg class="ico-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
const ICONO_X = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICONO_CASA = '<img class="empty-ico" src="logo-sm.png" alt="" width="84" height="87">';
let _tramoNuevo = -1;

const ESTADOS = [
  ['pendiente', 'Pendiente'],
  ['levantamiento', 'En levantamiento'],
  ['presupuestado', 'Presupuestado'],
  ['ejecucion', 'En ejecución'],
  ['terminado', 'Terminado']
];
const TIPOS_TRABAJO = [
  ['construccion', 'Construcción'],
  ['remodelacion', 'Remodelación'],
  ['ampliacion', 'Ampliación'],
  ['mantenimiento', 'Mantenimiento'],
  ['otro', 'Otro']
];
const TIPOS_ESPACIO = ['Sala', 'Cocina', 'Baño', 'Recámara', 'Patio', 'Fachada', 'Local comercial', 'Otro'];
const ESTADOS_ESPACIO = [
  ['bueno', 'Buen estado'],
  ['regular', 'Regular'],
  ['malo', 'Mal estado'],
  ['obra_negra', 'Obra negra']
];
const AVISO_MEDIDAS = 'Las medidas son capturadas por el usuario y deben verificarse en campo.';

/* ---------- Utilidades ---------- */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function opciones(lista, sel) {
  return lista.map(([v, t]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(t)}</option>`).join('');
}
function etiqueta(lista, v) {
  const f = lista.find(x => x[0] === v);
  return f ? f[1] : '—';
}
function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function num(x) {
  if (x == null) return '—';
  return redondear2(x).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ahora() { return new Date().toISOString(); }

/* Cambia el texto de un resultado y lo "resalta" solo si cambió. */
function ponerValor(sel, texto) {
  const el = $(sel);
  if (!el || el.textContent === texto) return;
  el.textContent = texto;
  el.classList.toggle('long', texto.length > 12);   /* textos como "Captúralo a mano" van más chicos */
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
function textoNumero(v) { return v == null ? '' : String(v); }

/* Aviso breve en la parte inferior. */
let _toastTimer = null;
function aviso(texto, tipo = '') {
  const t = $('#toast');
  t.textContent = texto;
  t.className = 'show ' + tipo;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}

/* Ventana de confirmación. Devuelve true si el usuario acepta. */
function confirmar(titulo, mensaje, textoBoton = 'Eliminar', peligro = true) {
  const dlg = $('#dlg');
  $('#dlg-title').textContent = titulo;
  $('#dlg-msg').textContent = mensaje;
  const ok = $('#dlg-ok');
  ok.textContent = textoBoton;
  ok.className = 'btn ' + (peligro ? 'danger' : 'primary');
  return new Promise(resolve => {
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok');
    dlg.showModal();
  });
}

/* Guardado automático con espera corta. */
let _pendiente = null;
function programarGuardado(fn, ms = 500) {
  if (_pendiente) clearTimeout(_pendiente.timer);
  estadoGuardado('Guardando…', 'guardando');
  _pendiente = { fn, timer: setTimeout(guardarPendiente, ms) };
}
async function guardarPendiente() {
  if (!_pendiente) return;
  clearTimeout(_pendiente.timer);
  const fn = _pendiente.fn;
  _pendiente = null;
  try {
    await fn();
    estadoGuardado('Guardado', 'guardado');
  } catch (e) {
    console.error(e);
    estadoGuardado('No se pudo guardar', 'error');
    aviso('No se pudo guardar: ' + e.message, 'error');
  }
}
function estadoGuardado(texto, tipo = '') {
  const el = $('#save-status');
  if (!el) return;
  el.dataset.estado = tipo;
  const icono = tipo === 'guardado' ? ICONO_CHECK : tipo === 'guardando' ? '<i class="dot"></i>' : '';
  el.innerHTML = icono + esc(texto);
}
/* Si la app se oculta o se cierra, guarda lo que esté pendiente. */
document.addEventListener('visibilitychange', () => { if (document.hidden) guardarPendiente(); });
window.addEventListener('pagehide', () => { guardarPendiente(); });

/* Ajustes en memoria */
let ajustes = { id: 'app', unidad: 'm', responsable: '', ultimoRespaldo: null };
async function cargarAjustes() {
  const a = await dbObtener('ajustes', 'app');
  if (a) ajustes = Object.assign(ajustes, a);
}
async function guardarAjustes() { await dbGuardar('ajustes', ajustes); }

/* Campos de formulario */
function campo(nombre, texto, valor, tipo = 'text', extra = '') {
  return `<label class="field"><span>${texto}</span>
    <input name="${nombre}" id="f-${nombre}" type="${tipo}" value="${esc(valor)}" ${extra}>
    <small class="err" id="e-${nombre}"></small></label>`;
}
function campoMedida(nombre, texto, valor, unidad) {
  return `<label class="field"><span>${texto} <em class="unit-tag">${esc(UNIDADES[unidad].corto)}</em></span>
    <input name="${nombre}" id="f-${nombre}" type="text" inputmode="decimal" autocomplete="off"
      value="${esc(textoNumero(valor))}" placeholder="0.00">
    <small class="err" id="e-${nombre}"></small></label>`;
}
function campoSelect(nombre, texto, lista, valor) {
  return `<label class="field"><span>${texto}</span>
    <select name="${nombre}" id="f-${nombre}">${opciones(lista, valor)}</select></label>`;
}
function campoTexto(nombre, texto, valor, filas = 3) {
  return `<label class="field"><span>${texto}</span>
    <textarea name="${nombre}" id="f-${nombre}" rows="${filas}">${esc(valor)}</textarea></label>`;
}
function mostrarError(nombre, msg) {
  const e = $('#e-' + nombre);
  const i = $('#f-' + nombre);
  if (e) e.textContent = msg || '';
  if (i) {
    i.classList.toggle('invalid', !!msg);
    i.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
}

/* ---------- Navegación ---------- */

const main = () => $('#main');

async function enrutar() {
  await guardarPendiente();
  limpiarVista();
  const partes = (location.hash.replace(/^#\/?/, '') || 'proyectos').split('/');
  const [vista, id, pestana] = partes;
  marcarMenu(vista);
  try {
    switch (vista) {
      case 'proyectos': await vistaProyectos(false); break;
      case 'archivados': await vistaProyectos(true); break;
      case 'nuevo': await vistaNuevoProyecto(); break;
      case 'proyecto': await vistaProyecto(id, pestana || 'datos'); break;
      case 'espacio': await vistaEspacio(id); break;
      case 'foto': await vistaFoto(id); break;
      case 'catalogo': vistaCatalogo(); break;
      case 'ajustes': await vistaAjustes(); break;
      default: location.hash = '#/proyectos'; return;
    }
  } catch (e) {
    console.error(e);
    main().innerHTML = `<div class="card error-box"><h2>Ocurrió un error</h2><p>${esc(e.message)}</p>
      <a class="btn" href="#/proyectos">Volver a proyectos</a></div>`;
  }
  window.scrollTo(0, 0);
  /* Animación de entrada: se reinicia en cada pantalla y se retira al terminar,
     para que buscar o escribir no vuelva a animar las tarjetas. */
  const m = main();
  m.classList.remove('enter');
  void m.offsetWidth;
  m.classList.add('enter');
  clearTimeout(enrutar._t);
  enrutar._t = setTimeout(() => m.classList.remove('enter'), 1000);
}

function marcarMenu(vista) {
  const mapa = { proyecto: 'proyectos', espacio: 'proyectos', foto: 'proyectos', nuevo: 'proyectos' };
  const activo = mapa[vista] || vista;
  $$('#nav a[data-view]').forEach(a => {
    const on = a.dataset.view === activo;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/* ---------- Lista de proyectos ---------- */

async function vistaProyectos(archivados) {
  const [proyectos, espacios] = await Promise.all([dbTodos('proyectos'), dbTodos('espacios')]);
  const conteo = {};
  espacios.forEach(s => { conteo[s.proyectoId] = (conteo[s.proyectoId] || 0) + 1; });
  const lista = proyectos
    .filter(p => !!p.archivado === archivados)
    .sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));

  const necesitaRespaldo = !archivados && proyectos.length > 0 &&
    (!ajustes.ultimoRespaldo || (Date.now() - new Date(ajustes.ultimoRespaldo)) > 7 * 864e5);

  main().innerHTML = `
    <header class="page-head">
      <h1>${archivados ? 'Proyectos archivados' : 'Proyectos'}</h1>
      ${archivados ? '' : '<a class="btn primary" href="#/nuevo">+ Nuevo proyecto</a>'}
    </header>
    ${necesitaRespaldo ? `<div class="banner">Hace más de una semana que no haces copia de seguridad.
      <a href="#/ajustes">Hacer copia ahora</a></div>` : ''}
    <div class="toolbar">
      <input id="q" type="search" placeholder="Buscar por nombre, cliente o dirección" aria-label="Buscar proyectos">
      <select id="f-filtro" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${opciones(ESTADOS)}</select>
    </div>
    <div id="lista" class="cards"></div>`;

  const dibujar = () => {
    const q = normalizar($('#q').value);
    const est = $('#f-filtro').value;
    const items = lista.filter(p => (!est || p.estado === est) &&
      (!q || normalizar([p.nombre, p.cliente, p.direccion].join(' ')).includes(q)));
    if (!lista.length) {
      $('#lista').innerHTML = archivados
        ? `<div class="empty">${ICONO_CASA}<p>No hay proyectos archivados.</p></div>`
        : `<div class="empty">${ICONO_CASA}<p>Aún no tienes proyectos.</p><a class="btn primary" href="#/nuevo">Crear el primero</a></div>`;
      return;
    }
    $('#lista').innerHTML = items.length ? items.map(p => `
      <a class="card project-card" data-estado="${esc(p.estado)}" href="#/proyecto/${p.id}/datos">
        <div class="card-top"><h2>${esc(p.nombre)}</h2><span class="badge st-${esc(p.estado)}">${esc(etiqueta(ESTADOS, p.estado))}</span></div>
        <p>${esc(p.cliente)}</p>
        <p class="muted">${esc(p.direccion || 'Sin dirección')}</p>
        <p class="muted small">Levantamiento: ${fecha(p.fecha)} · ${conteo[p.id] || 0} espacio(s) · ${esc(etiqueta(TIPOS_TRABAJO, p.tipoTrabajo))}</p>
      </a>`).join('') : '<p class="empty">Ningún proyecto coincide con la búsqueda.</p>';
  };
  $('#q').addEventListener('input', dibujar);
  $('#f-filtro').addEventListener('change', dibujar);
  dibujar();
}

/* ---------- Formulario de proyecto ---------- */

function formularioProyecto(p) {
  return `
    <form id="pform" novalidate>
      <fieldset><legend>Cliente y obra</legend>
        <div class="grid2">
          ${campo('nombre', 'Nombre del proyecto *', p.nombre, 'text', 'autocomplete="off"')}
          ${campo('cliente', 'Nombre del cliente *', p.cliente, 'text', 'autocomplete="off"')}
          ${campo('telefono', 'Teléfono (opcional)', p.telefono, 'tel', 'inputmode="tel"')}
          ${campo('correo', 'Correo electrónico (opcional)', p.correo, 'email', 'inputmode="email"')}
        </div>
        ${campo('direccion', 'Dirección de la obra', p.direccion)}
        <div class="grid2">
          ${campoSelect('tipoTrabajo', 'Tipo de trabajo', TIPOS_TRABAJO, p.tipoTrabajo)}
          ${campoSelect('estado', 'Estado del proyecto', ESTADOS, p.estado)}
        </div>
      </fieldset>
      <fieldset><legend>Levantamiento</legend>
        <div class="grid2">
          ${campo('fecha', 'Fecha del levantamiento', p.fecha, 'date')}
          ${campo('responsable', 'Responsable', p.responsable)}
        </div>
        ${campoTexto('observaciones', 'Observaciones generales', p.observaciones, 4)}
      </fieldset>
    </form>`;
}

function leerFormulario(form) {
  const d = {};
  for (const [k, v] of new FormData(form).entries()) d[k] = String(v).trim();
  return d;
}

function validarProyecto(d) {
  const err = {};
  if (!d.nombre) err.nombre = 'Escribe el nombre del proyecto.';
  if (!d.cliente) err.cliente = 'Escribe el nombre del cliente.';
  if (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) err.correo = 'El correo no parece válido.';
  if (d.telefono && !/^[\d\s()+-]{7,20}$/.test(d.telefono)) err.telefono = 'Usa solo números, espacios o guiones.';
  return err;
}

function pintarErrores(err) {
  ['nombre', 'cliente', 'correo', 'telefono'].forEach(n => mostrarError(n, err[n]));
}

/* ---------- Nuevo proyecto (con borrador) ---------- */

async function vistaNuevoProyecto() {
  const borrador = await dbObtener('ajustes', 'borrador-proyecto');
  const base = {
    nombre: '', cliente: '', telefono: '', correo: '', direccion: '',
    tipoTrabajo: 'remodelacion', estado: 'levantamiento', fecha: hoy(),
    responsable: ajustes.responsable || '', observaciones: ''
  };
  const p = Object.assign(base, borrador ? borrador.datos : {});

  main().innerHTML = `
    <header class="page-head">
      <a class="btn ghost" href="#/proyectos">← Atrás</a>
      <h1>Nuevo proyecto</h1>
      <span id="save-status" class="save-status">${borrador ? 'Borrador recuperado' : ''}</span>
    </header>
    <p class="muted">El formulario se guarda como borrador mientras escribes. Los campos con * son obligatorios.</p>
    ${formularioProyecto(p)}
    <div class="actions">
      <button class="btn primary big" id="crear">Crear proyecto</button>
      ${borrador ? '<button class="btn ghost" id="descartar">Descartar borrador</button>' : ''}
    </div>`;

  const form = $('#pform');
  form.addEventListener('input', () => {
    programarGuardado(() => dbGuardar('ajustes', { id: 'borrador-proyecto', datos: leerFormulario(form) }), 700);
  });
  form.addEventListener('submit', e => e.preventDefault());

  $('#crear').addEventListener('click', async () => {
    const d = leerFormulario(form);
    const err = validarProyecto(d);
    pintarErrores(err);
    if (Object.keys(err).length) {
      aviso('Revisa los campos marcados en rojo.', 'error');
      $('#f-' + Object.keys(err)[0]).focus();
      return;
    }
    _pendiente && clearTimeout(_pendiente.timer);
    _pendiente = null;
    const nuevo = Object.assign({ id: nuevoId(), archivado: false, creado: ahora(), actualizado: ahora() }, d);
    await dbGuardar('proyectos', nuevo);
    await dbBorrar('ajustes', 'borrador-proyecto');
    aviso('Proyecto creado.');
    location.hash = `#/proyecto/${nuevo.id}/espacios`;
  });

  const desc = $('#descartar');
  if (desc) desc.addEventListener('click', async () => {
    if (await confirmar('Descartar borrador', 'Se borrarán los datos escritos en este formulario.', 'Descartar')) {
      _pendiente && clearTimeout(_pendiente.timer);
      _pendiente = null;
      await dbBorrar('ajustes', 'borrador-proyecto');
      enrutar();
    }
  });
  $('#f-nombre').focus();
}

/* ---------- Detalle de proyecto ---------- */

const PESTANAS = [
  ['datos', 'Datos', true],
  ['espacios', 'Espacios', true],
  ['fotos', 'Fotos', true],
  ['conceptos', 'Conceptos', false],
  ['presupuesto', 'Presupuesto', false],
  ['reporte', 'Reporte', false]
];

async function vistaProyecto(id, pestana) {
  const p = await dbObtener('proyectos', id);
  if (!p) {
    main().innerHTML = '<div class="card"><p>No se encontró el proyecto.</p><a class="btn" href="#/proyectos">Volver</a></div>';
    return;
  }
  if (!PESTANAS.find(t => t[0] === pestana && t[2])) pestana = 'datos';

  main().innerHTML = `
    <header class="page-head">
      <a class="btn ghost" href="#/${p.archivado ? 'archivados' : 'proyectos'}">← Atrás</a>
      <div class="title-block">
        <h1 id="titulo">${esc(p.nombre)}</h1>
        <p class="muted" id="subtitulo">${esc(p.cliente)}${p.direccion ? ' · ' + esc(p.direccion) : ''}</p>
      </div>
      <span class="badge st-${esc(p.estado)}" id="badge">${esc(etiqueta(ESTADOS, p.estado))}</span>
    </header>
    ${p.archivado ? '<div class="banner">Este proyecto está archivado.</div>' : ''}
    <nav class="tabs" aria-label="Secciones del proyecto">
      ${PESTANAS.map(([k, t, on]) => on
        ? `<a href="#/proyecto/${id}/${k}" class="tab${k === pestana ? ' active' : ''}"${k === pestana ? ' aria-current="page"' : ''}>${t}</a>`
        : `<span class="tab disabled" title="Disponible en una próxima etapa">${t} <em class="pronto">Pronto</em></span>`).join('')}
    </nav>
    <section id="tab-body"></section>`;

  if (pestana === 'espacios') await pestanaEspacios(p);
  else if (pestana === 'fotos') await pestanaFotos(p);
  else pestanaDatos(p);
}

function pestanaDatos(p) {
  $('#tab-body').innerHTML = `
    <div class="row-between"><h2>Datos del proyecto</h2><span id="save-status" class="save-status">Los cambios se guardan solos</span></div>
    ${formularioProyecto(p)}
    <div class="actions danger-zone">
      <button class="btn" id="archivar">${p.archivado ? 'Restaurar proyecto' : 'Archivar proyecto'}</button>
      <button class="btn danger-outline" id="eliminar">Eliminar proyecto</button>
    </div>`;

  const form = $('#pform');
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => {
    const d = leerFormulario(form);
    const err = validarProyecto(d);
    pintarErrores(err);
    for (const k of Object.keys(d)) if (!err[k]) p[k] = d[k];
    $('#titulo').textContent = p.nombre;
    $('#subtitulo').textContent = p.cliente + (p.direccion ? ' · ' + p.direccion : '');
    const b = $('#badge');
    b.textContent = etiqueta(ESTADOS, p.estado);
    b.className = 'badge st-' + p.estado;
    p.actualizado = ahora();
    programarGuardado(() => dbGuardar('proyectos', p));
  });

  $('#archivar').addEventListener('click', async () => {
    await guardarPendiente();
    p.archivado = !p.archivado;
    p.actualizado = ahora();
    await dbGuardar('proyectos', p);
    aviso(p.archivado ? 'Proyecto archivado.' : 'Proyecto restaurado.');
    location.hash = p.archivado ? '#/archivados' : '#/proyectos';
  });

  $('#eliminar').addEventListener('click', async () => {
    const ok = await confirmar('Eliminar proyecto',
      `¿Eliminar "${p.nombre}" y todos sus espacios? Esta acción no se puede deshacer.`);
    if (!ok) return;
    _pendiente && clearTimeout(_pendiente.timer);
    _pendiente = null;
    await dbBorrarProyecto(p.id);
    aviso('Proyecto eliminado.');
    location.hash = '#/proyectos';
  });
}

/* ---------- Pestaña de espacios ---------- */

async function pestanaEspacios(p) {
  const espacios = (await dbPorProyecto('espacios', p.id))
    .sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.creado || '').localeCompare(b.creado || ''));
  let total = 0, totalMuros = 0;
  const filas = espacios.map(s => {
    const c = calcularEspacio(s);
    if (c.superficie) total += redondear2(c.superficie);
    if (c.muros) totalMuros += redondear2(c.muros);
    const medidas = s.forma === 'irregular'
      ? `${(s.tramos || []).length} tramo(s)`
      : (s.largo && s.ancho ? `${textoNumero(s.largo)} × ${textoNumero(s.ancho)} ${UNIDADES[s.unidad].corto}` : 'Sin medidas');
    return `<tr data-id="${s.id}" tabindex="0">
      <td><a href="#/espacio/${s.id}"><strong>${esc(s.nombre || 'Sin nombre')}</strong></a>
        ${s.forma === 'irregular' ? '<span class="tag">Irregular</span>' : ''}</td>
      <td data-label="Medidas">${esc(medidas)}</td>
      <td class="n" data-label="Superficie">${c.superficie != null ? num(c.superficie) + ' m²' : '—'}</td>
      <td class="n" data-label="Perímetro">${c.perimetro != null ? num(c.perimetro) + ' m' : '—'}</td>
      <td class="n" data-label="Muros">${c.muros != null ? num(c.muros) + ' m²' : '—'}</td>
      <td data-label="Estado">${esc(etiqueta(ESTADOS_ESPACIO, s.estadoActual))}</td>
    </tr>`;
  }).join('');

  $('#tab-body').innerHTML = `
    <div class="row-between">
      <h2>Espacios (${espacios.length})</h2>
      <button class="btn primary" id="agregar">+ Agregar espacio</button>
    </div>
    ${espacios.length ? `
      <div class="table-wrap"><table class="tabla">
        <thead><tr><th>Espacio</th><th>Medidas</th><th class="n">Superficie</th><th class="n">Perímetro</th><th class="n">Muros</th><th>Estado</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="n" data-label="Superficie">${num(total)} m²</td><td></td><td class="n" data-label="Muros">${num(totalMuros)} m²</td><td></td></tr></tfoot>
      </table></div>
      <p class="note">${AVISO_MEDIDAS} La superficie de muros es bruta: no descuenta puertas ni ventanas.</p>`
    : '<div class="empty"><p>Este proyecto aún no tiene espacios.</p></div>'}`;

  $$('#tab-body tbody tr').forEach(tr => {
    const ir = () => { location.hash = '#/espacio/' + tr.dataset.id; };
    tr.addEventListener('click', e => { if (!e.target.closest('a')) ir(); });
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') ir(); });
  });

  $('#agregar').addEventListener('click', async () => {
    const s = {
      id: nuevoId(), proyectoId: p.id, nombre: '', tipo: '', unidad: ajustes.unidad || 'm',
      forma: 'rectangular', largo: null, ancho: null, altura: null, tramos: [], perimetroManual: null,
      estadoActual: 'regular', trabajos: '', observaciones: '',
      orden: espacios.length, creado: ahora(), actualizado: ahora()
    };
    await dbGuardar('espacios', s);
    p.actualizado = ahora();
    await dbGuardar('proyectos', p);
    location.hash = '#/espacio/' + s.id;
  });
}

/* ---------- Editor de espacio ---------- */

async function vistaEspacio(id) {
  const s = await dbObtener('espacios', id);
  if (!s) {
    main().innerHTML = '<div class="card"><p>No se encontró el espacio.</p><a class="btn" href="#/proyectos">Volver</a></div>';
    return;
  }
  const p = await dbObtener('proyectos', s.proyectoId);
  s.tramos = s.tramos || [];

  const guardar = () => {
    s.actualizado = ahora();
    programarGuardado(async () => {
      await dbGuardar('espacios', s);
      if (p) { p.actualizado = s.actualizado; await dbGuardar('proyectos', p); }
    });
  };

  main().innerHTML = `
    <header class="page-head">
      <a class="btn ghost" href="#/proyecto/${s.proyectoId}/espacios">← Espacios</a>
      <div class="title-block">
        <h1 id="titulo">${esc(s.nombre || 'Nuevo espacio')}</h1>
        <p class="muted">${esc(p ? p.nombre : '')}</p>
      </div>
      <span id="save-status" class="save-status">Los cambios se guardan solos</span>
    </header>

    <div class="layout-espacio">
      <form id="sform" novalidate class="col-main">
        <fieldset><legend>Espacio</legend>
          <div class="chips" role="group" aria-label="Tipo de espacio">
            ${TIPOS_ESPACIO.map(t => `<button type="button" class="chip${s.tipo === t ? ' on' : ''}" data-tipo="${esc(t)}">${esc(t)}</button>`).join('')}
          </div>
          ${campo('nombre', 'Nombre del espacio', s.nombre, 'text', 'placeholder="Ej. Recámara principal" autocomplete="off"')}
          <div class="grid2">
            <label class="field"><span>Unidad de medida</span>
              <select name="unidad" id="f-unidad">${Object.entries(UNIDADES).map(([k, u]) =>
                `<option value="${k}"${s.unidad === k ? ' selected' : ''}>${u.nombre} (${u.corto})</option>`).join('')}</select></label>
            <label class="field"><span>Forma</span>
              <select name="forma" id="f-forma">
                <option value="rectangular"${s.forma !== 'irregular' ? ' selected' : ''}>Rectangular</option>
                <option value="irregular"${s.forma === 'irregular' ? ' selected' : ''}>Irregular (por tramos)</option>
              </select></label>
          </div>
        </fieldset>

        <fieldset id="medidas"><legend>Medidas</legend><div id="medidas-body"></div></fieldset>

        <fieldset><legend>Condición y trabajos</legend>
          ${campoSelect('estadoActual', 'Estado actual', ESTADOS_ESPACIO, s.estadoActual)}
          ${campoTexto('trabajos', 'Trabajos que se necesitan', s.trabajos, 3)}
          ${campoTexto('observaciones', 'Observaciones', s.observaciones, 3)}
        </fieldset>

        <div id="fotos-espacio"></div>

        <div class="actions danger-zone">
          <button type="button" class="btn danger-outline" id="eliminar">Eliminar espacio</button>
        </div>
      </form>

      <aside class="col-side">
        <div class="card resultados" aria-live="polite">
          <h2>Resultados</h2>
          <div class="res"><span>Superficie de piso</span><strong id="r-sup">—</strong></div>
          <div class="res"><span>Perímetro</span><strong id="r-per">—</strong></div>
          <div class="res"><span>Superficie de muros (bruta)</span><strong id="r-mur">—</strong></div>
          <p class="warn" id="r-aviso" hidden></p>
          <p class="note">Resultados convertidos a metros. ${AVISO_MEDIDAS}</p>
        </div>
      </aside>
    </div>`;

  const form = $('#sform');
  form.addEventListener('submit', e => e.preventDefault());

  const actualizarResultados = () => {
    const c = calcularEspacio(s);
    ponerValor('#r-sup', c.superficie != null ? num(c.superficie) + ' m²' : '—');
    ponerValor('#r-per', c.perimetro != null ? num(c.perimetro) + ' m'
      : (s.forma === 'irregular' ? 'Captúralo a mano' : '—'));
    ponerValor('#r-mur', c.muros != null ? num(c.muros) + ' m²' : (s.altura ? '—' : 'Falta altura'));
    const av = $('#r-aviso');
    av.hidden = !c.aviso;
    av.textContent = c.aviso || '';
    $$('[data-tramo-sup]').forEach(el => {
      const t = s.tramos[+el.dataset.tramoSup];
      const v = t ? superficieTramo(t, s.unidad) : null;
      el.textContent = v != null ? (t.signo === -1 ? '−' : '+') + num(v) + ' m²' : '—';
    });
  };

  /* Valida un campo de medida y lo guarda si es correcto. */
  const aplicarMedida = (input, etiquetaTxt, obligatoria, asignar, alSalir) => {
    const r = validarMedida(input.value, etiquetaTxt, obligatoria);
    const mostrar = r.error && (alSalir || !leerNumero(input.value).vacio);
    input.classList.toggle('invalid', !!mostrar);
    const err = input.parentElement.querySelector('.err');
    if (err) err.textContent = mostrar ? r.error : '';
    if (leerNumero(input.value).vacio) asignar(null);   /* campo borrado */
    else if (!r.error) asignar(r.valor);                /* valor correcto */
    /* si hay error, se conserva el último valor correcto */
  };

  const pintarMedidas = () => {
    const u = s.unidad;
    if (s.forma === 'irregular') {
      $('#medidas-body').innerHTML = `
        <p class="muted small">Divide el espacio en rectángulos. Usa "Resta" para huecos, columnas o recortes.</p>
        <div id="tramos">${s.tramos.map((t, i) => `
          <div class="tramo${i === _tramoNuevo ? ' nuevo' : ''}" data-i="${i}">
            <label class="field"><span>Descripción</span><input data-k="descripcion" value="${esc(t.descripcion)}" placeholder="Tramo ${i + 1}"></label>
            <label class="field"><span>Largo <em class="unit-tag">${UNIDADES[u].corto}</em></span>
              <input data-k="largo" inputmode="decimal" autocomplete="off" value="${esc(textoNumero(t.largo))}" placeholder="0.00"><small class="err"></small></label>
            <label class="field"><span>Ancho <em class="unit-tag">${UNIDADES[u].corto}</em></span>
              <input data-k="ancho" inputmode="decimal" autocomplete="off" value="${esc(textoNumero(t.ancho))}" placeholder="0.00"><small class="err"></small></label>
            <label class="field"><span>Operación</span>
              <select data-k="signo"><option value="1"${t.signo !== -1 ? ' selected' : ''}>Suma</option><option value="-1"${t.signo === -1 ? ' selected' : ''}>Resta</option></select></label>
            <div class="tramo-sup" data-tramo-sup="${i}">—</div>
            <button type="button" class="btn icon danger-outline" data-quitar="${i}" aria-label="Quitar tramo ${i + 1}">${ICONO_X}</button>
          </div>`).join('')}
        </div>
        <button type="button" class="btn" id="agregar-tramo">+ Agregar tramo</button>
        <div class="grid2 mt">
          ${campoMedida('perimetroManual', 'Perímetro (opcional, a mano)', s.perimetroManual, u)}
          ${campoMedida('altura', 'Altura (opcional)', s.altura, u)}
        </div>`;

      $$('#tramos .tramo').forEach(fila => {
        const i = +fila.dataset.i;
        fila.addEventListener('input', ev => {
          const k = ev.target.dataset.k;
          const t = s.tramos[i];
          if (k === 'descripcion') t.descripcion = ev.target.value;
          if (k === 'largo' || k === 'ancho') aplicarMedida(ev.target, 'el ' + k, true, v => { if (v !== undefined) t[k] = v; }, false);
          if (k === 'signo') t.signo = +ev.target.value;
          actualizarResultados(); guardar();
        });
        fila.addEventListener('change', ev => {
          const k = ev.target.dataset.k;
          if (k === 'largo' || k === 'ancho') aplicarMedida(ev.target, 'el ' + k, true, () => {}, true);
          if (k === 'signo') { s.tramos[i].signo = +ev.target.value; actualizarResultados(); guardar(); }
        });
      });
      $$('[data-quitar]').forEach(b => b.addEventListener('click', async () => {
        const i = +b.dataset.quitar;
        const nombre = s.tramos[i].descripcion || 'Tramo ' + (i + 1);
        if (await confirmar('Quitar tramo', `¿Quitar "${nombre}"?`, 'Quitar')) {
          s.tramos.splice(i, 1);
          guardar(); pintarMedidas();
        }
      }));
      $('#agregar-tramo').addEventListener('click', () => {
        s.tramos.push({ id: nuevoId(), descripcion: '', largo: null, ancho: null, signo: 1 });
        _tramoNuevo = s.tramos.length - 1;
        guardar(); pintarMedidas();
        const ins = $$('#tramos [data-k="largo"]');
        ins[ins.length - 1].focus();
      });
    } else {
      $('#medidas-body').innerHTML = `
        <div class="grid3">
          ${campoMedida('largo', 'Largo *', s.largo, u)}
          ${campoMedida('ancho', 'Ancho *', s.ancho, u)}
          ${campoMedida('altura', 'Altura (opcional)', s.altura, u)}
        </div>`;
    }

    const conectar = (nombre, etiquetaTxt, obligatoria) => {
      const inp = $('#f-' + nombre);
      if (!inp) return;
      inp.addEventListener('input', () => {
        aplicarMedida(inp, etiquetaTxt, obligatoria, v => { if (v !== undefined) s[nombre] = v; }, false);
        actualizarResultados(); guardar();
      });
      inp.addEventListener('change', () => aplicarMedida(inp, etiquetaTxt, obligatoria, () => {}, true));
    };
    conectar('largo', 'el largo', true);
    conectar('ancho', 'el ancho', true);
    conectar('altura', 'la altura', false);
    conectar('perimetroManual', 'el perímetro', false);
    actualizarResultados();
    _tramoNuevo = -1;
  };

  pintarMedidas();

  /* Tipo de espacio con botones rápidos */
  $$('.chip').forEach(ch => ch.addEventListener('click', () => {
    const anterior = s.tipo;
    s.tipo = ch.dataset.tipo;
    $$('.chip').forEach(c => c.classList.toggle('on', c === ch));
    const inp = $('#f-nombre');
    if (!inp.value.trim() || inp.value.trim() === anterior) {
      inp.value = s.tipo === 'Otro' ? '' : s.tipo;
      s.nombre = inp.value;
      $('#titulo').textContent = s.nombre || 'Nuevo espacio';
      if (s.tipo === 'Otro') inp.focus();
    }
    guardar();
  }));

  $('#f-nombre').addEventListener('input', e => {
    s.nombre = e.target.value.trim();
    $('#titulo').textContent = s.nombre || 'Nuevo espacio';
    guardar();
  });
  $('#f-unidad').addEventListener('change', e => {
    s.unidad = e.target.value; pintarMedidas(); guardar();
  });
  $('#f-forma').addEventListener('change', e => {
    s.forma = e.target.value;
    if (s.forma === 'irregular' && !s.tramos.length) {
      s.tramos.push({ id: nuevoId(), descripcion: '', largo: s.largo, ancho: s.ancho, signo: 1 });
    }
    pintarMedidas(); guardar();
  });
  ['estadoActual', 'trabajos', 'observaciones'].forEach(n => {
    $('#f-' + n).addEventListener('input', e => { s[n] = e.target.value; guardar(); });
  });

  $('#eliminar').addEventListener('click', async () => {
    const ok = await confirmar('Eliminar espacio', `¿Eliminar "${s.nombre || 'este espacio'}"? Sus fotos se conservarán como fotos sin espacio. Esta acción no se puede deshacer.`);
    if (!ok) return;
    _pendiente && clearTimeout(_pendiente.timer);
    _pendiente = null;
    await desvincularFotos(s.id);
    await dbBorrar('espacios', s.id);
    aviso('Espacio eliminado.');
    location.hash = `#/proyecto/${s.proyectoId}/espacios`;
  });

  montarFotosEspacio($('#fotos-espacio'), s);
  if (!s.nombre) $('#f-nombre').focus();
}

/* ---------- Catálogo (Etapa 6) ---------- */

function vistaCatalogo() {
  main().innerHTML = `
    <header class="page-head"><h1>Catálogo de conceptos</h1></header>
    <div class="card"><p>El catálogo de trabajos (demolición, pintura, pisos…) llegará en la Etapa 6.</p></div>`;
}

/* ---------- Ajustes ---------- */

async function vistaAjustes() {
  const puedeCompartir = !!(navigator.canShare && window.File &&
    navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }));
  let persistente = null, uso = '', usoFotos = '';
  try {
    const fs = await dbTodos('fotos');
    const bytes = fs.reduce((t, x) => t + ((x.imagen && x.imagen.size) || 0) + ((x.miniatura && x.miniatura.size) || 0), 0);
    usoFotos = `Fotos guardadas: ${fs.length} (${(bytes / 1048576).toFixed(1)} MB).`;
  } catch (e) { /* sin dato */ }
  if (navigator.storage) {
    try { if (navigator.storage.persisted) persistente = await navigator.storage.persisted(); } catch (e) { /* sin soporte */ }
    try {
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        uso = `Espacio usado por la app: ${(est.usage / 1048576).toFixed(1)} MB.`;
      }
    } catch (e) { /* sin soporte */ }
  }

  main().innerHTML = `
    <header class="page-head"><h1>Ajustes</h1><span id="save-status" class="save-status"></span></header>

    <section class="card">
      <h2>Valores predeterminados</h2>
      <div class="grid2">
        <label class="field"><span>Unidad para espacios nuevos</span>
          <select id="a-unidad">${Object.entries(UNIDADES).map(([k, u]) =>
            `<option value="${k}"${ajustes.unidad === k ? ' selected' : ''}>${u.nombre} (${u.corto})</option>`).join('')}</select></label>
        <label class="field"><span>Responsable para proyectos nuevos</span>
          <input id="a-resp" value="${esc(ajustes.responsable)}" autocomplete="name"></label>
      </div>
    </section>

    <section class="card">
      <h2>Copia de seguridad</h2>
      <p>Tus datos solo están en esta tablet. Si borras los datos del navegador o pierdes la tablet, se pierden.
        Descarga una copia con frecuencia y guárdala fuera de la tablet (correo, USB o computadora). La copia incluye tus fotos, así que puede pesar varios MB.</p>
      <p class="muted">Última copia: ${ajustes.ultimoRespaldo ? fecha(ajustes.ultimoRespaldo) : 'nunca'}</p>
      <div class="actions">
        <button class="btn primary" id="exportar">Descargar copia</button>
        ${puedeCompartir ? '<button class="btn" id="compartir">Compartir copia</button>' : ''}
        <label class="btn" for="importar">Restaurar copia…</label>
        <input type="file" id="importar" accept=".json,application/json" hidden>
      </div>
    </section>

    <section class="card">
      <h2>Almacenamiento</h2>
      <p>${persistente === true ? 'Almacenamiento persistente: <strong>activado</strong>. El navegador no borrará los datos por falta de espacio.'
        : persistente === false ? 'Almacenamiento persistente: <strong>no activado</strong>. El navegador podría borrar datos si se queda sin espacio.'
        : 'Este navegador no informa si el almacenamiento es persistente.'}</p>
      <p class="muted">${uso} ${usoFotos}</p>
      ${persistente === false ? '<button class="btn" id="persistir">Solicitar almacenamiento persistente</button>' : ''}
    </section>

    <section class="card">
      <h2>Cámara y fotos</h2>
      <p>Las fotos se guardan comprimidas (máximo 1600 px) solo en esta tablet.</p>
      ${AYUDA_PERMISOS}
    </section>

    <section class="card">
      <h2>Privacidad</h2>
      <p>ObraPro guarda los proyectos únicamente en este dispositivo y no envía datos a ningún servidor.
        Cualquier persona con acceso a la tablet desbloqueada puede ver la información: usa bloqueo de pantalla.
        Las copias de seguridad contienen datos de tus clientes; guárdalas en un lugar seguro.</p>
    </section>

    <section class="card"><h2>Acerca de</h2><p>ObraPro · versión ${esc(VERSION_APP)}</p></section>`;

  $('#a-unidad').addEventListener('change', e => { ajustes.unidad = e.target.value; programarGuardado(guardarAjustes, 0); });
  $('#a-resp').addEventListener('input', e => { ajustes.responsable = e.target.value.trim(); programarGuardado(guardarAjustes); });

  const crearArchivo = async () => {
    const partes = await dbExportarPartes();
    const nombre = `obrapro-respaldo-${hoy()}.json`;
    return new File(partes, nombre, { type: 'application/json' });
  };
  const marcarRespaldo = async () => {
    ajustes.ultimoRespaldo = ahora();
    await guardarAjustes();
  };

  $('#exportar').addEventListener('click', async () => {
    try {
      const archivo = await crearArchivo();
      const url = URL.createObjectURL(archivo);
      const a = document.createElement('a');
      a.href = url; a.download = archivo.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      await marcarRespaldo();
      aviso('Copia descargada: ' + archivo.name);
    } catch (e) { aviso('No se pudo crear la copia: ' + e.message, 'error'); }
  });

  const comp = $('#compartir');
  if (comp) comp.addEventListener('click', async () => {
    try {
      const archivo = await crearArchivo();
      await navigator.share({ files: [archivo], title: 'Copia de seguridad ObraPro' });
      await marcarRespaldo();
      aviso('Copia compartida.');
    } catch (e) {
      if (e.name !== 'AbortError') aviso('No se pudo compartir: ' + e.message, 'error');
    }
  });

  $('#importar').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let datos;
    try { datos = JSON.parse(await f.text()); }
    catch (err) { aviso('El archivo no se puede leer como copia de seguridad.', 'error'); return; }
    if (!datos || datos.app !== 'ObraPro') { aviso('El archivo no es una copia de seguridad de ObraPro.', 'error'); return; }
    const n = (datos.datos.proyectos || []).length, nf = (datos.datos.fotos || []).length;
    const ok = await confirmar('Restaurar copia',
      `La copia del ${fecha(datos.exportado)} tiene ${n} proyecto(s) y ${nf} foto(s). Se reemplazarán TODOS los datos actuales de la app. ¿Continuar?`,
      'Restaurar');
    if (!ok) return;
    try {
      await dbImportar(datos);
      await cargarAjustes();
      aviso('Copia restaurada.');
      location.hash = '#/proyectos';
    } catch (err) { aviso('No se pudo restaurar: ' + err.message, 'error'); }
  });

  const pers = $('#persistir');
  if (pers) pers.addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    aviso(ok ? 'Almacenamiento persistente activado.' : 'El navegador no lo permitió. Instala la app en la pantalla de inicio e inténtalo de nuevo.', ok ? '' : 'error');
    vistaAjustes();
  });
}

/* ---------- Inicio ---------- */

async function iniciar() {
  try {
    await abrirDB();
    await cargarAjustes();
  } catch (e) {
    main().innerHTML = `<div class="card error-box"><h2>No se pudo abrir el almacenamiento</h2>
      <p>${esc(e.message)}</p><p>Si usas una ventana de incógnito o privada, abre ObraPro en una ventana normal.</p></div>`;
    return;
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(p => { if (!p) navigator.storage.persist(); }).catch(() => {});
  }
  window.addEventListener('hashchange', enrutar);
  enrutar();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service Worker:', e));
  }
}

iniciar();
