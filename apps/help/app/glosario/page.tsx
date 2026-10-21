import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Glosario contable', description: 'Términos contables explicados en lenguaje sencillo.' };

const TERMS: [string, string][] = ([
  ['Activo', 'Todo lo que tiene tu negocio y tiene valor: dinero en el banco, lo que te deben, equipos, inventario.'],
  ['Asiento contable', 'El registro de una operación. Siempre tiene al menos dos líneas y el debe es igual al haber.'],
  ['Balance general', 'Foto de tu negocio en una fecha: lo que tienes (activo), lo que debes (pasivo) y lo que es de los dueños (patrimonio).'],
  ['Conciliación bancaria', 'Comprobar que los movimientos del banco coinciden con lo registrado en tu contabilidad.'],
  ['Contraasiento', 'Asiento que anula otro intercambiando el debe y el haber. Se usa en lugar de borrar.'],
  ['Cuentas por cobrar', 'Dinero que tus clientes te deben por facturas emitidas y no cobradas.'],
  ['Cuentas por pagar', 'Dinero que debes a tus proveedores.'],
  ['Debe y haber', 'Las dos columnas de un asiento. Por convención, el debe aumenta activos y gastos; el haber aumenta pasivos, patrimonio e ingresos.'],
  ['Estado de resultados', 'Reporte que resta tus gastos a tus ingresos en un período para saber si ganaste o perdiste.'],
  ['IVA (débito fiscal)', 'El IVA del 15 % que cobras a tus clientes en tus facturas (régimen general).'],
  ['IVA acreditable (crédito fiscal)', 'El IVA que pagas en tus compras deducibles y que puedes restar del que cobras. En cuota fija no se acredita.'],
  ['Exento', 'Bienes o servicios que no pagan IVA según la LCT, como la canasta básica, medicamentos, salud y educación.'],
  ['Tasa cero', 'IVA del 0 % que se aplica a las exportaciones.'],
  ['Cuota fija', 'Régimen simplificado de la DGI para negocios pequeños: una cuota mensual que sustituye al IVA y al IR.'],
  ['Régimen general', 'Régimen en que el negocio cobra IVA, lleva contabilidad completa y paga anticipos de IR.'],
  ['RUC', 'Registro Único del Contribuyente: tu número de identificación ante la DGI.'],
  ['DGI', 'Dirección General de Ingresos, la autoridad tributaria de Nicaragua.'],
  ['VET', 'Ventanilla Electrónica Tributaria: el portal de la DGI para declarar y pagar impuestos.'],
  ['LCT', 'Ley de Concertación Tributaria (Ley 822), que regula el IVA, el IR y la cuota fija.'],
  ['PMD / anticipo de IR', 'Pago mínimo definitivo: anticipo mensual del IR que pagan los negocios del régimen general sobre sus ingresos brutos.'],
  ['Retención en la fuente', 'Parte del pago que tu cliente del régimen general retiene como anticipo de tu IR (2 %, 3 % o 10 %). Se acredita contra tus impuestos.'],
  ['IMI', 'Impuesto Municipal sobre Ingresos: 1 % de tus ingresos brutos que pagas cada mes a la alcaldía.'],
  ['Matrícula municipal', 'Pago anual a la alcaldía para operar tu negocio en el municipio.'],
  ['INSS', 'Instituto Nicaragüense de Seguridad Social. El trabajador aporta 7 % y el empleador 21.5 % o 22.5 %.'],
  ['INATEC', 'Instituto Nacional Tecnológico. El empleador aporta 2 % de la planilla.'],
  ['IR salarial', 'Impuesto sobre la renta que se retiene del salario según la tabla progresiva de la LCT.'],
  ['Aguinaldo', 'Treceavo mes que se paga en diciembre; la app lo provisiona al 8.33 % cada mes.'],
  ['Indemnización', 'Pago por antigüedad al terminar la relación laboral; la app lo provisiona al 8.33 % cada mes.'],
  ['Tipo de cambio BCN', 'El tipo de cambio oficial córdoba-dólar que publica el Banco Central de Nicaragua cada día.'],
  ['Diferencial cambiario', 'Ganancia o pérdida que surge cuando cobras o pagas en dólares con un tipo de cambio distinto al de la factura.'],
  ['Costo promedio', 'Método de valuación del inventario que reparte el costo de todas las compras entre las unidades disponibles.'],
  ['NIIF para las PYMES', 'Normas internacionales de información financiera para pequeñas y medianas entidades, base de los estados financieros.'],
  ['Gasto no deducible', 'Gasto que no se puede restar para calcular el IR, por ejemplo sin factura o personal. La app lo lleva en una cuenta aparte.'],
  ['Flujo de efectivo', 'Reporte que explica cómo entró y salió el dinero de caja y bancos: operación, inversión y financiamiento.'],
  ['Libros legalizados', 'Libro Diario y Libro Mayor sellados según el Código de Comercio, donde se pasan los registros contables.'],
  ['Libro diario', 'Lista de todos los asientos en orden de fecha.'],
  ['Libro mayor', 'Todos los movimientos de una sola cuenta con su saldo acumulado.'],
  ['Pasivo', 'Todo lo que tu negocio debe: proveedores, impuestos, INSS, provisiones laborales, préstamos.'],
  ['Patrimonio', 'La parte del negocio que pertenece a los dueños: lo que aportaron más las ganancias acumuladas.'],
  ['Plan de cuentas', 'El catálogo de cuentas ordenado que usa tu contabilidad.'],
] as [string, string][]).sort((a, b) => a[0].localeCompare(b[0], 'es'));

export default function GlossaryPage() {
  return (
    <div className="wrap narrow narrow-top">
      <h1>Glosario contable</h1>
      <p className="muted">Los términos que verás en la app, explicados sin tecnicismos.</p>
      <dl className="glossary">
        {TERMS.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
      </dl>
    </div>
  );
}
