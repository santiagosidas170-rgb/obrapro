const c = require(process.argv[2]);
let ok=0, fail=0;
function eq(name, got, exp){ if (got===exp){ok++;} else {fail++; console.log('FALLA', name, 'obtenido', got, 'esperado', exp);} }
const r = x => x==null? null : c.redondear2(x).toFixed(2);
let e;
e = c.calcularEspacio({forma:'rectangular', unidad:'m', largo:4, ancho:3.5, altura:2.5});
eq('A sup', r(e.superficie), '14.00'); eq('A per', r(e.perimetro), '15.00'); eq('A muros', r(e.muros), '37.50');
e = c.calcularEspacio({forma:'rectangular', unidad:'cm', largo:420, ancho:310});
eq('B sup', r(e.superficie), '13.02'); eq('B per', r(e.perimetro), '14.60');
e = c.calcularEspacio({forma:'rectangular', unidad:'ft', largo:12, ancho:10});
eq('C sup', r(e.superficie), '11.15'); eq('C per', r(e.perimetro), '13.41');
e = c.calcularEspacio({forma:'irregular', unidad:'m', tramos:[{largo:5,ancho:3,signo:1},{largo:2,ancho:1.5,signo:1}]});
eq('D sup', r(e.superficie), '18.00'); eq('D per', e.perimetro, null);
e = c.calcularEspacio({forma:'irregular', unidad:'m', tramos:[{largo:5,ancho:3,signo:1},{largo:2,ancho:1.5,signo:1},{largo:0.8,ancho:0.6,signo:-1}]});
eq('E sup', r(e.superficie), '17.52');
e = c.calcularEspacio({forma:'irregular', unidad:'m', tramos:[{largo:1,ancho:1,signo:1},{largo:2,ancho:2,signo:-1}]});
eq('neg aviso', !!e.aviso, true); eq('neg sup', e.superficie, null);
// validaciones
eq('vacío oblig', c.validarMedida('', 'el largo', true).error, 'Ingresa el largo.');
eq('negativo', c.validarMedida('-3', 'el largo', true).error, 'La medida debe ser mayor que cero.');
eq('cero', c.validarMedida('0', 'el largo', true).error, 'La medida debe ser mayor que cero.');
eq('texto', !!c.validarMedida('abc', 'el largo', true).error, true);
eq('coma', c.validarMedida('4,25', 'el largo', true).valor, 4.25);
eq('vacío opcional', c.validarMedida('', 'la altura', false).error, null);
// presupuesto
const partidas=[{cantidad:37.5,precioMaterial:2000,precioManoObra:3000,desperdicio:0},
 {cantidad:14,precioMaterial:20000,precioManoObra:10000,desperdicio:10},
 {cantidad:1,precioMaterial:0,precioManoObra:100000,desperdicio:0}];
let b = c.calcularPresupuesto(partidas,{indirectos:10,utilidad:15,aplicarIva:false,iva:16});
eq('material', b.material, 383000); eq('mo', b.manoObra, 352500); eq('directo', b.directo, 735500);
eq('indirectos', b.indirectos, 73550); eq('utilidad', b.utilidad, 121358); eq('subtotal', b.subtotal, 930408); eq('total sin iva', b.total, 930408);
b = c.calcularPresupuesto(partidas,{indirectos:10,utilidad:15,aplicarIva:true,iva:16});
eq('iva', b.iva, 148865); eq('total con iva', b.total, 1079273);
eq('formato', c.formatoMXN(1079273), '$10,792.73 MXN');

