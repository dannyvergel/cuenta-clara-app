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
