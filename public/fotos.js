/* ObraPro - fotos.js  (Etapa 5)
   Fotos del levantamiento: tomar con la cámara o elegir de la galería, comprimir,
   asociar a un espacio, y dibujar medidas y notas encima de cada foto.
   Todo se guarda solo en el dispositivo. Usa funciones de app.js y db.js. */
'use strict';

const CATEGORIAS_FOTO = [['general', 'General'], ['dano', 'Daño'], ['acabado', 'Acabado existente'], ['instalacion', 'Instalación']];
const COLORES_ANOT = [['#ffd23f', 'Amarillo'], ['#ffffff', 'Blanco'], ['#ff6b5e', 'Rojo'], ['#4ddb8b', 'Verde']];
const MAX_LADO = 1600;      /* lado más largo de la foto guardada, en píxeles */
const MAX_MINIATURA = 320;
let _filtroFotos = { espacio: '', categoria: '' };

/* ---------- Limpieza al cambiar de pantalla ---------- */

let _urls = [];
let _limpiezas = [];
function urlDe(blob) { const u = URL.createObjectURL(blob); _urls.push(u); return u; }
function alSalir(fn) { _limpiezas.push(fn); }
function limpiarVista() {
  _urls.forEach(u => URL.revokeObjectURL(u));
  _urls = [];
  _limpiezas.splice(0).forEach(f => { try { f(); } catch (e) { console.warn(e); } });
}

/* ---------- Procesar y guardar fotos ---------- */

async function decodificarImagen(archivo) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(archivo, { imageOrientation: 'from-image' }); } catch (e) { /* se usa el respaldo */ }
  }
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('No se pudo leer la imagen.')); };
    img.src = u;
  });
}

function canvasABlob(canvas, calidad) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen.'))), 'image/jpeg', calidad));
}

function reducirA(img, ancho0, alto0, lado, calidad) {
  const f = Math.min(1, lado / Math.max(ancho0, alto0));
  const w = Math.max(1, Math.round(ancho0 * f)), h = Math.max(1, Math.round(alto0 * f));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';                 /* los PNG con transparencia quedan sobre blanco */
  x.fillRect(0, 0, w, h);
  x.drawImage(img, 0, 0, w, h);
  return canvasABlob(c, calidad).then(blob => ({ blob, w, h }));
}

async function procesarImagen(archivo) {
  const img = await decodificarImagen(archivo);
  const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
  const grande = await reducirA(img, w0, h0, MAX_LADO, 0.82);
  const mini = await reducirA(img, w0, h0, MAX_MINIATURA, 0.7);
  if (img.close) img.close();
  return { imagen: grande.blob, miniatura: mini.blob, ancho: grande.w, alto: grande.h };
}

/* Procesa y guarda varias fotos. Devuelve las que se guardaron. */
async function agregarFotos(archivos, proyectoId, espacioId, categoria = 'general') {
  const hechas = [];
  let fallos = 0;
  for (let i = 0; i < archivos.length; i++) {
    if (archivos.length > 1) aviso(`Procesando foto ${i + 1} de ${archivos.length}…`);
    try {
      const datos = await procesarImagen(archivos[i]);
      const foto = Object.assign({
        id: nuevoId(), proyectoId, espacioId: espacioId || null, descripcion: '', categoria,
        anotaciones: [], fecha: new Date(Date.now() + i).toISOString(), creado: ahora(), actualizado: ahora()
      }, datos);
      await dbGuardar('fotos', foto);
      hechas.push(foto);
    } catch (e) {
      console.error(e);
      fallos++;
      if (/quota/i.test(e.name + e.message)) { aviso('No hay espacio libre en la tablet para más fotos.', 'error'); break; }
    }
  }
  if (fallos && !hechas.length) aviso('No se pudo leer la foto. Prueba con otra imagen.', 'error');
  else if (fallos) aviso(`${hechas.length} foto(s) guardadas y ${fallos} no se pudieron leer.`, 'error');
  else if (hechas.length) aviso(hechas.length === 1 ? 'Foto guardada.' : `${hechas.length} fotos guardadas.`);
  return hechas;
}

