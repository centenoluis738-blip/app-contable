import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Aviso de privacidad' };

export default function Privacy() {
  return (
    <div className="wrap narrow narrow-top prose">
      <h1>Aviso de privacidad</h1>
      <p className="alert warn">Plantilla de ejemplo. Debe redactarla o revisarla un abogado conforme a la Ley 787, Ley de Protección de Datos Personales de Nicaragua, y su reglamento.</p>
      <h2>Responsable</h2><p>[Razón social], con domicilio en [dirección], Nicaragua, es responsable del tratamiento de tus datos personales.</p>
      <h2>Datos que tratamos</h2><p>Datos de identificación y contacto, datos fiscales de tu negocio y la información contable que registras en la plataforma.</p>
      <h2>Finalidades</h2><p>Prestar el servicio, emitir facturas, dar soporte, cumplir obligaciones legales y, si lo autorizas, enviarte novedades.</p>
      <h2>Tus derechos</h2><p>Conforme a la Ley 787 puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos escribiendo a [correo de privacidad].</p>
      <h2>Conservación</h2><p>Conservamos la información contable al menos 10 años, como exigen la legislación tributaria y el Código de Comercio de Nicaragua, y la eliminamos de forma segura después.</p>
    </div>
  );
}
