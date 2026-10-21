import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Preguntas frecuentes' };

const FAQ: [string, string][] = [
  ['¿Necesito saber contabilidad para usar la app?', 'No. Tú registras facturas y gastos; la app genera los asientos contables por ti. Si trabajas con un contador, puedes invitarlo para que revise todo.'],
  ['¿Sirve para negocios en cuota fija?', 'Sí. Tus facturas salen sin IVA, la app resta las retenciones de IR de tu cuota y calcula el IMI de la alcaldía. Te avisa si te acercas a los límites del régimen.'],
  ['¿Y si estoy en régimen general?', 'La app cobra IVA 15 %, maneja exentos y tasa cero, acredita el IVA de tus compras y calcula el anticipo de IR menos tus retenciones.'],
  ['¿Mis facturas tienen validez fiscal?', 'La app imprime tus facturas con numeración correlativa y el pie de autorización de la DGI que configures. La conexión con la factura electrónica de la DGI está prevista para la siguiente fase.'],
  ['¿Puedo facturar en dólares?', 'Sí. Registra el tipo de cambio del BCN del día en Configuración. La contabilidad se lleva en córdobas y el diferencial cambiario se registra aparte.'],
  ['¿La app presenta mis declaraciones en la VET?', 'Todavía no. La app calcula los montos y agrupa ventas y compras como las pide la DGI; tú o tu contador declaran en la VET.'],
  ['¿Calcula la nómina?', 'Sí: INSS laboral y patronal, IR salarial, INATEC y provisiones de aguinaldo, vacaciones e indemnización, con su asiento contable.'],
  ['¿Cuánto tiempo se guarda mi información?', 'Al menos 10 años, como exige la ley para libros y comprobantes.'],
  ['¿Puedo equivocarme y borrar una factura?', 'Los borradores sí se pueden borrar. Una factura emitida se anula: queda registrada como anulada y la contabilidad se corrige con un contraasiento. Así siempre hay un historial completo.'],
  ['¿Cómo importo los movimientos de mi banco?', 'Descarga el estado de cuenta en CSV desde tu banca en línea e impórtalo en la sección Bancos. La app te sugiere con qué factura o gasto coincide cada movimiento.'],
  ['¿Mis datos están seguros?', 'La información viaja cifrada, las contraseñas se guardan cifradas, cada empresa está aislada de las demás y se hacen copias de seguridad diarias.'],
  ['¿Puedo llevar varias empresas?', 'Sí. Un mismo usuario puede pertenecer a varias empresas y cambiar entre ellas desde el menú.'],
  ['¿Puedo usarla desde el móvil?', 'Sí. La web se adapta al móvil y la app para iOS y Android permite consultar tu panel, facturar y fotografiar tickets.'],
  ['¿Cómo exporto la información para mi contador?', 'En Reportes pulsa Exportar a Excel (CSV) y en Contabilidad exporta el libro diario y el libro mayor. También puedes darle acceso con el rol Contador.'],
];

export default function FaqPage() {
  return (
    <div className="wrap narrow narrow-top">
      <h1>Preguntas frecuentes</h1>
      {FAQ.map(([q, a]) => (
        <details className="card faq" key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
