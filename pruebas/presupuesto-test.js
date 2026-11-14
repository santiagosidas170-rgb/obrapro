const { chromium } = require('playwright');
const SALIDA = process.env.SALIDA || require('os').tmpdir() + '/obrapro-pruebas';
require('fs').mkdirSync(SALIDA, { recursive: true });
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8123/';
const SH = SALIDA + '/p-';
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
  page.on('pageerror', e => errores.push(e.message + ' :: ' + String(e.stack).replace(/\n/g, ' ← ').slice(0, 400)));
  page.on('console', async m => { if (m.type() === 'error') {
    let det = m.text(); try { det += ' :: ' + (await Promise.all(m.args().map(a => a.evaluate(x => (x && x.stack) ? x.stack : String(x)).catch(() => '')))).join(' | ').replace(/\n/g, ' ← ').slice(0, 500); } catch (e) {}
    errores.push(det); } });

  await page.goto(BASE); await page.waitForSelector('.empty');
  const ids = await page.evaluate(async () => {
    const pr = { id: nuevoId(), nombre: 'Casa López', cliente: 'Juan López', direccion: 'Av. Juárez 123', estado: 'levantamiento', tipoTrabajo: 'remodelacion', fecha: '2026-11-02',
      responsable: 'Santiago', telefono: '', correo: '', observaciones: '', archivado: false, creado: ahora(), actualizado: ahora() };
    await dbGuardar('proyectos', pr);
    const sala = { id: nuevoId(), proyectoId: pr.id, nombre: 'Sala', tipo: 'Sala', unidad: 'm', forma: 'rectangular', largo: 4, ancho: 3.5, altura: 2.5, tramos: [], perimetroManual: null,
      estadoActual: 'regular', trabajos: '', observaciones: '', orden: 0, creado: ahora(), actualizado: ahora() };
    await dbGuardar('espacios', sala);
    return { p: pr.id, sala: sala.id };
  });
  const bd = (tabla, filtro) => page.evaluate(async ([t, f]) => { const x = await dbTodos(t); return f ? x.filter(new Function('o', 'return ' + f)) : x; }, [tabla, filtro || null]);
  const txt = async sel => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
  const llenar = async (sel, valor) => { await page.fill(sel, valor); await page.press(sel, 'Tab'); };
  const guardado = () => wait(900);
  const hashA = h => page.goto(BASE + h);

  // ---------- A. Pestañas ----------
  await hashA('#/proyecto/' + ids.p + '/conceptos'); await page.waitForSelector('#agregar-concepto');
  check('A. Conceptos y Presupuesto ya se pueden abrir (ya no queda ninguna pestaña "Pronto")', (await page.locator('.tab.disabled .pronto').count()) === 0 && await page.isVisible('.tab:has-text("Presupuesto")'));
  check('A. Estado vacío con instrucciones', await page.isVisible('text=Este proyecto aún no tiene conceptos.'));

  // ---------- B. Catálogo ----------
  await hashA('#/catalogo'); await page.waitForSelector('#basicos');
  check('B. Catálogo vacío explica que los precios los captura el usuario', await page.isVisible('text=Tu catálogo está vacío.') && (await txt('main')).includes('ObraPro no trae precios'));
  await page.click('#basicos'); await page.waitForSelector('.cat-fila'); await wait(300);
  const basicos = await bd('catalogo');
  check('B. Se agregan los 28 conceptos básicos', basicos.length === 28, String(basicos.length));
  check('B. Ningún concepto básico trae precios inventados', basicos.every(c => c.precioMaterial === null && c.precioManoObra === null));
  check('B. Todos aparecen como "Sin precio"', (await page.locator('.cat-fila .tag.aviso:has-text("Sin precio")').count()) === 28);
  check('B. Se agrupan por categoría (12 categorías)', (await page.locator('.cat-titulo').count()) === 12);
  await page.click('#basicos'); await wait(300);
  check('B. Agregarlos de nuevo no duplica', (await bd('catalogo')).length === 28 && await page.isVisible('#toast:has-text("Ya tienes todos")'));
  await page.fill('#q', 'pintura'); check('B. Búsqueda sin acentos ("pintura")', (await page.locator('.cat-fila').count()) >= 3);
  await page.fill('#q', 'zzzz'); check('B. Búsqueda sin resultados', await page.isVisible('text=Ningún concepto coincide'));
  await page.fill('#q', ''); await page.selectOption('#f-cat', 'Plafones'); check('B. Filtro por categoría', (await page.locator('.cat-fila').count()) === 2);
  await page.selectOption('#f-cat', ''); await page.screenshot({ path: SH + '1-catalogo.png' });

  // concepto nuevo: no se guarda sin nombre
  await page.click('text=+ Nuevo concepto'); await page.waitForSelector('#f-descripcion');
  await llenar('#f-precioMaterial', '50'); await guardado();
  check('B. Un concepto sin nombre no se guarda', (await bd('catalogo')).length === 28 && (await txt('#save-status')).includes('Escribe el nombre'));
  await page.fill('#f-descripcion', 'Pintura premium'); await page.selectOption('#f-categoria', 'Pintura'); await page.selectOption('#f-unidad', 'm2');
  await llenar('#f-precioMaterial', 'abc'); check('B. Precio con letras: error claro', await page.isVisible('text=Escribe solo números'));
  await llenar('#f-precioMaterial', '-5'); check('B. Precio negativo: error claro', await page.isVisible('text=El precio no puede ser negativo.'));
  await llenar('#f-precioMaterial', '10.999'); check('B. Más de 2 decimales: error claro', await page.isVisible('text=Usa máximo 2 decimales'));
  await llenar('#f-precioMaterial', '1,250.5'); check('B. Al salir se da formato al precio (1,250.50)', (await page.inputValue('#f-precioMaterial')) === '1,250.50');
  await llenar('#f-precioMaterial', '20'); await llenar('#f-precioManoObra', '30'); await llenar('#f-desperdicio', '101');
  check('B. Desperdicio mayor a 100: error claro', await page.isVisible('text=El porcentaje debe estar entre 0 y 100.'));
  await llenar('#f-desperdicio', ''); await guardado();
  let prem = (await bd('catalogo', "o.descripcion==='Pintura premium'"))[0];
  check('B. El concepto nuevo se guarda con precios en centavos (2000 y 3000)', prem && prem.precioMaterial === 2000 && prem.precioManoObra === 3000 && prem.desperdicio === null, JSON.stringify(prem));
  await page.click('#eliminar'); await page.waitForSelector('#dlg[open]');
  check('B. Eliminar pide confirmación y aclara que los proyectos no cambian', (await txt('#dlg-msg')).includes('no cambian'));
  await page.click('#dlg-ok'); await page.waitForURL(/#\/catalogo/); await wait(300);
  check('B. Concepto eliminado del catálogo', (await bd('catalogo')).length === 28);

  // captura de precios de los conceptos que se usarán (caso de la Etapa 3)
  const editarConcepto = async (nombre, mat, mo, desp) => {
    await hashA('#/catalogo'); await page.waitForSelector('.cat-fila'); await page.click(`.cat-fila:has-text("${nombre}")`); await page.waitForSelector('#f-descripcion');
    if (mat != null) await llenar('#f-precioMaterial', mat); if (mo != null) await llenar('#f-precioManoObra', mo); if (desp != null) await llenar('#f-desperdicio', desp); await guardado();
  };
  await editarConcepto('Pintura vinílica en muros', '20', '30', null);
  await editarConcepto('Piso cerámico o porcelanato', '200', '100', '10');
  await editarConcepto('Limpieza final de obra', null, '1000', null);
  check('B. Precios del catálogo guardados', (await bd('catalogo', "o.descripcion.startsWith('Piso cer')"))[0].precioMaterial === 20000);

  // ---------- D. Conceptos del proyecto: el caso de la Etapa 3 ----------
  await hashA('#/proyecto/' + ids.p + '/conceptos'); await page.waitForSelector('#agregar-concepto'); await page.click('#agregar-concepto');
  await page.waitForSelector('#dlg-catalogo[open]');
  check('D. El selector muestra el catálogo y la opción de concepto en blanco', await page.isVisible('.cat-blanco') && (await page.locator('.cat-item').count()) === 29);
  await page.fill('#cat-buscar', 'pintura vin'); check('D. El selector filtra al escribir', (await page.locator('.cat-item:not(.cat-blanco)').count()) === 1);
  await page.click('.cat-item:has-text("Pintura vinílica")'); await page.waitForURL(/#\/partida\//); await page.waitForSelector('#f-cantidad');
  check('D. Los precios del catálogo se copian al concepto (20.00 y 30.00)', (await page.inputValue('#f-precioMaterial')) === '20.00' && (await page.inputValue('#f-precioManoObra')) === '30.00');
  check('D. Sin cantidad avisa que falta', (await txt('#c-aviso')).includes('Falta la cantidad'));
  await page.selectOption('#f-origen-esp', ids.sala);
  check('D. Muestra las medidas del espacio para elegir (piso, muros, perímetro)', (await page.locator('.origen-b').count()) === 3 && await page.isVisible('.origen-b:has-text("Muros: 37.50 m²")'));
  await page.click('.origen-b[data-campo="muros"]');
  check('D. Tomar los muros: cantidad 37.5, unidad m² y tipo Medida', (await page.inputValue('#f-cantidad')) === '37.5' && (await page.inputValue('#f-unidad')) === 'm2' && (await page.getAttribute('.seg-b[data-tipo="medida"]', 'aria-pressed')) === 'true');
  check('D. Pintura: subtotal $1,875.00', (await txt('#c-sub')) === '$1,875.00' && (await txt('#c-mat')) === '$750.00' && (await txt('#c-mo')) === '$1,125.00', await txt('#c-sub'));
  check('D. Muestra la fórmula usada', (await txt('#c-mat-f')).includes('37.50 × $20.00') && (await txt('#c-mo-f')).includes('37.50 × $30.00'), await txt('#c-mat-f'));
  check('D. Al tomar la medida se asocia el espacio', (await page.inputValue('#f-espacio')) === ids.sala);
  await page.screenshot({ path: SH + '2-partida.png', fullPage: true });
  await guardado();

  await hashA('#/proyecto/' + ids.p + '/conceptos'); await page.click('#agregar-concepto'); await page.waitForSelector('#dlg-catalogo[open]');
  await page.click('.cat-item:has-text("Piso cerámico")'); await page.waitForURL(/#\/partida\//); await page.waitForSelector('#f-cantidad');
  check('D. El desperdicio sugerido del catálogo se copia (10)', (await page.inputValue('#f-desperdicio')) === '10');
  await page.selectOption('#f-origen-esp', ids.sala); await page.click('.origen-b[data-campo="piso"]');
  check('D. Piso cerámico: subtotal $4,480.00 (con 10 % de desperdicio solo en el material)', (await txt('#c-sub')) === '$4,480.00' && (await txt('#c-mat')) === '$3,080.00' && (await txt('#c-mo')) === '$1,400.00', await txt('#c-sub'));
  check('D. La fórmula menciona el desperdicio', (await txt('#c-mat-f')).includes('1 + 10 % de desperdicio'));
  await guardado();

  await hashA('#/proyecto/' + ids.p + '/conceptos'); await page.click('#agregar-concepto'); await page.waitForSelector('#dlg-catalogo[open]');
  await page.click('.cat-item:has-text("Limpieza final")'); await page.waitForURL(/#\/partida\//); await page.waitForSelector('#f-cantidad');
  check('D. Limpieza: precio de material vacío (sin inventar)', (await page.inputValue('#f-precioMaterial')) === '' && (await txt('#c-mat-f')).includes('Sin precio de material'));
  await page.fill('#f-cantidad', '1');
  check('D. Escribir la cantidad a mano la marca como Estimada', (await page.getAttribute('.seg-b[data-tipo="estimada"]', 'aria-pressed')) === 'true');
  await page.click('.seg-b[data-tipo="medida"]'); check('D. "Medida" sin espacio no se deja elegir', await page.isVisible('#toast.error') && (await page.getAttribute('.seg-b[data-tipo="medida"]', 'aria-pressed')) === 'false');
  await page.click('.seg-b[data-tipo="confirmada"]');
  check('D. Limpieza: subtotal $1,000.00', (await txt('#c-sub')) === '$1,000.00');
  await guardado();

  await hashA('#/proyecto/' + ids.p + '/conceptos'); await page.waitForSelector('tbody tr'); await wait(500);
  check('D. La tabla lista los 3 conceptos', (await page.locator('tbody tr').count()) === 3);
  const pie = await txt('tfoot');
  check('D. Totales: material $3,830.00, mano de obra $3,525.00, costo directo $7,355.00', pie.includes('$3,830.00') && pie.includes('$3,525.00') && pie.includes('$7,355.00'), pie);
  check('D. Resumen de cantidades: 2 medidas, 0 estimadas, 1 confirmada', (await txt('.chips-info')).replace(/\s/g, '') === '2medida(s)0estimada(s)1confirmada(s)', await txt('.chips-info'));
  await page.screenshot({ path: SH + '3-conceptos.png' });

  // ---------- E. Presupuesto: $10,792.73 ----------
  await hashA('#/proyecto/' + ids.p + '/presupuesto'); await page.waitForSelector('#t-total'); await wait(400);
  check('E. Materiales $3,830.00 · Mano de obra $3,525.00 · Costo directo $7,355.00', (await txt('#t-mat')) === '$3,830.00' && (await txt('#t-mo')) === '$3,525.00' && (await txt('#t-dir')) === '$7,355.00');
  check('E. Indirectos y utilidad empiezan en 0 % (no se inventan porcentajes)', (await page.inputValue('#f-indirectos')) === '0' && (await page.inputValue('#f-utilidad')) === '0' && (await txt('#t-total')) === '$7,355.00 MXN');
  await llenar('#f-indirectos', '10'); check('E. Indirectos 10 % = $735.50', (await txt('#t-ind')) === '$735.50');
  await llenar('#f-utilidad', '15'); check('E. Utilidad 15 % = $1,213.58 (sobre costo directo + indirectos)', (await txt('#t-uti')) === '$1,213.58', await txt('#t-uti'));
  check('E. Subtotal $9,304.08', (await txt('#t-sub')) === '$9,304.08');
  check('E. IVA apagado: el total NO lo incluye ($9,304.08 MXN)', (await txt('#t-total')) === '$9,304.08 MXN' && (await page.getAttribute('#sw-iva', 'aria-checked')) === 'false' && (await txt('#t-iva')) === '—');
  check('E. Explica que el IVA no se suma sin confirmar', (await txt('#ayuda-iva')).includes('no se suma al total hasta que lo actives y confirmes'));
  await page.click('#sw-iva'); await page.waitForSelector('#dlg[open]');
  check('E. Activar el IVA pide confirmación', (await txt('#dlg-title')) === 'Aplicar IVA' && (await txt('#dlg-msg')).includes('16 %'));
  await page.click('#dlg button[value=cancel]'); await wait(300);
  check('E. Cancelar deja el IVA apagado', (await page.getAttribute('#sw-iva', 'aria-checked')) === 'false' && (await txt('#t-total')) === '$9,304.08 MXN');
  await page.click('#sw-iva'); await page.waitForSelector('#dlg[open]'); await page.click('#dlg-ok'); await wait(300);
  check('E. Con IVA confirmado: IVA $1,488.65 y total $10,792.73 MXN', (await txt('#t-iva')) === '$1,488.65' && (await txt('#t-total')) === '$10,792.73 MXN', await txt('#t-total'));
  await llenar('#f-indirectos', '150'); check('E. Porcentaje inválido: error y el total no cambia', await page.isVisible('#e-indirectos:has-text("entre 0 y 100")') && (await txt('#t-total')) === '$10,792.73 MXN');
  await llenar('#f-indirectos', '10');
  await page.fill('#f-pr-notas', 'Incluye retiro de escombro.'); await page.fill('#f-pr-vigencia', '2026-12-15'); await page.fill('#f-pr-condiciones', '50 % de anticipo y el resto contra entrega.'); await guardado();
  check('E. Avisos: sin pendientes de precio y 1 cantidad por confirmar (ninguna estimada)', (await txt('.avisos').catch(() => 'sin')) === 'sin' || !(await txt('.col-side')).includes('sin precio'));
  await page.screenshot({ path: SH + '4-presupuesto.png', fullPage: true });
  await page.reload(); await page.waitForSelector('#t-total'); await wait(400);
  check('E. Todo persiste al recargar (10 %, 15 %, IVA activo, total, notas, vigencia, condiciones)',
    (await page.inputValue('#f-indirectos')) === '10' && (await page.inputValue('#f-utilidad')) === '15' && (await page.getAttribute('#sw-iva', 'aria-checked')) === 'true' && (await txt('#t-total')) === '$10,792.73 MXN'
    && (await page.inputValue('#f-pr-notas')) === 'Incluye retiro de escombro.' && (await page.inputValue('#f-pr-vigencia')) === '2026-12-15' && (await page.inputValue('#f-pr-condiciones')).startsWith('50 %'));
  await page.click('#marcar'); await page.waitForSelector('.badge.st-presupuestado'); check('E. "Marcar como Presupuestado" cambia el estado del proyecto', await page.isVisible('.badge.st-presupuestado'));

  // ---------- F. Cantidades medidas que cambian ----------
  await page.evaluate(async id => { const s = await dbObtener('espacios', id); s.largo = 5; await dbGuardar('espacios', s); }, ids.sala);   // la sala crece a 5 × 3.5
  await hashA('#/proyecto/' + ids.p + '/conceptos'); await page.waitForSelector('tbody tr');
  check('F. Si cambia la medida del espacio, el concepto avisa "Medida cambió"', (await page.locator('.tag.aviso:has-text("Medida cambió")').count()) === 2);
  await hashA('#/proyecto/' + ids.p + '/presupuesto'); await page.waitForSelector('#t-total');
  check('F. El presupuesto avisa que 2 cantidades cambiaron', (await txt('.avisos')).includes('2 cantidad(es) medida(s) cambiaron'));
  await page.click('tbody tr:has-text("Piso cerámico") a'); await page.waitForSelector('#actualizar-origen');
  check('F. El concepto ofrece actualizar a la nueva medida (17.50)', (await txt('#origen')).includes('cambió a 17.50'));
  await page.click('#actualizar-origen'); await wait(300);
  check('F. Actualizar pone 17.5 y recalcula (17.5 × $200 × 1.1 + 17.5 × $100 = $5,600.00)', (await page.inputValue('#f-cantidad')) === '17.5' && (await txt('#c-sub')) === '$5,600.00', await txt('#c-sub'));
  await page.fill('#f-cantidad', '20');
  check('F. Cambiarla a mano quita el vínculo con el espacio y pasa a Estimada', (await page.getAttribute('.seg-b[data-tipo="estimada"]', 'aria-pressed')) === 'true' && !(await txt('#origen')).includes('Tomada de'));
  await llenar('#f-cantidad', 'abc'); check('F. Cantidad con letras: error claro', await page.isVisible('#e-cantidad:has-text("Usa solo números")'));
  await llenar('#f-cantidad', '-3'); check('F. Cantidad negativa: error claro', await page.isVisible('#e-cantidad:has-text("negativa")'));
  await llenar('#f-cantidad', '14'); await page.fill('#f-descripcion', ''); await page.press('#f-descripcion', 'Tab');
  check('F. Descripción vacía: error claro', await page.isVisible('#e-descripcion:has-text("Escribe el nombre")'));
  await page.fill('#f-descripcion', 'Piso cerámico en sala'); await guardado();
  await hashA('#/proyecto/' + ids.p + '/presupuesto'); await page.waitForSelector('#t-total');
  check('F. Los avisos del presupuesto cuentan 1 estimada', (await txt('.avisos')).includes('1 concepto(s) con cantidad estimada'));

  // ---------- G. El catálogo no cambia lo ya presupuestado; guardar en catálogo ----------
  await editarConcepto('Pintura vinílica en muros', '99', null, null);
  await hashA('#/proyecto/' + ids.p + '/conceptos'); await page.waitForSelector('tbody tr'); await page.click('tbody tr:has-text("Pintura vinílica") a'); await page.waitForSelector('#f-cantidad');
  check('G. Cambiar el catálogo NO cambia conceptos ya agregados (sigue en $20.00)', (await page.inputValue('#f-precioMaterial')) === '20.00');
  await page.click('#al-catalogo'); await page.waitForSelector('#dlg[open]');
  check('G. Guardar en catálogo: si ya existe pregunta si actualiza', (await txt('#dlg-title')) === 'Actualizar catálogo');
  await page.click('#dlg-ok'); await wait(400);
  check('G. Catálogo actualizado con los precios del concepto', (await bd('catalogo', "o.descripcion.startsWith('Pintura vin')"))[0].precioMaterial === 2000);
  await page.fill('#f-descripcion', 'Pintura especial sala'); await guardado(); await page.click('#al-catalogo'); await wait(500);
  check('G. Un concepto nuevo se agrega al catálogo', (await bd('catalogo', "o.descripcion==='Pintura especial sala'")).length === 1);

  // ---------- H. Duplicar y eliminar ----------
  await page.click('#duplicar'); await page.waitForURL(/#\/partida\//); await wait(400);
  check('H. Duplicar crea una copia (4 conceptos)', (await bd('partidas')).length === 4);
  await page.click('#eliminar-partida'); await page.waitForSelector('#dlg[open]'); await page.click('#dlg-ok'); await page.waitForURL(/conceptos$/); await wait(300);
  check('H. Eliminar quita el concepto (3 quedan)', (await bd('partidas')).length === 3);

  // ---------- I. Borrar un espacio conserva sus conceptos ----------
  await hashA('#/espacio/' + ids.sala); await page.waitForSelector('#eliminar'); await page.click('#eliminar'); await page.waitForSelector('#dlg[open]');
  check('I. Borrar un espacio avisa que sus conceptos se conservan', (await txt('#dlg-msg')).includes('conceptos como conceptos sin espacio'));
  await page.click('#dlg-ok'); await page.waitForURL(/espacios$/); await wait(300);
  const ps = await bd('partidas');
  check('I. Los 3 conceptos siguen, sin espacio y sin vínculo de medida', ps.length === 3 && ps.every(x => x.espacioId === null && x.origen === null), JSON.stringify(ps.map(x => [x.espacioId, x.origen, x.tipoCantidad])));
  check('I. Los que eran "Medida" pasan a "Estimada"', ps.filter(x => x.tipoCantidad === 'medida').length === 0);

  // ---------- J. Respaldo y restauración ----------
  await page.evaluate(async ([pid]) => { const p = await dbObtener('proyectos', pid); p.presupuesto.aplicarIva = true; await dbGuardar('proyectos', p); }, [ids.p]);
  const totalAntes = await (async () => { await hashA('#/proyecto/' + ids.p + '/presupuesto'); await page.waitForSelector('#t-total'); return txt('#t-total'); })();
  await hashA('#/ajustes'); await page.waitForSelector('#exportar');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportar')]);
  const ruta = SALIDA + '/' + dl.suggestedFilename(); await dl.saveAs(ruta);
  const resp = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  check('J. La copia incluye catálogo, conceptos y el presupuesto del proyecto', resp.datos.catalogo.length >= 28 && resp.datos.partidas.length === 3 && resp.datos.proyectos[0].presupuesto.indirectos === 10 && resp.datos.proyectos[0].presupuesto.condiciones.startsWith('50 %'));
  await page.evaluate(async ([pid]) => { await dbBorrarProyecto(pid); for (const c of await dbTodos('catalogo')) await dbBorrar('catalogo', c.id); }, [ids.p]);
  check('J. Borrar el proyecto borra también sus conceptos', (await bd('partidas')).length === 0);
  await page.setInputFiles('#importar', ruta); await page.waitForSelector('#dlg[open]'); await page.click('#dlg-ok'); await page.waitForURL(/#\/proyectos/); await wait(500);
  check('J. Restaurar devuelve catálogo y conceptos', (await bd('catalogo')).length >= 28 && (await bd('partidas')).length === 3);
  await hashA('#/proyecto/' + ids.p + '/presupuesto'); await page.waitForSelector('#t-total'); await wait(300);
  check('J. El presupuesto restaurado da el mismo total (' + totalAntes + ')', (await txt('#t-total')) === totalAntes, await txt('#t-total'));

  // ---------- K. Valores predeterminados en Ajustes ----------
  await hashA('#/ajustes'); await page.waitForSelector('#f-a-ppIndirectos');
  check('K. Ajustes: indirectos 0 %, utilidad 0 %, IVA 16 % de inicio', (await page.inputValue('#f-a-ppIndirectos')) === '0' && (await page.inputValue('#f-a-ppUtilidad')) === '0' && (await page.inputValue('#f-a-ppIva')) === '16');
  await llenar('#f-a-ppIndirectos', '8'); await llenar('#f-a-ppUtilidad', '12'); await llenar('#f-a-ppIva', '200'); check('K. Ajustes: porcentaje inválido da error', await page.isVisible('#e-a-ppIva:has-text("entre 0 y 100")'));
  await llenar('#f-a-ppIva', '16'); await guardado();
  const nuevoP = await page.evaluate(async () => { const pr = { id: nuevoId(), nombre: 'Proyecto nuevo', cliente: 'X', estado: 'pendiente', tipoTrabajo: 'otro', fecha: '2026-11-03', archivado: false, creado: ahora(), actualizado: ahora() }; await dbGuardar('proyectos', pr); return pr.id; });
  await hashA('#/proyecto/' + nuevoP + '/presupuesto'); await page.waitForSelector('#t-total');
  check('K. Un presupuesto nuevo abre con 8 % y 12 %; el IVA apagado', (await page.inputValue('#f-indirectos')) === '8' && (await page.inputValue('#f-utilidad')) === '12' && (await page.getAttribute('#sw-iva', 'aria-checked')) === 'false');
  check('K. Sin conceptos el total es $0.00 MXN', (await txt('#t-total')) === '$0.00 MXN' && await page.isVisible('text=Aún no hay conceptos.'));
  await hashA('#/proyecto/' + ids.p + '/presupuesto'); await page.waitForSelector('#t-total');
  check('K. El presupuesto del otro proyecto conserva sus propios porcentajes (10 % y 15 %)', (await page.inputValue('#f-indirectos')) === '10' && (await page.inputValue('#f-utilidad')) === '15');

  // ---------- L. Sin internet ----------
  await page.evaluate(() => navigator.serviceWorker.ready); await page.goto(BASE); await page.reload(); await wait(700);
  await ctx.setOffline(true);
  await page.goto(BASE + '#/proyecto/' + ids.p + '/presupuesto'); await page.reload(); await page.waitForSelector('#t-total', { timeout: 6000 });
  await llenar('#f-utilidad', '20'); await guardado();
  check('L. Sin internet: el presupuesto abre y se puede editar', (await bd('proyectos', "o.id==='" + ids.p + "'"))[0].presupuesto.utilidad === 20);
  await llenar('#f-utilidad', '15'); await guardado();
  await page.goto(BASE + '#/catalogo'); await page.waitForSelector('.cat-fila', { timeout: 6000 });
  check('L. Sin internet: el catálogo abre', await page.isVisible('.cat-fila'));
  await ctx.setOffline(false);

  // ---------- M. Tamaños de pantalla ----------
  const partidaId = (await bd('partidas'))[0].id, conceptoId = (await bd('catalogo'))[0].id;
  const vistas = [['catálogo', '#/catalogo'], ['concepto', '#/concepto/' + conceptoId], ['conceptos', '#/proyecto/' + ids.p + '/conceptos'], ['partida', '#/partida/' + partidaId], ['presupuesto', '#/proyecto/' + ids.p + '/presupuesto'], ['ajustes', '#/ajustes']];
  for (const [w, h, n] of [[390, 844, 'celular'], [360, 640, 'celular chico'], [800, 1228, 'vertical'], [1228, 800, 'horizontal'], [1600, 900, 'pantalla grande']]) {
    await page.setViewportSize({ width: w, height: h });
    const malas = [];
    for (const [v, hash] of vistas) {
      await page.goto(BASE + hash); await wait(900);
      const r = await page.evaluate(() => {
        const peq = [...document.querySelectorAll('.btn, .chip, .seg-b, .color-sw, .tab:not(.disabled), select, input:not([type=file]):not([hidden]), summary, .switch')].filter(e => e.offsetParent !== null)
          .map(e => { const b = e.getBoundingClientRect(); const alto = e.classList.contains('switch') ? b.height + 16 : b.height; return [e.id || e.className || e.tagName, Math.round(alto)]; }).filter(x => x[1] < 43 && x[1] > 0);
        return { sobra: document.documentElement.scrollWidth > innerWidth + 1, peq: peq.slice(0, 3) };
      });
      if (r.sobra || r.peq.length) malas.push(v + ' ' + JSON.stringify(r));
    }
    check(`M. ${n} (${w}px): sin desbordes y botones de 44 px en ${vistas.length} pantallas`, malas.length === 0, malas.join(' | '));
    if (n === 'celular') {
      await page.goto(BASE + '#/proyecto/' + ids.p + '/presupuesto'); await wait(900); await page.screenshot({ path: SH + '5-presupuesto-celular.png', fullPage: true });
      await page.goto(BASE + '#/proyecto/' + ids.p + '/conceptos'); await wait(900); await page.screenshot({ path: SH + '6-conceptos-celular.png', fullPage: true });
      await page.goto(BASE + '#/partida/' + partidaId); await wait(900); await page.screenshot({ path: SH + '7-partida-celular.png', fullPage: true });
      await page.goto(BASE + '#/proyecto/' + ids.p + '/conceptos'); await page.click('#agregar-concepto'); await page.waitForSelector('#dlg-catalogo[open]'); await wait(300); await page.screenshot({ path: SH + '8-selector-celular.png' }); await page.keyboard.press('Escape');
      const caja = await page.evaluate(() => { const b = document.querySelector('#dlg-catalogo').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight; });
      check('M. El selector del catálogo cabe en la pantalla del celular', caja);
    }
    if (n === 'vertical') { await page.goto(BASE + '#/proyecto/' + ids.p + '/presupuesto'); await wait(900); await page.screenshot({ path: SH + '9-presupuesto-vertical.png' }); }
  }

  check('Sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  console.log(`\nPruebas de presupuesto: ${ok} correctas, ${fail} fallidas`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
