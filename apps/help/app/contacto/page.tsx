import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = { title: 'Contacto y soporte', description: 'Escríbenos y te respondemos por correo.' };

export default function ContactPage() {
  return (
    <div className="wrap narrow narrow-top">
      <h1>Contacta con soporte</h1>
      <p className="muted">Respondemos por correo en menos de 24 horas hábiles. Antes de escribir, quizá tu duda ya esté en el <Link href="/ayuda/">centro de ayuda</Link>.</p>
      <ContactForm />
    </div>
  );
}