// ---- Etapa 6: dinero y porcentajes ----
const d = t => c.leerDinero(t);
eq('dinero 1875', d('1875').valor, 187500);
eq('dinero 1,875.00', d('1,875.00').valor, 187500);
eq('dinero $1,234.5', d('$1,234.5').valor, 123450);
eq('dinero 1.234,50 (formato europeo)', d('1.234,50').valor, 123450);
eq('dinero 12,5 (coma decimal)', d('12,5').valor, 1250);
eq('dinero 1,234 (miles)', d('1,234').valor, 123400);
eq('dinero 1,234,567', d('1,234,567').valor, 123456700);
eq('dinero 0', d('0').valor, 0);
eq('dinero .5', d('.5').valor, 50);
eq('dinero 20 MXN', d('20 MXN').valor, 2000);
eq('dinero vacío', d('').vacio, true);
eq('dinero texto = error', !!d('abc').error, true);
eq('dinero negativo = error', d('-5').error, 'El precio no puede ser negativo.');
eq('dinero 3 decimales = error', d('10.999').error, 'Usa máximo 2 decimales (centavos).');
eq('dinero con varios puntos se lee como miles (1.5.5 = 155 pesos)', d('1.5.5').valor, 15500);
eq('dinero solo símbolo = error', !!d('$').error || d('$').vacio, true);
eq('porcentaje 10', c.leerPorcentaje('10').valor, 10);
eq('porcentaje 10%', c.leerPorcentaje('10%').valor, 10);
eq('porcentaje 12,5', c.leerPorcentaje('12,5').valor, 12.5);
eq('porcentaje 101 = error', c.leerPorcentaje('101').error, 'El porcentaje debe estar entre 0 y 100.');
eq('porcentaje -1 = error', !!c.leerPorcentaje('-1').error, true);
eq('porcentaje texto = error', !!c.leerPorcentaje('x').error, true);
eq('cantidad 37,5', c.leerCantidad('37,5').valor, 37.5);
eq('cantidad negativa = error', c.leerCantidad('-2').error, 'La cantidad no puede ser negativa.');
eq('formatoPesos 187500', c.formatoPesos(187500), '$1,875.00');
eq('formatoPesos 0', c.formatoPesos(0), '$0.00');
eq('formatoPesos null', c.formatoPesos(null), '$0.00');
eq('formatoPesos 1079273', c.formatoPesos(1079273), '$10,792.73');
eq('dineroTxt 5', c.dineroTxt(5), '0.05');
// precio capturado como texto → partida → presupuesto (caso completo de la Etapa 3)
const P = [{cantidad:37.5,precioMaterial:d('20').valor,precioManoObra:d('30').valor,desperdicio:0},
           {cantidad:14,precioMaterial:d('200').valor,precioManoObra:d('100').valor,desperdicio:10},
           {cantidad:1,precioMaterial:null,precioManoObra:d('1,000').valor,desperdicio:0}];
eq('partida pintura = $1,875.00', c.formatoPesos(c.calcularPartida(P[0]).subtotal), '$1,875.00');
eq('partida piso con 10% de desperdicio = $4,480.00', c.formatoPesos(c.calcularPartida(P[1]).subtotal), '$4,480.00');
eq('partida sin precio de material = $1,000.00', c.formatoPesos(c.calcularPartida(P[2]).subtotal), '$1,000.00');
eq('desperdicio solo afecta al material', c.calcularPartida(P[1]).manoObra, 140000);
const T = c.calcularPresupuesto(P, {indirectos:10, utilidad:15, aplicarIva:true, iva:16});
eq('total con IVA = $10,792.73', c.formatoPesos(T.total), '$10,792.73');
eq('IVA = $1,488.65', c.formatoPesos(T.iva), '$1,488.65');
eq('sin partidas total 0', c.calcularPresupuesto([], {indirectos:10, utilidad:15, aplicarIva:true, iva:16}).total, 0);
eq('partida sin precios = 0', c.calcularPartida({cantidad:5, precioMaterial:null, precioManoObra:null}).subtotal, 0);
// ---- Seguimiento de obra (Etapa 9) ----
const R = c.resumenObra({ total: 275000, costoDirecto: 250000, pagos: [{monto:100000},{monto:50000}], gastos: [{monto:60000,categoria:'material'},{monto:30000,categoria:'mano_obra'},{monto:5000,categoria:'material'}] });
eq('cobrado suma pagos', R.cobrado, 150000);
eq('gastado suma gastos', R.gastado, 95000);
eq('por cobrar = total - cobrado', R.porCobrar, 125000);
eq('avance de cobro 54.55 %', R.avanceCobro, 54.55);
eq('diferencia de costo = directo - gastado', R.diferenciaCosto, 155000);
eq('utilidad real = cobrado - gastado', R.utilidadReal, 55000);
eq('gastos por categoría', JSON.stringify(R.porCategoria), JSON.stringify({material:65000, mano_obra:30000}));
const R2 = c.resumenObra({ total: 100000, pagos: [{monto:130000}] });
eq('cobrar de más: por cobrar negativo', R2.porCobrar, -30000);
eq('avance de cobro nunca pasa de 100', R2.avanceCobro, 100);
const R3 = c.resumenObra({ pagos: [{monto:5000}], gastos: [{monto:7000}] });
eq('sin presupuesto: por cobrar y diferencia son null', R3.porCobrar === null && R3.diferenciaCosto === null, true);
eq('sin presupuesto: utilidad negativa posible', R3.utilidadReal, -2000);
eq('sin datos: todo en cero', JSON.stringify(c.resumenObra()), JSON.stringify({cobrado:0,gastado:0,porCategoria:{},porCobrar:null,avanceCobro:null,diferenciaCosto:null,utilidadReal:0}));
eq('ignora montos no enteros o vacíos', c.resumenObra({pagos:[{monto:1000},{monto:null},{monto:12.5},{}]}).cobrado, 1000);
console.log(`Pruebas de cálculo: ${ok} correctas, ${fail} fallidas`);
process.exit(fail?1:0);
