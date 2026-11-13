/* ObraPro - listas.js (Etapa 10)
   Pestaña "Listas": lista de materiales (para comprar) y lista de mano de obra, con total,
   agrupadas por categoría o por espacio. Se pueden descargar en PDF, copiar o compartir como texto. */
'use strict';

const GRUPOS_LISTA = [['categoria', 'Por categoría'], ['espacio', 'Por espacio'], ['ninguno', 'Sin agrupar']];

/* Prepara las líneas de una lista: textos listos para pantalla, texto copiado y PDF. */
function prepararLista(tipo, L, grupo, nombreEsp) {
  const mat = tipo === 'materiales';
  const lista = mat ? L.materiales : L.manoObra;
  const clave = f => grupo === 'categoria' ? f.categoria : grupo === 'espacio' ? (nombreEsp[f.espacioId] || 'General (sin espacio)') : 'Todos los conceptos';
  const mapa = new Map();
  for (const f of lista) {
    const u = unidadTxt(f.unidad);
    const costo = mat ? f.costoMaterial : f.costoManoObra;
    const comprar = (f.unidad === 'pza' ? Math.ceil(f.comprar - 1e-9) : f.comprar);
    const e = nombreEsp[f.espacioId];
    const linea = {
      f, costo,
      descripcion: f.descripcion,
      sub: [e && grupo !== 'espacio' ? e : '', grupo !== 'categoria' ? f.categoria : '',
        mat && f.desperdicio > 0 ? `+${String(+f.desperdicio.toFixed(2))} % desperdicio` : '',
        f.tipoCantidad === 'estimada' ? 'cantidad estimada' : '', f.sinPrecio ? 'sin precio' : ''].filter(Boolean).join(' · '),
      cantidadTxt: f.sinCantidad ? 'Sin cantidad' : `${num(f.cantidad)} ${u}`,
      comprarTxt: f.sinCantidad ? '—' : `${num(comprar)} ${u}`,
      costoTxt: f.sinPrecio ? 'Sin precio' : formatoPesos(costo)
    };
    const k = clave(f);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(linea);
  }
  const grupos = Array.from(mapa, ([titulo, filas]) => {
    filas.sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'));
    const total = filas.reduce((a, l) => a + l.costo, 0);
    return { titulo, filas, total, totalTxt: formatoPesos(total) };
  }).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  return { mat, grupos, total: mat ? L.totalMateriales : L.totalManoObra };
}

function textoLista(p, prep) {
  const out = [`${prep.mat ? 'LISTA DE MATERIALES' : 'LISTA DE MANO DE OBRA'} - ${p.nombre}`];
  if (p.cliente) out.push('Cliente: ' + p.cliente);
  out.push('Fecha: ' + fecha(hoy()), '');
  for (const g of prep.grupos) {
    out.push(`[${g.titulo}]`);
    for (const l of g.filas) {
      const partes = [l.descripcion + (l.sub ? ` (${l.sub})` : '')];
      out.push('• ' + partes[0] + ' - ' + (prep.mat ? 'Comprar: ' + l.comprarTxt : l.cantidadTxt) + ' - ' + l.costoTxt);
    }
    out.push('Subtotal: ' + g.totalTxt, '');
  }
  out.push('TOTAL: ' + formatoPesos(prep.total), '(Costos directos, sin indirectos, utilidad ni IVA.)');
  return out.join('\n');
}

async function copiarTexto(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* intenta el método viejo */ }
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove(); return ok;
}