/* Abre la cámara o la galería. Devuelve la lista de archivos elegidos (vacía si cancela). */
function pedirArchivos({ camara = false, multiple = false } = {}) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (camara) inp.setAttribute('capture', 'environment');
    if (multiple) inp.multiple = true;
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { const lista = Array.from(inp.files || []); inp.remove(); resolve(lista); });
    inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
    inp.click();
  });
}

async function desvincularFotos(espacioId) {
  const fotos = await dbTodos('fotos');
  for (const f of fotos) {
    if (f.espacioId === espacioId) { f.espacioId = null; await dbGuardar('fotos', f); }
  }
}

function descargarArchivo(archivo) {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url; a.download = archivo.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------- Dibujo de medidas y notas ---------- */

function trazoPastilla(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/* Texto sobre un fondo oscuro, centrado en (cx, cy). Devuelve su caja. */
function dibujarPastilla(ctx, texto, cx, cy, color, u, W, H) {
  const w = ctx.measureText(texto).width + 30 * u, h = 46 * u;
  const x = Math.min(Math.max(cx - w / 2, 4 * u), Math.max(4 * u, W - w - 4 * u));
  const y = Math.min(Math.max(cy - h / 2, 4 * u), Math.max(4 * u, H - h - 4 * u));
  trazoPastilla(ctx, x, y, w, h, 12 * u);
  ctx.fillStyle = 'rgba(16, 15, 14, .8)'; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2.2 * u; ctx.stroke();
  ctx.fillStyle = color; ctx.fillText(texto, x + w / 2, y + h / 2 + 1.5 * u);
  return { x, y, w, h };
}

/* Dibuja todas las anotaciones en un canvas de W×H. Las posiciones se guardan como
   proporciones (0 a 1) de la foto, así se ven igual en cualquier tamaño de pantalla. */
function dibujarAnotaciones(ctx, W, H, anots, selId, cajas) {
  const u = W / 1000;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(30 * u)}px Lato, system-ui, sans-serif`;
  for (const a of anots) {
    const color = a.color || '#ffd23f';
    if (a.tipo === 'medida') {
      const x1 = a.x1 * W, y1 = a.y1 * H, x2 = a.x2 * W, y2 = a.y2 * H;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      if (ny > 0) { nx = -nx; ny = -ny; }          /* la normal siempre apunta hacia arriba */
      const t = 17 * u;
      for (const pasada of [0, 1]) {               /* primero una sombra oscura, para que se vea sobre cualquier foto */
        ctx.strokeStyle = pasada === 0 ? 'rgba(0, 0, 0, .7)' : color;
        ctx.lineWidth = (pasada === 0 ? 10 : 4.5) * u;
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.moveTo(x1 - nx * t, y1 - ny * t); ctx.lineTo(x1 + nx * t, y1 + ny * t);
        ctx.moveTo(x2 - nx * t, y2 - ny * t); ctx.lineTo(x2 + nx * t, y2 + ny * t);
        ctx.stroke();
      }
      if (a.texto) {
        const caja = dibujarPastilla(ctx, a.texto, (x1 + x2) / 2 + nx * 36 * u, (y1 + y2) / 2 + ny * 36 * u, color, u, W, H);
        if (cajas) cajas[a.id] = caja;
      }
      if (a.id === selId) {
        for (const [px, py] of [[x1, y1], [x2, y2]]) {
          ctx.beginPath(); ctx.arc(px, py, 14 * u, 0, Math.PI * 2);
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#9f7a5a'; ctx.lineWidth = 5 * u; ctx.stroke();
        }
      }
    } else if (a.tipo === 'texto' && a.texto) {
      const caja = dibujarPastilla(ctx, a.texto, a.x * W, a.y * H, color, u, W, H);
      if (cajas) cajas[a.id] = caja;
      if (a.id === selId) {
        ctx.setLineDash([10 * u, 8 * u]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * u;
        trazoPastilla(ctx, caja.x - 7 * u, caja.y - 7 * u, caja.w + 14 * u, caja.h + 14 * u, 16 * u); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  ctx.restore();
}

function cargarImagen(blob) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('No se pudo abrir la foto.')); };
    img.src = u;
  });
}

/* La foto con las medidas dibujadas, como un archivo JPEG nuevo (la original no cambia). */
async function renderizarFoto(foto) {
  const img = await cargarImagen(foto.imagen);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  dibujarAnotaciones(ctx, c.width, c.height, foto.anotaciones || [], null, null);
  return canvasABlob(c, 0.9);
}

/* ---------- Ventana para escribir texto ---------- */

function iniciarDialogoTexto() {
  const dlg = $('#dlg-texto');
  if (!dlg || dlg._listo) return;
  dlg._listo = true;
  const inp = $('#dlg-texto-input');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dlg.close('ok'); } });
  $('#dlg-texto-ok').addEventListener('click', () => dlg.close('ok'));
  $$('#dlg-texto .sugerencia').forEach(b => b.addEventListener('click', () => {
    inp.value = (inp.value.trim() + ' ' + b.dataset.t).trim(); inp.focus();
  }));
}

/* Devuelve el texto escrito, o null si se cancela. */
function pedirTexto(titulo, etiquetaCampo, valor = '') {
  iniciarDialogoTexto();
  const dlg = $('#dlg-texto'), inp = $('#dlg-texto-input');
  $('#dlg-texto-title').textContent = titulo;
  $('#dlg-texto-label').textContent = etiquetaCampo;
  inp.value = valor;
  return new Promise(resolve => {
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? inp.value.trim() : null);
    dlg.showModal();
    inp.focus(); inp.select();
  });
}

/* ---------- Pestaña "Fotos" del proyecto ---------- */

const AYUDA_PERMISOS = `
  <details class="ayuda">
    <summary>¿La cámara no abre? Permisos de Android</summary>
    <ul>
      <li>Al tomar tu primera foto, el sistema puede preguntar si el navegador puede usar la cámara. Toca <strong>Permitir</strong>.</li>
      <li>Si lo negaste sin querer: abre <strong>Ajustes</strong> de la tablet → <strong>Aplicaciones</strong> → el navegador donde instalaste ObraPro → <strong>Permisos</strong> → <strong>Cámara</strong> → <strong>Permitir</strong>.</li>
      <li>Para <strong>elegir fotos de la galería</strong> no se dan permisos extra: tú escoges cada foto.</li>
      <li>Las fotos se guardan solo en esta tablet y no se envían a ningún servidor. Se incluyen en la copia de seguridad de Ajustes.</li>
    </ul>
  </details>`;

async function pestanaFotos(p) {
  const [fotos, espacios] = await Promise.all([dbPorProyecto('fotos', p.id), dbPorProyecto('espacios', p.id)]);
  const nombreEsp = Object.fromEntries(espacios.map(e => [e.id, e.nombre || 'Sin nombre']));
  fotos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  if (_filtroFotos.espacio && _filtroFotos.espacio !== '-' && !nombreEsp[_filtroFotos.espacio]) _filtroFotos.espacio = '';
  const cuerpo = $('#tab-body');
  if (!cuerpo) return;                      /* se cambió de pantalla mientras cargaban las fotos */

  cuerpo.innerHTML = `
    <div class="row-between">
      <h2>Fotos (${fotos.length})</h2>
      <div class="actions tight">
        <button class="btn primary" id="tomar">Tomar foto</button>
        <button class="btn" id="galeria">Elegir de la galería</button>
      </div>
    </div>
    <div class="toolbar">
      <select id="f-esp" aria-label="Filtrar por espacio">
        <option value="">Todos los espacios</option><option value="-">Sin espacio</option>
        ${espacios.map(e => `<option value="${e.id}">${esc(e.nombre || 'Sin nombre')}</option>`).join('')}
      </select>
      <select id="f-cat" aria-label="Filtrar por tipo de foto">
        <option value="">Todos los tipos</option>${opciones(CATEGORIAS_FOTO)}
      </select>
    </div>
    <div id="galeria-fotos"></div>
    ${AYUDA_PERMISOS}`;

  $('#f-esp').value = _filtroFotos.espacio;
  $('#f-cat').value = _filtroFotos.categoria;

  const dibujar = () => {
    const { espacio, categoria } = _filtroFotos;
    const lista = fotos.filter(f => (!categoria || f.categoria === categoria) &&
      (!espacio || (espacio === '-' ? !f.espacioId : f.espacioId === espacio)));
    $('#galeria-fotos').innerHTML = !fotos.length
      ? `<div class="empty">${ICONO_CASA}<p>Este proyecto aún no tiene fotos.</p><p class="small">Toma fotos del estado actual, daños, acabados e instalaciones, y dibuja las medidas encima.</p></div>`
      : !lista.length ? '<p class="empty">Ninguna foto coincide con el filtro.</p>'
      : `<div class="fotos-grid">${lista.map(f => `
        <a class="foto-card" href="#/foto/${f.id}" aria-label="Abrir foto ${esc(f.descripcion || etiqueta(CATEGORIAS_FOTO, f.categoria))}">
          <img src="${urlDe(f.miniatura || f.imagen)}" alt="${esc(f.descripcion || 'Foto del levantamiento')}" loading="lazy">
          <span class="foto-meta"><span class="tag">${esc(etiqueta(CATEGORIAS_FOTO, f.categoria))}</span>${f.espacioId ? `<span class="foto-esp">${esc(nombreEsp[f.espacioId] || '')}</span>` : ''}</span>
          ${(f.anotaciones || []).length ? `<span class="foto-anot">${f.anotaciones.length} anotación(es)</span>` : ''}
          ${f.descripcion ? `<span class="foto-desc">${esc(f.descripcion)}</span>` : ''}
        </a>`).join('')}</div>`;
  };
  dibujar();
  $('#f-esp').addEventListener('change', e => { _filtroFotos.espacio = e.target.value; dibujar(); });
  $('#f-cat').addEventListener('change', e => { _filtroFotos.categoria = e.target.value; dibujar(); });

  const destinoEspacio = () => (_filtroFotos.espacio && _filtroFotos.espacio !== '-') ? _filtroFotos.espacio : null;
  const categoriaFiltro = () => _filtroFotos.categoria || 'general';
  $('#tomar').addEventListener('click', async () => {
    const archivos = await pedirArchivos({ camara: true });
    if (!archivos.length) return;
    const nuevas = await agregarFotos(archivos, p.id, destinoEspacio(), categoriaFiltro());
    if (nuevas.length) location.hash = '#/foto/' + nuevas[0].id;   /* directo a la foto, para anotarla */
  });
  $('#galeria').addEventListener('click', async () => {
    const archivos = await pedirArchivos({ multiple: true });
    if (!archivos.length) return;
    const nuevas = await agregarFotos(archivos, p.id, destinoEspacio(), categoriaFiltro());
    if (nuevas.length) enrutar();
  });
}

/* ---------- Fotos dentro del editor de espacio ---------- */

async function montarFotosEspacio(cont, s) {
  const fotos = (await dbPorProyecto('fotos', s.proyectoId)).filter(f => f.espacioId === s.id)
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  if (!cont.isConnected) return;            /* se cambió de pantalla mientras cargaban las fotos */
  cont.innerHTML = `
    <fieldset><legend>Fotos de este espacio (${fotos.length})</legend>
      ${fotos.length ? `<div class="tira-fotos">${fotos.map(f => `
        <a class="foto-mini" href="#/foto/${f.id}" aria-label="Abrir foto">
          <img src="${urlDe(f.miniatura || f.imagen)}" alt="${esc(f.descripcion || 'Foto del espacio')}">
          ${(f.anotaciones || []).length ? `<span class="foto-anot">${f.anotaciones.length}</span>` : ''}
        </a>`).join('')}</div>` : '<p class="muted small">Todavía no hay fotos de este espacio.</p>'}
      <div class="actions tight">
        <button type="button" class="btn primary" id="esp-tomar">Tomar foto</button>
        <button type="button" class="btn" id="esp-galeria">Elegir de la galería</button>
      </div>
    </fieldset>`;
  cont.querySelector('#esp-tomar').addEventListener('click', async () => {
    const archivos = await pedirArchivos({ camara: true });
    if (!archivos.length) return;
    await guardarPendiente();
    const nuevas = await agregarFotos(archivos, s.proyectoId, s.id);
    if (nuevas.length) location.hash = '#/foto/' + nuevas[0].id;
  });
  cont.querySelector('#esp-galeria').addEventListener('click', async () => {
    const archivos = await pedirArchivos({ multiple: true });
    if (!archivos.length) return;
    const nuevas = await agregarFotos(archivos, s.proyectoId, s.id);
    if (nuevas.length) montarFotosEspacio(cont, s);
  });
}

/* ---------- Pantalla de una foto: datos y dibujo de medidas ---------- */

const AYUDA_HERR = {
  medida: 'Arrastra sobre la foto para trazar una línea de medida y escribe su valor.',
  texto: 'Toca la foto donde quieras poner una nota.',
  seleccionar: 'Toca una línea o nota para elegirla. Arrástrala para moverla; arrastra los círculos de los extremos para ajustar la medida.'
};

async function vistaFoto(id) {
  const f = await dbObtener('fotos', id);
  if (!f) {
    main().innerHTML = '<div class="card"><p>No se encontró la foto.</p><a class="btn" href="#/proyectos">Volver</a></div>';
    return;
  }
  const [p, espacios, todas] = await Promise.all([dbObtener('proyectos', f.proyectoId), dbPorProyecto('espacios', f.proyectoId), dbPorProyecto('fotos', f.proyectoId)]);
  todas.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const pos = todas.findIndex(x => x.id === f.id);
  f.anotaciones = f.anotaciones || [];
  const nombreEsp = Object.fromEntries(espacios.map(e => [e.id, e.nombre || 'Sin nombre']));
  const puedeCompartir = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] }));

  main().innerHTML = `
    <header class="page-head">
      <a class="btn ghost" href="#/proyecto/${f.proyectoId}/fotos">← Fotos</a>
      <div class="title-block">
        <h1>Foto ${pos + 1} de ${todas.length}</h1>
        <p class="muted">${esc(p ? p.nombre : '')}${f.espacioId ? ' · ' + esc(nombreEsp[f.espacioId] || '') : ''}</p>
      </div>
      <div class="actions tight">
        ${pos > 0 ? `<a class="btn" id="ant" href="#/foto/${todas[pos - 1].id}">← Anterior</a>` : ''}
        ${pos < todas.length - 1 ? `<a class="btn" id="sig" href="#/foto/${todas[pos + 1].id}">Siguiente →</a>` : ''}
      </div>
      <span id="save-status" class="save-status">Los cambios se guardan solos</span>
    </header>

    <div class="layout-foto">
      <section class="col-main">
        <div class="barra-herr" role="toolbar" aria-label="Herramientas de dibujo">
          <div class="grupo" role="group" aria-label="Herramienta">
            <button type="button" class="btn herr" data-herr="medida" aria-pressed="true">Medida</button>
            <button type="button" class="btn herr" data-herr="texto" aria-pressed="false">Texto</button>
            <button type="button" class="btn herr" data-herr="seleccionar" aria-pressed="false">Mover</button>
          </div>
          <div class="grupo" role="group" aria-label="Color">
            ${COLORES_ANOT.map(([c, n], i) => `<button type="button" class="color-sw" data-color="${c}" aria-label="${n}" aria-pressed="${i === 0}" style="--c:${c}"></button>`).join('')}
          </div>
          <div class="grupo">
            <button type="button" class="btn" id="deshacer" disabled>Deshacer</button>
            <button type="button" class="btn" id="editar" disabled>Editar texto</button>
            <button type="button" class="btn danger-outline" id="quitar" disabled>Borrar</button>
          </div>
        </div>
        <p class="muted small" id="ayuda-herr">${AYUDA_HERR.medida}</p>
        <div class="lienzo-wrap" id="wrap"><canvas id="lienzo" aria-label="Foto con las medidas dibujadas"></canvas></div>
      </section>

      <aside class="col-side">
        <div class="card">
          <h2>Datos de la foto</h2>
          ${campoTexto('descripcion', 'Descripción', f.descripcion, 3)}
          ${campoSelect('categoria', 'Tipo de foto', CATEGORIAS_FOTO, f.categoria)}
          <label class="field"><span>Espacio</span>
            <select id="f-espacio"><option value="">Sin espacio (general de la obra)</option>
              ${espacios.map(e => `<option value="${e.id}"${e.id === f.espacioId ? ' selected' : ''}>${esc(e.nombre || 'Sin nombre')}</option>`).join('')}</select></label>
          <p class="muted small">Tomada el ${fecha(f.fecha)} · ${f.ancho}×${f.alto} px</p>
        </div>
        <div class="card acciones-foto">
          <button type="button" class="btn primary" id="descargar">Guardar imagen con medidas</button>
          ${puedeCompartir ? '<button type="button" class="btn" id="compartir">Compartir imagen</button>' : ''}
          <button type="button" class="btn" id="otra">Tomar otra foto</button>
          <button type="button" class="btn danger-outline" id="eliminar">Eliminar foto</button>
        </div>
      </aside>
    </div>`;

  const guardar = () => {
    f.actualizado = ahora();
    programarGuardado(() => dbGuardar('fotos', f));
  };

  /* --- datos de la foto --- */
  $('#f-descripcion').addEventListener('input', e => { f.descripcion = e.target.value; guardar(); });
  $('#f-categoria').addEventListener('change', e => { f.categoria = e.target.value; guardar(); });
  $('#f-espacio').addEventListener('change', e => { f.espacioId = e.target.value || null; guardar(); });

  /* --- lienzo --- */
  const canvas = $('#lienzo'), wrap = $('#wrap'), ctx = canvas.getContext('2d');
  const img = await cargarImagen(f.imagen);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  if (!canvas.isConnected) return;          /* se cambió de foto o de pantalla mientras cargaba la imagen */
  let herr = 'medida', color = COLORES_ANOT[0][0], sel = null, arrastre = null, cajas = {}, historial = [];
  let W = 1, H = 1, pendienteDibujo = false;

  const ajustar = () => {
    const dpr = window.devicePixelRatio || 1;
    const anchoMax = wrap.clientWidth || 600;
    const altoMax = Math.max(320, window.innerHeight - wrap.getBoundingClientRect().top - 24);
    const proporcion = img.naturalWidth / img.naturalHeight;
    const cssW = Math.max(120, Math.min(anchoMax, altoMax * proporcion)), cssH = cssW / proporcion;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    W = canvas.width = Math.round(cssW * dpr); H = canvas.height = Math.round(cssH * dpr);
    dibujar();
  };
  const dibujar = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    cajas = {};
    const extra = arrastre && arrastre.tipo === 'nueva' ? [{ id: '_', tipo: 'medida', x1: arrastre.a.x, y1: arrastre.a.y, x2: arrastre.b.x, y2: arrastre.b.y, texto: '', color }] : [];
    dibujarAnotaciones(ctx, W, H, f.anotaciones.concat(extra), sel, cajas);
  };
  const pedirDibujo = () => { if (!pendienteDibujo) { pendienteDibujo = true; requestAnimationFrame(() => { pendienteDibujo = false; dibujar(); }); } };
  const enResize = () => ajustar();
  window.addEventListener('resize', enResize);
  alSalir(() => window.removeEventListener('resize', enResize));

  const anotSel = () => f.anotaciones.find(a => a.id === sel) || null;
  const refrescarBotones = () => {
    $('#deshacer').disabled = !historial.length;
    $('#editar').disabled = !anotSel();
    $('#quitar').disabled = !anotSel();
  };
  const instantanea = () => { historial.push(JSON.stringify(f.anotaciones)); if (historial.length > 40) historial.shift(); };
  const cambiar = () => { guardar(); refrescarBotones(); dibujar(); };

  const punto = e => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), r };
  };
  /* Qué hay bajo el dedo: un extremo, el cuerpo de una medida o una nota. Distancias en píxeles de pantalla. */
  const buscar = pt => {
    const r = pt.r, px = pt.x * r.width, py = pt.y * r.height, esc1 = r.width / W;
    for (let i = f.anotaciones.length - 1; i >= 0; i--) {
      const a = f.anotaciones[i];
      if (a.tipo === 'medida') {
        const ax = a.x1 * r.width, ay = a.y1 * r.height, bx = a.x2 * r.width, by = a.y2 * r.height;
        if (a.id === sel) {
          if (Math.hypot(px - ax, py - ay) < 26) return { a, parte: 'a' };
          if (Math.hypot(px - bx, py - by) < 26) return { a, parte: 'b' };
        }
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
        if (Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) < 22) return { a, parte: 'todo' };
        const c = cajas[a.id];
        if (c && px >= c.x * esc1 && px <= (c.x + c.w) * esc1 && py >= c.y * esc1 && py <= (c.y + c.h) * esc1) return { a, parte: 'todo' };
      } else {
        const c = cajas[a.id];
        if (c && px >= c.x * esc1 - 10 && px <= (c.x + c.w) * esc1 + 10 && py >= c.y * esc1 - 10 && py <= (c.y + c.h) * esc1 + 10) return { a, parte: 'todo' };
      }
    }
    return null;
  };

  canvas.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pt = punto(e);
    if (herr === 'medida') {
      arrastre = { tipo: 'nueva', a: pt, b: pt, id: e.pointerId };
    } else if (herr === 'texto') {
      arrastre = { tipo: 'texto', a: pt, id: e.pointerId };
    } else {
      const hit = buscar(pt);
      sel = hit ? hit.a.id : null;
      if (hit) { instantanea(); arrastre = { tipo: hit.parte, a: hit.a, origen: pt, copia: JSON.parse(JSON.stringify(hit.a)), cambio: false, id: e.pointerId }; }
      refrescarBotones();
    }
    pedirDibujo();
  });
  canvas.addEventListener('pointermove', e => {
    if (!arrastre || arrastre.id !== e.pointerId) return;
    const pt = punto(e);
    if (arrastre.tipo === 'nueva') arrastre.b = pt;
    else if (arrastre.tipo === 'a' || arrastre.tipo === 'b') {
      const a = arrastre.a; arrastre.cambio = true;
      if (arrastre.tipo === 'a') { a.x1 = pt.x; a.y1 = pt.y; } else { a.x2 = pt.x; a.y2 = pt.y; }
    } else if (arrastre.tipo === 'todo') {
      const a = arrastre.a, c = arrastre.copia, dx = pt.x - arrastre.origen.x, dy = pt.y - arrastre.origen.y;
      arrastre.cambio = true;
      if (a.tipo === 'medida') {
        const mx = Math.min(1 - Math.max(c.x1, c.x2), Math.max(-Math.min(c.x1, c.x2), dx));
        const my = Math.min(1 - Math.max(c.y1, c.y2), Math.max(-Math.min(c.y1, c.y2), dy));
        a.x1 = c.x1 + mx; a.x2 = c.x2 + mx; a.y1 = c.y1 + my; a.y2 = c.y2 + my;
      } else { a.x = Math.min(1, Math.max(0, c.x + dx)); a.y = Math.min(1, Math.max(0, c.y + dy)); }
    }
    pedirDibujo();
  });
  const terminar = async e => {
    if (!arrastre || arrastre.id !== e.pointerId) return;
    const act = arrastre; arrastre = null;
    if (act.tipo === 'nueva') {
      const largo = Math.hypot((act.b.x - act.a.x) * act.a.r.width, (act.b.y - act.a.y) * act.a.r.height);
      if (largo < 20) { dibujar(); return; }                 /* un toque suelto no dibuja nada */
      const nueva = { id: nuevoId(), tipo: 'medida', x1: act.a.x, y1: act.a.y, x2: act.b.x, y2: act.b.y, texto: '', color };
      sel = nueva.id; f.anotaciones.push(nueva); dibujar();
      const txt = await pedirTexto('Medida', 'Escribe la medida (por ejemplo 2.40 m). Puedes dejarla vacía.');
      if (txt === null) { f.anotaciones.pop(); sel = null; refrescarBotones(); dibujar(); return; }
      nueva.texto = txt; f.anotaciones.pop(); instantanea(); f.anotaciones.push(nueva);
      cambiar();
    } else if (act.tipo === 'texto') {
      const txt = await pedirTexto('Nota', 'Escribe la nota (por ejemplo "Grieta" o "Tubería de 1/2").');
      if (!txt) { dibujar(); return; }
      instantanea();
      const nueva = { id: nuevoId(), tipo: 'texto', x: act.a.x, y: act.a.y, texto: txt, color };
      f.anotaciones.push(nueva); sel = nueva.id;
      cambiar();
    } else {
      if (act.cambio) cambiar(); else { historial.pop(); refrescarBotones(); dibujar(); }
    }
  };
  canvas.addEventListener('pointerup', terminar);
  canvas.addEventListener('pointercancel', e => { if (arrastre && arrastre.id === e.pointerId) { if (arrastre.tipo !== 'nueva' && arrastre.tipo !== 'texto') { Object.assign(arrastre.a, arrastre.copia); historial.pop(); } arrastre = null; refrescarBotones(); dibujar(); } });

  /* --- barra de herramientas --- */
  $$('.herr').forEach(b => b.addEventListener('click', () => {
    herr = b.dataset.herr;
    $$('.herr').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('#ayuda-herr').textContent = AYUDA_HERR[herr];
    if (herr !== 'seleccionar') { sel = null; refrescarBotones(); dibujar(); }
    canvas.style.cursor = herr === 'seleccionar' ? 'grab' : 'crosshair';
  }));
  $$('.color-sw').forEach(b => b.addEventListener('click', () => {
    color = b.dataset.color;
    $$('.color-sw').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    const a = anotSel();
    if (a) { instantanea(); a.color = color; cambiar(); }
  }));
  $('#deshacer').addEventListener('click', () => {
    if (!historial.length) return;
    f.anotaciones = JSON.parse(historial.pop());
    if (!anotSel()) sel = null;
    cambiar();
  });
  $('#editar').addEventListener('click', async () => {
    const a = anotSel(); if (!a) return;
    const txt = await pedirTexto(a.tipo === 'medida' ? 'Medida' : 'Nota', a.tipo === 'medida' ? 'Medida' : 'Nota', a.texto || '');
    if (txt === null || (a.tipo === 'texto' && !txt)) return;
    instantanea(); a.texto = txt; cambiar();
  });
  $('#quitar').addEventListener('click', async () => {
    const a = anotSel(); if (!a) return;
    if (!await confirmar('Borrar anotación', `¿Borrar ${a.tipo === 'medida' ? 'la medida' : 'la nota'}${a.texto ? ' "' + a.texto + '"' : ''}?`, 'Borrar')) return;
    instantanea(); f.anotaciones = f.anotaciones.filter(x => x.id !== a.id); sel = null; cambiar();
  });
  document.addEventListener('keydown', teclas);
  alSalir(() => document.removeEventListener('keydown', teclas));
  function teclas(e) {
    if (e.target.closest && e.target.closest('input, textarea, select, dialog')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && anotSel()) { e.preventDefault(); $('#quitar').click(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('#deshacer').click(); }
  }

  /* --- acciones de la foto --- */
  const nombreArchivo = () => {
    const d = new Date(); const z = n => String(n).padStart(2, '0');
    return `obrapro-foto-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.jpg`;
  };
  const archivoConMedidas = async () => new File([await renderizarFoto(f)], nombreArchivo(), { type: 'image/jpeg' });
  $('#descargar').addEventListener('click', async () => {
    try { descargarArchivo(await archivoConMedidas()); aviso('Imagen guardada con las medidas dibujadas.'); }
    catch (err) { aviso('No se pudo crear la imagen: ' + err.message, 'error'); }
  });
  const comp = $('#compartir');
  if (comp) comp.addEventListener('click', async () => {
    try { await navigator.share({ files: [await archivoConMedidas()], title: 'Foto de ObraPro' }); }
    catch (err) { if (err.name !== 'AbortError') aviso('No se pudo compartir: ' + err.message, 'error'); }
  });
  $('#otra').addEventListener('click', async () => {
    const archivos = await pedirArchivos({ camara: true });
    if (!archivos.length) return;
    await guardarPendiente();
    const nuevas = await agregarFotos(archivos, f.proyectoId, f.espacioId, f.categoria);
    if (nuevas.length) location.hash = '#/foto/' + nuevas[0].id;
  });
  $('#eliminar').addEventListener('click', async () => {
    if (!await confirmar('Eliminar foto', 'La foto y sus medidas dibujadas se borrarán. Esta acción no se puede deshacer.')) return;
    _pendiente && clearTimeout(_pendiente.timer);
    _pendiente = null;
    await dbBorrar('fotos', f.id);
    aviso('Foto eliminada.');
    location.hash = `#/proyecto/${f.proyectoId}/fotos`;
  });

  canvas.style.cursor = 'crosshair';
  ajustar();
  refrescarBotones();
}
