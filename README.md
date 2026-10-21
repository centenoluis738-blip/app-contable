# App Contable

App contable para **mipymes de Nicaragua** (cuota fija y régimen general), con **app web**, **app móvil** y **web pública de ayuda**, todo en TypeScript.

| Carpeta | Qué es | Tecnología |
| --- | --- | --- |
| `apps/api` | API con toda la lógica contable y fiscal | Node.js, Express 5, PostgreSQL |
| `apps/web` | App web para el negocio y su contador | React + Vite |
| `apps/help` | Sitio público: inicio, precios, centro de ayuda, FAQ, glosario, contacto | Next.js (sitio estático) |
| `apps/mobile` | App para iOS y Android: resumen, facturas y gastos con foto | React Native (Expo) |
| `packages/shared` | Cálculos de importes e impuestos y tipos compartidos | TypeScript + decimal.js |
| `docs/` | Documentación técnica | |

## Adaptada a Nicaragua

- **Modo sencillo para tramos** (activado por defecto): menú reducido y **venta rápida** desde el teléfono (tocar piezas, cobrar en C$ o USD, efectivo, tarjeta o transferencia). Se desactiva en Configuración.

- **Régimen de cuota fija**: facturas sin IVA, cuota mensual menos retenciones de IR acreditables (Art. 259 LCT), alertas por ingresos > C$ 100,000/mes y por venta al Estado > C$ 50,000.
- **Régimen general**: IVA 15 %, exento y tasa cero (exportación), crédito fiscal, anticipo de IR / PMD menos retenciones.
- **Retenciones de IR** que aplican los clientes del régimen general: 2 % (bienes y servicios desde C$ 1,000), 3 % (agropecuario) y 10 % (servicios profesionales); el consumidor final no retiene.
- **IMI 1 %** mensual a la alcaldía; liquidación mensual con asiento contable.
- **Nómina**: INSS laboral 7 %, INSS patronal 21.5 % / 22.5 %, INATEC 2 %, IR salarial por tabla progresiva y provisiones de aguinaldo, vacaciones e indemnización (8.33 % cada una).
- **Bimoneda NIO/USD** con tipo de cambio BCN por día; contabilidad en córdobas y diferencial cambiario separado.
- **Inventario** a costo promedio ponderado con costo de ventas automático.
- **Catálogo de cuentas NIIF para las PYMES** con gastos no deducibles separados; estado de resultados, balance general y **flujo de efectivo**.
- Exportación del **libro diario y libro mayor** para libros legalizados (Código de Comercio).

Los cálculos fiscales son orientativos y deben validarse con un contador antes de declarar en la VET.

## Qué hace (versión MVP)

- **Cuentas y empresas**: registro, inicio de sesión, varias empresas por usuario, roles (dueño, contador, empleado, solo lectura).
- **Facturación**: borradores, emisión con numeración correlativa, PDF, cobros totales o parciales, anulación con contraasiento.
- **Gastos**: con o sin IVA incluido, deducibles o no, en córdobas o dólares, pagados o pendientes, foto o PDF del comprobante.
- **Contabilidad automática**: plan de cuentas inicial, asientos automáticos por cada operación, asientos manuales, libro diario y mayor. Los asientos **no se pueden modificar ni borrar** (lo impide la base de datos).
- **Bancos**: importación de extractos CSV (formatos con `;` o `,`, decimales con coma o punto), sugerencias de conciliación y asignación a cuentas.
- **Impuestos**: cálculo mensual por régimen (cuota fija o general), IMI, retenciones y cargas de nómina, con liquidación contable.
- **Nómina**: trabajadores, cálculo del mes y asiento con provisiones.
- **Reportes**: panel con alertas, estado de resultados, balance general, flujo de efectivo, balanza de comprobación, cuentas por cobrar (antigüedad) y por pagar; exportación a CSV para Excel.
- **Cierre de período** y **bitácora de auditoría** de todos los cambios.
- **Web de ayuda**: 15 guías para Nicaragua en Markdown con buscador, preguntas frecuentes, glosario, formulario de soporte que crea tickets, plantillas legales.

## Cómo ponerlo en marcha

Requisitos: Node.js 20 o superior y PostgreSQL 16 (o Docker).

```bash
# 1. Base de datos (con Docker)
docker compose up -d

# 2. Dependencias y paquete compartido
npm install
npm run build -w packages/shared

# 3. Configuración
cp apps/api/.env.example apps/api/.env      # cambia JWT_SECRET
cp apps/web/.env.example apps/web/.env
cp apps/help/.env.example apps/help/.env.local

# 4. Crear tablas y datos de demostración
npm run db:migrate
npm run db:seed          # usuario demo@contable.app / Demo1234 (tramo de artesanías de Masaya)

# 5. Arrancar (cada uno en su terminal)
npm run dev:api          # http://localhost:4000
npm run dev:web          # http://localhost:5173
npm run dev:help         # http://localhost:3000
```

App móvil (se instala aparte porque Expo trae sus propias dependencias):

```bash
cd apps/mobile
npm install
npx expo start           # escanea el código QR con la app Expo Go
```

En un teléfono físico cambia `extra.apiUrl` en `apps/mobile/app.json` por la IP de tu computadora (por ejemplo `http://192.168.1.20:4000`).

## Pruebas

```bash
npm test
```

Corre las pruebas de cálculo (`packages/shared`) y las pruebas de la API contra una base de datos real `contable_test` (se vacía en cada ejecución). Cubren: acceso y permisos, factura con IVA 15 % y exento, cuota fija sin IVA, retenciones 2 %/10 %, cobro en dólares con diferencial cambiario, inventario a costo promedio, gastos no deducibles, conciliación con retención, liquidación de impuestos, nómina, flujo de efectivo, reportes cuadrados, cierre de período e inmutabilidad de asientos.

## Publicación

- **API**: cualquier servicio de Node.js (AWS App Runner, Azure App Service, Render, Railway) con PostgreSQL gestionado. `npm run build -w apps/api && npm start -w apps/api`.
- **App web**: `npm run build -w apps/web` genera `apps/web/dist`, que se sirve como sitio estático.
- **Web de ayuda**: `npm run build -w apps/help` genera `apps/help/out`, que se sirve como sitio estático.
- **App móvil**: con EAS (`npx eas build`) para generar los instaladores de App Store y Google Play.

Más detalle técnico en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) y lo pendiente en [docs/PENDIENTES.md](docs/PENDIENTES.md).

## Capturas

En [docs/capturas](docs/capturas) hay pantallas de la app web y de la web de ayuda tomadas de las pruebas.
