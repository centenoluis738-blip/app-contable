import type { Metadata } from 'next';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = { title: 'Contacto y soporte', description: 'Escríbenos y te respondemos por correo.' };

export default function ContactPage() {
  return (
    <div className="wrap narrow narrow-top">
      <h1>Contacta con soporte</h1>
      <p className="muted">Respondemos por correo en menos de 24 horas hábiles. Antes de escribir, quizá tu duda ya esté en el <a href="/ayuda/">centro de ayuda</a>.</p>
      <ContactForm />
    </div>
  );
}
