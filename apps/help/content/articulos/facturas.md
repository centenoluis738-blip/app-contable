---
title: Cómo crear, emitir y cobrar una factura
summary: IVA 15 %, exentos, tasa cero, cuota fija, retenciones, dólares, cobros y anulación.
category: ventas
order: 10
---

## El IVA en tus facturas

Cada línea de la factura tiene un **tipo de IVA**:

| Tipo | Cuándo se usa |
| --- | --- |
| **IVA 15 %** | La mayoría de bienes y servicios |
| **Exento** | Canasta básica, medicamentos, servicios de salud y educación, entre otros que define la Ley de Concertación Tributaria |
| **Tasa cero (0 %)** | Exportaciones |

Fórmulas que usa la app:

- Agregar IVA: **precio × 1.15**
- Quitar IVA de un total: **total ÷ 1.15**
- IVA contenido en un total: **total − (total ÷ 1.15)**

**Si tu negocio está en cuota fija, tus facturas no llevan IVA.** La app lo quita automáticamente y te lo avisa.

## Borrador o emitida

Una factura empieza como **borrador**: puedes editarla o borrarla. Cuando pulsas **Emitir**:

1. Recibe un **número correlativo** (por ejemplo A-00001). Los números nunca se repiten ni se saltan.
2. Se registra el asiento contable: cuentas por cobrar, ventas e IVA por pagar (en régimen general).
3. Si vendes productos con control de existencias, se descuentan del inventario y se registra el **costo de ventas** al costo promedio.

Una factura emitida **ya no se puede editar**. Si tiene un error, anúlala y crea una nueva.

## Retención de IR

Si tu cliente es del **régimen general**, al pagarte te retiene IR. La app calcula la retención esperada según lo que elijas en la factura:

- **2 %** en compra de bienes y servicios, cuando la factura es de **C$ 1,000 o más**.
- **3 %** en compras agropecuarias, desde C$ 1.
- **10 %** en servicios profesionales o técnicos, desde C$ 1.

Un **consumidor final** no retiene. Mira [Retenciones de IR](/ayuda/retenciones/).

## Facturar en dólares

Elige **USD** como moneda. La factura se contabiliza en córdobas con el **tipo de cambio del BCN** del día de emisión. Cuando cobras, se usa el tipo de cambio del día del cobro y la diferencia se registra como **diferencial cambiario** (ganancia o pérdida), separada de tus ventas.

## Ventas al Estado

Marca al cliente como **institución del Estado** en su ficha. Si estás en cuota fija y una sola venta al Estado supera **C$ 50,000**, la app te avisa, porque eso te excluye del régimen de cuota fija.

## Registrar un cobro

Abre la factura y pulsa **Registrar cobro**. Indica cuánto te pagaron y cuánto te **retuvieron** (con el número de constancia de retención). La retención no se pierde: queda como **retención por acreditar** y se resta de tu cuota fija o de tu anticipo de IR.

## Descargar o enviar el PDF

Pulsa **Ver PDF** para abrirla, descargarla o imprimirla. El PDF incluye tu RUC, el tipo de cambio si es en dólares y el pie con la **autorización de la DGI** que configures.

## Anular una factura

Solo el dueño o el contador pueden anular. La app registra un contraasiento (no borra nada), revierte los cobros y devuelve las existencias. Debes indicar el motivo.

> Importante: la app imprime facturas con numeración autorizada por la DGI. La conexión con la **factura electrónica** de la DGI está en el plan de la siguiente fase.
