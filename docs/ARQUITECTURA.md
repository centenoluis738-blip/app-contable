# Arquitectura

```
 App web (React)   App móvil (Expo)   Web de ayuda (Next.js)
        \                |                 /  (solo /support/tickets)
         \               |                /
          +------ API REST (Express) -----+
                     |        |
              PostgreSQL   Archivos (comprobantes)
```

La API es un **monolito modular**: un solo servicio dividido en módulos (`apps/api/src/modules`). Toda regla contable vive en la API; los clientes solo muestran datos y envían acciones.

## Asientos automáticos

| Operación | Debe | Haber |
| --- | --- | --- |
| Emitir factura | Clientes (total en C$ al T/C de emisión) · Costo de ventas | Ventas (base) · IVA por pagar · Inventario (costo promedio) |
| Cobro de factura | Bancos o Caja · Retenciones IR por acreditar · Pérdida cambiaria | Clientes · Ganancia cambiaria |
| Gasto pagado | Cuenta de gasto o Gastos no deducibles (base) · IVA acreditable (solo régimen general y deducible) | Bancos o Caja (total) |
| Gasto pendiente | Igual que el anterior | Proveedores (total) |
| Entrada de inventario | Inventario | Bancos, Caja o Proveedores |
| Nómina del mes | Sueldos · INSS patronal · INATEC · Aguinaldo · Vacaciones · Indemnización | Sueldos por pagar · INSS por pagar · INATEC por pagar · Retenciones IR por pagar · Provisiones |
| Liquidación cuota fija | Impuestos (gasto) | Retenciones IR por acreditar · Impuestos por pagar |
| Liquidación régimen general | IVA por pagar · Anticipos IR · Impuestos (IMI) | IVA acreditable · Retenciones IR por acreditar · Impuestos por pagar |
| Pago de gasto pendiente | Proveedores | Bancos o Caja |
| Movimiento bancario asignado a cuenta | Bancos o la cuenta (según signo) | La cuenta o Bancos |
| Anulación | Contraasiento: mismo asiento con debe y haber intercambiados | |

Reglas que la API garantiza en cada asiento (`apps/api/src/lib/journal.ts`):

- Debe = haber, al menos dos líneas, importes no negativos.
- Todas las cuentas pertenecen a la empresa y están activas.
- La fecha no cae en un período cerrado.
- Numeración correlativa por empresa (con bloqueo para evitar duplicados).
- Un disparador de PostgreSQL impide `UPDATE` y `DELETE` sobre asientos.

## Reglas de Nicaragua

Constantes y cálculos en `packages/shared/src/nicaragua.ts` (`NI`, `TAX_CODES`, `WITHHOLDINGS`, `expectedWithholding`, `irSalarialMensual`, `calcPayroll`). El cálculo mensual de impuestos está en `computeTaxes` (`apps/api/src/modules/taxes.ts`) y el tipo de cambio en `apps/api/src/lib/fx.ts`. El esquema nuevo está en `apps/api/migrations/002_nicaragua.sql`.

## Importes

Siempre `numeric(14,2)` en la base de datos, texto en JSON (`"1234.50"`) y `decimal.js` en el código. Nunca coma flotante. Las líneas de factura se redondean por línea (mitad hacia arriba) y los totales son la suma de las líneas.

## Seguridad

- Contraseñas con bcrypt (12 rondas); sesión con JWT (8 h por defecto).
- Cada petición de datos lleva `X-Company-Id`; la API comprueba que el usuario pertenece a esa empresa y su rol.
- Roles: `owner` (todo), `accountant` (contable, anulaciones, cierres), `employee` (operaciones), `viewer` (lectura).
- Helmet, CORS restringido, límite de tamaño de peticiones y de archivos, filtro de tipos de archivo, campo trampa y límite por IP en el formulario público.
- Bitácora `audit_log` con usuario, acción y datos de cada cambio.

## Endpoints de la API

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | /auth/register · /auth/login | Registro e inicio de sesión |
| GET | /auth/me | Usuario y sus empresas |
| POST | /auth/change-password | Cambiar contraseña |
| GET/POST | /companies | Empresas del usuario / crear empresa (con plan de cuentas) |
| GET/PATCH | /companies/current | Datos de la empresa activa |
| POST | /companies/current/close-period | Cierre de período |
| GET/POST/DELETE | /companies/current/members | Equipo y roles |
| GET | /companies/current/audit-log | Bitácora |
| CRUD | /contacts · /products | Clientes, proveedores, productos |
| GET/POST/PATCH | /accounts | Plan de cuentas con saldos |
| GET/POST | /journal | Libro diario / asiento manual |
| POST | /journal/:id/reverse | Revertir asiento manual |
| GET | /journal/ledger/:accountId | Libro mayor (`format=csv` para libros legalizados) |
| CRUD | /invoices | Facturas (borradores) |
| POST | /invoices/:id/issue · /payments · /void | Emitir, cobrar, anular |
| POST | /invoices/quick-sale | Venta rápida a consumidor final: crea, emite y cobra en una sola operación |
| GET | /invoices/:id/pdf | PDF |
| GET/POST | /expenses | Gastos |
| POST | /expenses/:id/pay · /void · /receipt | Pagar, anular, adjuntar comprobante |
| POST | /bank/import | Importar extracto CSV |
| GET | /bank/transactions | Movimientos con sugerencias |
| POST | /bank/transactions/:id/match | Conciliar |
| GET/POST | /companies/current/exchange-rates | Tipos de cambio por día |
| POST | /products/:id/stock-in · GET /products/:id/moves | Entrada de inventario y kárdex |
| GET | /taxes/summary?month=AAAA-MM | Impuestos del mes por régimen, alertas y desglose |
| POST | /taxes/settle | Liquidar impuestos del mes (asiento) |
| CRUD | /payroll/employees | Trabajadores |
| GET | /payroll/preview | Cálculo de la nómina sin registrar |
| GET/POST | /payroll/runs | Nóminas registradas / registrar nómina del mes |
| GET | /reports/cash-flow | Flujo de efectivo (método directo) |
| GET | /reports/dashboard · income-statement · balance-sheet · trial-balance · receivables · payables | Reportes (`format=csv` para exportar) |
| POST | /support/tickets | Ticket desde la web de ayuda (público) |

## Modelo de datos

Tablas principales (`apps/api/migrations/001_init.sql`): `users`, `companies`, `memberships`, `accounts`, `contacts`, `products`, `invoices`, `invoice_lines`, `payments`, `expenses`, `journal_entries`, `journal_lines`, `bank_transactions`, `audit_log`, `support_tickets`. Para Nicaragua (`002_nicaragua.sql`): `exchange_rates`, `inventory_moves`, `employees`, `payroll_runs`, `payroll_lines`, `tax_settlements`.

`003_modo_sencillo.sql` agrega `companies.simple_mode`. Para cambiar el esquema, agrega un archivo nuevo `004_...sql` en `apps/api/migrations` y ejecuta `npm run db:migrate`.
