import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Términos y condiciones' };

export default function Terms() {
  return (
    <div className="wrap narrow narrow-top prose">
      <h1>Términos y condiciones</h1>
      <p className="alert warn">Plantilla de ejemplo. Debe revisarla un abogado antes de publicarla.</p>
      <h2>1. El servicio</h2><p>App Contable es una herramienta de software para registrar operaciones y generar reportes contables. No sustituye la asesoría de un contador.</p>
      <h2>2. Cuenta</h2><p>Eres responsable de la veracidad de los datos que registras y de mantener segura tu contraseña.</p>
      <h2>3. Suscripción y pagos</h2><p>Los planes de pago se renuevan cada mes hasta que los canceles. Puedes exportar tu información en cualquier momento.</p>
      <h2>4. Disponibilidad</h2><p>Buscamos una disponibilidad mínima del 99,5 % mensual y hacemos copias de seguridad diarias.</p>
      <h2>5. Responsabilidad</h2><p>Los cálculos de impuestos, nómina y retenciones son orientativos; verifica con tu contador antes de declarar ante la DGI, la alcaldía o el INSS. [Cláusulas de limitación de responsabilidad.]</p>
      <h2>6. Ley aplicable</h2><p>Estos términos se rigen por las leyes de la República de Nicaragua.</p>
    </div>
  );
}