async function pestanaListas(p) {
  const [partidas, espacios] = await Promise.all([dbPorProyecto('partidas', p.id), dbPorProyecto('espacios', p.id)]);
  const cuerpo = $('#tab-body');
  if (!cuerpo) return;
  const cfg = p.listas = Object.assign({ tipo: 'materiales', grupo: 'categoria' }, p.listas || {});
  if (!GRUPOS_LISTA.some(g => g[0] === cfg.grupo)) cfg.grupo = 'categoria';
  if (cfg.tipo !== 'manoObra') cfg.tipo = 'materiales';
  const nombreEsp = Object.fromEntries(espacios.map(e => [e.id, e.nombre || 'Sin nombre']));

  if (!partidas.length) {
    cuerpo.innerHTML = `<div class="row-between"><h2>Listas de obra</h2></div>
      <div class="card"><p>Aún no hay conceptos en este proyecto. Agrega conceptos y aquí aparecerán la lista de materiales y la de mano de obra.</p>
      <a class="btn primary" href="#/proyecto/${p.id}/conceptos">Ir a Conceptos</a></div>`;
    return;
  }

  const L = listasObra(partidas);
  const prep = prepararLista(cfg.tipo, L, cfg.grupo, nombreEsp);
  const sinPrecio = partidas.filter(x => !(x.precioMaterial > 0) && !(x.precioManoObra > 0)).length;
  const sinCantidad = partidas.filter(x => !(Number(x.cantidad) > 0)).length;
  const estimadas = partidas.filter(x => x.tipoCantidad === 'estimada').length;
  const avisos = [sinPrecio ? `${sinPrecio} concepto(s) sin precio` : '', sinCantidad ? `${sinCantidad} sin cantidad` : '',
    estimadas ? `${estimadas} con cantidad estimada: confírmala antes de comprar` : ''].filter(Boolean);

  cuerpo.innerHTML = `
    <div class="row-between"><h2>Listas de obra</h2><span id="save-status" class="save-status">Los cambios se guardan solos</span></div>
    <div class="barra-listas">
      <div class="segmentos" role="tablist" aria-label="Tipo de lista">
        <button role="tab" class="seg${cfg.tipo === 'materiales' ? ' activo' : ''}" data-tipo="materiales" aria-selected="${cfg.tipo === 'materiales'}">Materiales</button>
        <button role="tab" class="seg${cfg.tipo === 'manoObra' ? ' activo' : ''}" data-tipo="manoObra" aria-selected="${cfg.tipo === 'manoObra'}">Mano de obra</button>
      </div>
      <label class="inline-sel"><span>Agrupar</span>
        <select id="ls-grupo" aria-label="Agrupar la lista">${GRUPOS_LISTA.map(([k, t]) => `<option value="${k}"${k === cfg.grupo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    ${avisos.length ? `<div class="banner" id="ls-avisos">Ojo: ${esc(avisos.join(' · '))}.</div>` : ''}
    <section class="card" id="ls-lista">
      ${prep.grupos.length ? prep.grupos.map(g => `
        <div class="grupo-lista">
          <h3>${esc(g.titulo)} <small>${esc(g.totalTxt)}</small></h3>
          ${g.filas.map(l => `<a class="fila-lista" href="#/partida/${l.f.id}">
            <span class="fl-main"><strong>${esc(l.descripcion)}</strong>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</span>
            <span class="fl-cant">${prep.mat ? `<small>Comprar</small><strong>${esc(l.comprarTxt)}</strong>${l.f.sinCantidad ? '' : `<small>(${esc(l.cantidadTxt)} + desperdicio)</small>`}` : `<strong>${esc(l.cantidadTxt)}</strong>`}</span>
            <span class="fl-costo">${esc(l.costoTxt)}</span></a>`).join('')}
        </div>`).join('')
      : `<p class="muted">Ningún concepto de este proyecto lleva ${prep.mat ? 'material' : 'mano de obra'}.</p>`}
      <div class="total-lista"><span>Total ${prep.mat ? 'de materiales' : 'de mano de obra'}</span><strong id="ls-total">${formatoPesos(prep.total)}</strong></div>
      <p class="small muted">Costos directos, sin indirectos, utilidad ni IVA. Toca un concepto para editar su cantidad o sus precios.</p>
    </section>
    <div class="actions">
      <button class="btn primary" id="ls-pdf">Descargar PDF</button>
      <button class="btn" id="ls-copiar">Copiar texto</button>
      ${navigator.share ? '<button class="btn" id="ls-compartir">Compartir</button>' : ''}
    </div>`;

  const guardar = () => { p.actualizado = ahora(); return dbGuardar('proyectos', p); };
  $$('.seg').forEach(b => b.addEventListener('click', async () => { cfg.tipo = b.dataset.tipo; await guardar(); pestanaListas(p); }));
  $('#ls-grupo').addEventListener('change', async e => { cfg.grupo = e.target.value; await guardar(); pestanaListas(p); });
  $('#ls-copiar').addEventListener('click', async () => aviso(await copiarTexto(textoLista(p, prep)) ? 'Lista copiada. Pégala en WhatsApp o en un mensaje.' : 'No se pudo copiar. Usa Descargar PDF.', ''));
  const comp = $('#ls-compartir');
  if (comp) comp.addEventListener('click', async () => {
    try { await navigator.share({ title: `${prep.mat ? 'Lista de materiales' : 'Lista de mano de obra'} - ${p.nombre}`, text: textoLista(p, prep) }); }
    catch (e) { if (e.name !== 'AbortError') aviso('No se pudo compartir: ' + e.message, 'error'); }
  });
  $('#ls-pdf').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; const t0 = b.textContent; b.textContent = 'Preparando PDF…';
    try {
      const archivo = await generarPDFLista(p, cfg.tipo, prep.grupos, formatoPesos(prep.total));
      descargarArchivo(archivo); aviso('Descargando ' + archivo.name + '. Búscalo en la carpeta Descargas.');
    } catch (err) { console.error(err); aviso('No se pudo crear el PDF: ' + err.message, 'error'); }
    b.disabled = false; b.textContent = t0;
  });
}
