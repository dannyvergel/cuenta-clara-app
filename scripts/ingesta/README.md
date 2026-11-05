# Ingesta de compras reales

Primer conector: **Municipalidad de Rosario**. Lee las fichas públicas de cada contratación
(`rosario.gob.ar/inicio/compras-licitaciones/detalle/<id>`): tipo, estado, presupuesto oficial,
fechas, repartición, pliegos y el texto del resultado, del que se extraen adjudicatarios, CUIT y montos.
El CUIT se valida con el dígito verificador.

El portal de datos abiertos (`datosabiertos.rosario.gob.ar`) está caído y el sitio limita la velocidad,
así que la ingesta es lenta, reanudable y conviene correrla desde Argentina.

## Uso (PowerShell 5.1)

```powershell
cd C:\dev\cuenta-clara-app
node scripts/ingesta/rosario.mjs --desde 34000 --hasta 38722 --concurrencia 1
node scripts/ingesta/senales.mjs datos/rosario.jsonl --salida datos/observatorio.json
```

Si se corta, volvé a correr el mismo comando: saltea los ids ya bajados.

## Provincia de Mendoza (OCDS)

Segundo conector: `mendoza.mjs`. Baja los paquetes OCDS de
`datosabiertos-compras.mendoza.gov.ar/datasets/` (COMPR.AR Mendoza, CC BY 4.0), compila los releases
de cada proceso y escribe `datos/mendoza.jsonl` con el mismo formato que Rosario. Anda desde fuera
de Argentina y tarda alrededor de un minuto.

```powershell
node scripts/ingesta/mendoza.mjs
node scripts/ingesta/senales.mjs datos/mendoza.jsonl --salida datos/observatorio-mendoza.json
```

Cada jurisdicción tiene su propio observatorio (`/observatorio?fuente=mendoza`): no se suman montos
de un municipio con los de una provincia. El portal publica con atraso (último paquete: enero 2026).
`UNICA_OFERTA` sale del campo `numberOfTenderers`. `SOBRE_PRESUPUESTO` en Mendoza está inflado por la
inflación entre el presupuesto y la adjudicación: falta deflactar con IPC.

## Señales (indicios para mirar, no acusaciones)

- `SOBRE_PRESUPUESTO`: adjudicado más de 5% sobre el presupuesto oficial.
- `UNICA_OFERTA`: adjudicación con una sola oferta.
- `POSIBLE_FRACCIONAMIENTO`: 3 o más compras ágiles parecidas en 30 días en la misma repartición.
- `PLAZO_CORTO`: menos de 3 días entre publicación y apertura en licitaciones.
- `CUIT_INVALIDO`: CUIT del adjudicatario con dígito verificador incorrecto.
- `SOBREPRECIO_DETECTADO` y `DESIERTA_O_FRACASADA`: lo que el propio organismo reporta.

## Límites conocidos

- El resultado es texto libre: personas físicas como adjudicatarias y algunos formatos raros todavía no se extraen.
- El presupuesto oficial de algunas compras ágiles parece cargado por ítem, lo que infla `SOBRE_PRESUPUESTO`.
