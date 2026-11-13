const { chromium } = require('playwright');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
require('fs').mkdirSync(SALIDA, { recursive: true });
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8123/';
const OUT = SALIDA + '/backup';
fs.mkdirSync(OUT, { recursive: true });
const TABLAS = ['proyectos', 'espacios', 'fotos', 'catalogo', 'partidas', 'ajustes'];
let ok = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { ok++; console.log('✔', n); } else { fail++; console.log('✘', n, x); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SKIP = () => { try { sessionStorage.setItem('obrapro-splash', '1'); } catch (e) {} };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1228, height: 800 }, acceptDownloads: true, locale: 'es-MX' });
  await ctx.addInitScript(SKIP);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto(BASE); await page.waitForSelector('.empty');

  /* ---------- Datos ricos: 2 proyectos, 40 fotos, catálogo, presupuesto, logo y firmas ---------- */
  const sembrar = await page.evaluate(async () => {
    const t0 = performance.now();
    const ids = [];
    for (let k = 0; k < 2; k++) {
      const pr = { id: nuevoId(), nombre: 'Proyecto ' + k + ' ñandú', cliente: 'Cliente ' + k, direccion: 'Calle ' + k, estado: 'presupuestado', tipoTrabajo: 'remodelacion', fecha: '2026-11-0' + (k + 1),
        responsable: 'Santiago', telefono: '5512345678', correo: 'a@b.mx', observaciones: 'Línea 1\nLínea 2 "comillas" <b>', archivado: k === 1, creado: ahora(), actualizado: ahora(),
        presupuesto: { indirectos: 10, utilidad: 15, aplicarIva: true, iva: 16, notas: 'n', vigencia: '15 días', condiciones: 'c' },
        reporte: { sel: null, fotos: true, medidas: true, fotosGenerales: true, conceptos: true, presupuesto: true, firmas: true },
        firmaCliente: { img: 'data:image/png;base64,iVBORw0KGgo=', nombre: 'X', fecha: '2026-11-12' } };
      await dbGuardar('proyectos', pr);
      const esp = { id: nuevoId(), proyectoId: pr.id, nombre: 'Sala ' + k, tipo: 'Sala', unidad: 'cm', forma: 'irregular', largo: null, ancho: null, altura: 250,
        tramos: [{ id: 't1', largo: 500, ancho: 300, signo: 1 }, { id: 't2', largo: 100, ancho: 100, signo: -1 }], perimetroManual: 1800, estadoActual: 'malo', trabajos: 'Pintar', observaciones: 'Obs', orden: 0, creado: ahora(), actualizado: ahora() };
      await dbGuardar('espacios', esp);
      for (let i = 0; i < 20; i++) {
        const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
        const x = c.getContext('2d');
        for (let j = 0; j < 400; j++) { x.fillStyle = `hsl(${(i * 37 + j * 11) % 360},60%,${30 + (j % 40)}%)`; x.fillRect((j * 97) % 1600, (j * 53) % 1200, 120, 90); }
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
        const d = await procesarImagen(new File([blob], 'f.jpg', { type: 'image/jpeg' }));
        await dbGuardar('fotos', Object.assign({ id: nuevoId(), proyectoId: pr.id, espacioId: i % 3 ? esp.id : null, descripcion: 'Foto ' + i + ' áéíóú', categoria: 'dano',
          anotaciones: i % 2 ? [{ id: 'a' + i, tipo: 'medida', x1: .1, y1: .2, x2: .8, y2: .6, texto: '3.20 m', color: '#ffd23f' }] : [],
          fecha: new Date(Date.now() + i).toISOString(), creado: ahora(), actualizado: ahora() }, d));
      }
      await dbGuardar('partidas', { id: nuevoId(), proyectoId: pr.id, espacioId: esp.id, descripcion: 'Pintura', categoria: 'Pintura', unidad: 'm²', cantidad: 12.5, precioMaterial: 18750, precioManoObra: 9000,
        desperdicio: 5, tipoCantidad: 'medida', origen: { espacioId: esp.id, campo: 'piso' }, creado: ahora(), actualizado: ahora() });
      ids.push(pr.id);
    }
    await dbGuardar('catalogo', { id: nuevoId(), descripcion: 'Concepto catálogo', categoria: 'Pisos', unidad: 'm²', precioMaterial: 12345, precioManoObra: null, desperdicio: 3, creado: ahora(), actualizado: ahora() });
    const a = await dbObtener('ajustes', 'app') || { id: 'app' };
    Object.assign(a, { id: 'app', unidad: 'cm', responsable: 'Santiago Sidas', ppIndirectos: 8, ppUtilidad: 12, ppIva: 16,
      rep: { empresa: 'SG', telefono: '1', correo: 'x@y.z', logo: 'data:image/png;base64,iVBORw0KGgo=', firma: 'data:image/png;base64,iVBORw0KGgo=' } });
    await dbGuardar('ajustes', a);
    return { ids, ms: Math.round(performance.now() - t0) };
  });
  console.log('   (datos sembrados en', sembrar.ms, 'ms)');

  /* instantánea comparable de toda la base (los blobs se resumen con SHA-256) */
  const instantanea = () => page.evaluate(async () => {
    const sha = async b => { const h = await crypto.subtle.digest('SHA-256', await b.arrayBuffer()); return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join('') + ':' + b.type; };
    const r = {};
    for (const t of TABLAS) {
      const filas = (await dbTodos(t)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      r[t] = [];
      for (const f of filas) {
        const g = Object.assign({}, f);
        if (g.imagen) g.imagen = await sha(g.imagen);
        if (g.miniatura) g.miniatura = await sha(g.miniatura);
        r[t].push(g);
      }
    }
    const orden = v => Array.isArray(v) ? v.map(orden) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, orden(v[k])])) : v;
    return JSON.stringify(orden(r));
  });
  const antes = await instantanea();
  const cuenta = tabla => page.evaluate(async t => (await dbTodos(t)).length, tabla);

  /* ---------- A. Descargar copia desde la pantalla de Ajustes ---------- */
  await page.goto(BASE + '#/ajustes'); await page.waitForSelector('#exportar');
  const t1 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exportar')]);
  const ruta = OUT + '/copia.json'; await dl.saveAs(ruta);
  const ms = Date.now() - t1, mb = fs.statSync(ruta).size / 1048576;
  console.log(`   (copia de ${mb.toFixed(1)} MB en ${ms} ms)`);
  check('A. Se descarga un archivo obrapro-respaldo-AAAA-MM-DD.json', /^obrapro-respaldo-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const copia = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  check('A. La copia es JSON válido de formato 2', copia.app === 'ObraPro' && copia.formato === 2);
  check('A. Trae las 6 tablas con sus registros (2 proyectos, 2 espacios, 40 fotos, 2 conceptos, catálogo, ajustes)',
    copia.datos.proyectos.length === 2 && copia.datos.espacios.length === 2 && copia.datos.fotos.length === 40 && copia.datos.partidas.length === 2 && copia.datos.catalogo.length === 1 && copia.datos.ajustes.length >= 1);
  check('A. Las fotos van como texto base64 (sin Blobs sueltos)', copia.datos.fotos.every(f => f.imagenData.startsWith('data:image/jpeg') && f.miniaturaData.startsWith('data:image/jpeg') && !f.imagen));
  check('A. Anota la fecha de la última copia', !!(await page.evaluate(async () => (await dbObtener('ajustes', 'app')).ultimoRespaldo)));

  /* ---------- B. Borrar todo y restaurar: debe quedar idéntico ---------- */
  await page.evaluate(async () => { for (const p of await dbTodos('proyectos')) await dbBorrarProyecto(p.id); for (const c of await dbTodos('catalogo')) await dbBorrar('catalogo', c.id); await dbBorrar('ajustes', 'app'); });
  check('B. Base vacía tras borrar', (await cuenta('proyectos')) === 0 && (await cuenta('fotos')) === 0 && (await cuenta('partidas')) === 0);
  await page.goto(BASE + '#/ajustes'); await page.waitForSelector('#importar', { state: 'attached' });
  await page.setInputFiles('#importar', ruta); await page.waitForSelector('#dlg[open]');
  const msg = (await page.textContent('#dlg-msg')).replace(/\s+/g, ' ');
  check('B. Pide confirmar y dice cuántos proyectos y fotos trae', msg.includes('2 proyecto(s)') && msg.includes('40 foto(s)') && msg.includes('reemplazarán TODOS'), msg);
  await page.click('#dlg-ok'); await page.waitForSelector('.empty, .cards, .lista, main h1', { timeout: 30000 }); await wait(1500);
  const despues = await instantanea();
  const a1 = JSON.parse(antes), d1 = JSON.parse(despues);
  const dif = [];
  for (const t of TABLAS) {
    if (t === 'ajustes') continue;
    if (JSON.stringify(a1[t]) !== JSON.stringify(d1[t])) dif.push(t);
  }
  if (dif.includes('fotos')) { const k = a1.fotos.findIndex((f, i) => JSON.stringify(f) !== JSON.stringify(d1.fotos[i])); const A = a1.fotos[k], D = d1.fotos[k];
    console.log('   foto distinta #' + k, Object.keys(A).filter(x => JSON.stringify(A[x]) !== JSON.stringify(D[x])).map(x => x + ': ' + String(JSON.stringify(A[x])).slice(0, 90) + ' => ' + String(JSON.stringify(D[x])).slice(0, 90)).join(' | '), 'total fotos', a1.fotos.length, d1.fotos.length); }
  check('B. Todo vuelve idéntico (proyectos, espacios, fotos con su imagen byte a byte, conceptos, catálogo)', dif.length === 0, 'difieren: ' + dif.join(','));
  const ajA = a1.ajustes.find(x => x.id === 'app'), ajD = d1.ajustes.find(x => x.id === 'app');
  check('B. Ajustes, logo, firma y porcentajes vuelven', ajD && ajD.rep.empresa === 'SG' && ajD.rep.logo === ajA.rep.logo && ajD.rep.firma === ajA.rep.firma && ajD.ppIndirectos === 8 && ajD.responsable === 'Santiago Sidas');
  check('B. Los acentos, comillas y saltos de línea no se dañan', d1.proyectos.some(p => p.nombre === 'Proyecto 0 ñandú' && p.observaciones === 'Línea 1\nLínea 2 "comillas" <b>'));
  check('B. La firma del cliente y la selección del reporte vuelven', d1.proyectos.every(p => p.firmaCliente && p.firmaCliente.nombre === 'X' && p.reporte));
  check('B. Las medidas irregulares y el presupuesto se conservan', d1.espacios[0].tramos.length === 2 && d1.proyectos[0].presupuesto.aplicarIva === true);
  check('B. La app sigue funcionando después de restaurar (lista de proyectos)', await page.isVisible('text=Proyecto 0 ñandú'));
  check('B. Las fotos se abren de verdad (imagen decodificable)', await page.evaluate(async () => { const f = (await dbTodos('fotos'))[0]; const i = await cargarImagen(f.imagen); return i.naturalWidth > 0; }));

  /* ---------- C. Archivos malos: no se cambia nada ---------- */
  const base = await instantanea();
  const intentar = async (nombre, contenido) => {
    const f = OUT + '/' + nombre; fs.writeFileSync(f, contenido);
    await page.goto(BASE + '#/ajustes'); await page.waitForSelector('#importar', { state: 'attached' });
    await page.setInputFiles('#importar', f); await wait(700);
    const hayDialogo = await page.isVisible('#dlg[open]');
    if (hayDialogo) { await page.click('#dlg-ok'); await wait(1200); }
    return { hayDialogo, aviso: (await page.textContent('#toast')).trim() };
  };
  let r = await intentar('no-json.json', 'esto no es json {{{');
  check('C. Archivo que no es JSON: avisa y no pregunta', !r.hayDialogo && /no se puede leer/.test(r.aviso), JSON.stringify(r));
  r = await intentar('otra-app.json', JSON.stringify({ app: 'OtraApp', datos: {} }));
  check('C. Copia de otra app: la rechaza', !r.hayDialogo && /no es una copia de seguridad de ObraPro/.test(r.aviso), JSON.stringify(r));
  const truncado = fs.readFileSync(ruta, 'utf8').slice(0, 200000);
  r = await intentar('truncado.json', truncado);
  check('C. Copia cortada a la mitad: la rechaza', !r.hayDialogo && /no se puede leer/.test(r.aviso), JSON.stringify(r));
  r = await intentar('sin-datos.json', JSON.stringify({ app: 'ObraPro', formato: 2 }));
  check('C. Copia sin sección de datos: no truena la app', !r.hayDialogo, JSON.stringify(r));
  check('C. Después de todos los archivos malos los datos siguen intactos', (await instantanea()) === base);
  r = await intentar('id-invalido.json', JSON.stringify({ app: 'ObraPro', formato: 2, datos: { proyectos: [{ id: true, nombre: 'x' }], espacios: [], fotos: [], catalogo: [], partidas: [], ajustes: [] } }));
  check('C. Copia con un registro de id inválido: falla y NO borra los datos actuales', (await instantanea()) === base && /No se pudo restaurar/.test(r.aviso), JSON.stringify(r) + ' | proyectos=' + (await cuenta('proyectos')));

  /* ---------- D. Copia vieja (formato 1, sin fotos) y fotos dañadas ---------- */
  const viejo = { app: 'ObraPro', formato: 1, exportado: '2026-10-01T10:00:00.000Z', datos: { proyectos: [{ id: 'p1', nombre: 'Viejo', cliente: 'C', estado: 'pendiente', tipoTrabajo: 'otro', creado: '2026-10-01', actualizado: '2026-10-01' }], espacios: [{ id: 'e1', proyectoId: 'p1', nombre: 'Cuarto', unidad: 'm', forma: 'rectangular', largo: 3, ancho: 2, orden: 0 }] } };
  r = await intentar('formato1.json', JSON.stringify(viejo));
  check('D. Copia vieja (formato 1) se restaura', r.hayDialogo && (await cuenta('proyectos')) === 1 && (await cuenta('espacios')) === 1 && (await cuenta('fotos')) === 0 && (await cuenta('partidas')) === 0, JSON.stringify(r));
  const con1foto = JSON.parse(JSON.stringify(copia));
  con1foto.datos.fotos = con1foto.datos.fotos.slice(0, 3); delete con1foto.datos.fotos[1].imagenData;
  r = await intentar('foto-danada.json', JSON.stringify(con1foto));
  const nf = await cuenta('fotos');
  check('D. Una foto sin imagen se omite y las demás se restauran (2 de 3)', nf === 2, String(nf));
  check('D. La app avisa cuántas fotos no se pudieron restaurar', /1 foto/.test(r.aviso) || /1 foto/.test(await page.textContent('#toast')), r.aviso);

  /* ---------- E. Restaurar un respaldo con los datos en pantalla de otro proyecto ---------- */
  await page.goto(BASE + '#/proyectos'); await page.waitForSelector('main');
  check('E. Sin errores de consola ni de página', errores.length === 0, errores.join(' | '));
  console.log(`\n${ok} bien, ${fail} mal`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
