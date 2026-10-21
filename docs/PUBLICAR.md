# Publicar la app gratis para las pruebas

La app se publica en internet sin costo y sin tarjeta, con dos servicios gratuitos que se abren con la cuenta de GitHub:

| Servicio | Para qué | Plan |
|---|---|---|
| [Neon](https://neon.tech) | La base de datos PostgreSQL | Free: 0,5 GB, no caduca |
| [Render](https://render.com) | La app web, la ayuda y la API en una sola dirección | Free: 750 horas al mes |

Al terminar, todo queda en una sola dirección, por ejemplo `https://app-contable.onrender.com`:

- `/`: la app web (se puede usar desde el teléfono).
- `/guia/`: el sitio de ayuda.
- `/api/`: la API.

## 1. Crear la base de datos en Neon

1. Entra a [neon.tech](https://neon.tech) y pulsa **Sign up**. Elige **Continue with GitHub**.
2. Crea un proyecto con el nombre `app-contable`. En la región elige **AWS US East** (la más cercana a Nicaragua). Deja la versión de PostgreSQL que viene por defecto.
3. En el panel del proyecto pulsa **Connect**. Copia la cadena de conexión que empieza con `postgresql://` y termina con `sslmode=require`. Guárdala, se usa en el paso 2.

> La cadena de conexión es una contraseña. No la publiques ni la subas a GitHub.

## 2. Publicar la app en Render

1. Entra a [render.com](https://render.com) y pulsa **Get Started**. Elige **GitHub** para iniciar sesión.
2. En el panel pulsa **New** y luego **Blueprint**.
3. Conecta el repositorio `app-contable`. Si Render pide permiso para ver tus repositorios, dale acceso solo a ese.
4. Render lee el archivo `render.yaml` y muestra el servicio `app-contable`. Te pide el valor de **DATABASE_URL**: pega la cadena de Neon del paso 1.
5. Pulsa **Deploy Blueprint**. La primera publicación tarda entre 5 y 10 minutos.
6. Cuando el estado diga **Live**, abre la dirección que aparece arriba (termina en `.onrender.com`).

Al arrancar, el servidor crea las tablas y una empresa de demostración:

- Usuario: `demo@contable.app`
- Contraseña: `Demo1234`

Cada comerciante también puede crear su propia cuenta con el enlace **Regístrate** de la pantalla de inicio de sesión.

## 3. Usarla desde el teléfono

Abre la dirección en Chrome (Android) o Safari (iPhone) y elige **Agregar a pantalla de inicio**. Queda como un ícono más del teléfono.

## Lo que hay que saber del plan gratuito

- **La primera visita tarda.** Si nadie usa la app durante 15 minutos, Render la duerme. La siguiente visita tarda cerca de un minuto en abrir; después va normal. Antes de una prueba con usuarios o de una presentación, ábrela uno o dos minutos antes.
- **Las fotos de recibos de gastos no se guardan para siempre.** El disco del plan gratuito se borra al reiniciar. Los datos contables sí quedan guardados, porque están en Neon.
- **Las actualizaciones son automáticas.** Cada cambio que se une a la rama `main` en GitHub se publica solo en unos minutos.
- **No hay que pagar nada.** Sin tarjeta registrada, si algún día se acaban las horas gratis del mes, el servicio se pausa hasta el mes siguiente; no se cobra.
