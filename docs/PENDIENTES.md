# Pendiente para las siguientes fases

Referencias a los requerimientos del plan (RF = app, RW = web de ayuda, RNF = no funcionales).

## Antes de salir a producción

- [ ] **Factura electrónica DGI (RF-06)**: integrar el sistema de facturación electrónica de la DGI de Nicaragua cuando aplique al contribuyente; hoy se imprime la autorización de facturación en el PDF.
- [ ] Exportar a los formatos de la **VET** (IVA, PMD, retenciones) para subir las declaraciones.
- [ ] Descargar automáticamente el **tipo de cambio oficial del BCN** cada día.
- [ ] Valuación de inventario **PEPS** como alternativa al costo promedio.
- [ ] **Matrícula municipal** anual (1 %) con su asiento y recordatorio.
- [ ] **Techo de cotización del INSS** y tabla de IR salarial configurables por año.
- [ ] Retenciones como **agente retenedor** (cuando la empresa del régimen general retiene a sus proveedores) y constancias de retención en PDF.
- [ ] Liquidación de aguinaldo, vacaciones e indemnización contra las provisiones.
- [ ] Revisión del catálogo de cuentas (`apps/api/src/lib/chart-template.ts`) y de las reglas fiscales con un contador nicaragüense.
- [ ] Envío de facturas y avisos por correo (SendGrid, Amazon SES) y recuperación de contraseña.
- [ ] Verificación en dos pasos (RF-01) o usar un proveedor de identidad (Auth0, Clerk, Azure AD B2C).
- [ ] Suscripciones y cobro de planes (RF-22) con una pasarela que opere en Nicaragua.
- [ ] Guardar comprobantes en almacenamiento de objetos (S3 o Azure Blob) en lugar de disco local.
- [ ] Copias de seguridad automáticas y prueba de restauración (RNF-08); monitoreo de errores con Sentry (RNF-17).
- [ ] Prueba de seguridad externa (RNF-03) y revisión legal de los textos de privacidad y términos.

## Fase 2

- [ ] Notas de crédito, facturas recurrentes y recordatorios de cobro (RF-07).
- [ ] Lectura automática de tickets con OCR (RF-09).
- [ ] Calendario fiscal con avisos (RF-16) de DGI, alcaldía e INSS.
- [ ] Captura de gastos sin conexión en la app móvil (RNF-14).
- [ ] Asistente de ayuda con IA que responde con los artículos del centro de ayuda (RW-06).
- [ ] Blog, página de estado y notas de versión (RW-07, RW-08); CMS para editar artículos sin programar (RW-09).

## Fase 3

- [ ] Conexión bancaria automática (open banking) (RF-14).
- [ ] Panel multiempresa para despachos contables (RF-20).
- [ ] API pública y pasarela de pago dentro de la factura (RF-21).
- [ ] Más países, idiomas y monedas (RNF-15).
