---
title: Importar el extracto y conciliar el banco
summary: Sube el CSV de tu banco y relaciona cada movimiento con facturas, gastos o cuentas.
category: bancos
order: 30
---

**Conciliar** es comprobar que lo que dice tu banco coincide con lo que registraste. La app lo hace casi solo.

## 1. Descarga el estado de cuenta de tu banco

Desde la banca en línea de tu banco (BANPRO, LAFISE, BAC, Avanz, Ficohsa…), exporta los movimientos en **CSV** (o en Excel y guárdalo como CSV). Debe tener columnas de:

- **Fecha** (por ejemplo 21/10/2026 o 2026-10-21)
- **Concepto** o descripción
- **Importe** (positivo para ingresos y negativo para pagos), o bien **Cargo** y **Abono** por separado

## 2. Impórtalo

En **Bancos** pulsa **Importar extracto (CSV)**. Si subes el mismo archivo dos veces, los movimientos repetidos se omiten.

## 3. Concilia

Para cada movimiento verás sugerencias:

- Un ingreso que coincide con una factura pendiente → pulsa la sugerencia y se registra el cobro.
- Un pago que coincide con un gasto pendiente → se registra el pago.
- Comisiones, intereses u otros → **Asignar cuenta** y elige la cuenta contable.

Las sugerencias solo comparan movimientos en la **misma moneda** que la cuenta. Si un cliente del régimen general te pagó el total **menos la retención de IR**, la app lo reconoce y registra la retención por acreditar automáticamente.
