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
`UNICA_OFERTA` sale del campo `numberOfTenderers`. Aun ajustado por IPC, ~25% de los procesos
de Mendoza se adjudican por encima del presupuesto: parece subestimación sistemática del presupuesto.

## Nación: COMPR.AR

Tercer conector: `comprar.mjs`. Une los CSV de Convocatorias (presupuesto, fechas, objeto) y Adjudicaciones
(proveedor, CUIT, orden de compra, monto) del dataset "Sistema de Contrataciones Electrónicas" de datos.gob.ar
por número de procedimiento. **datos.gob.ar no responde desde el exterior: correrlo desde Argentina.**

```powershell
node scripts/ingesta/comprar.mjs --desde 2024
node scripts/ingesta/senales.mjs datos/comprar.jsonl --salida datos/observatorio-comprar.json
```

Los CSV quedan en `datos/crudo/` y `datos/comprar.jsonl` no se versiona (es grande); solo se sube
`datos/observatorio-comprar.json`. COMPR.AR no publica cantidad de oferentes, así que no hay `UNICA_OFERTA`;
en cambio marca `DIRECTA_POR_EXCEPCION` (urgencia, emergencia, exclusividad, especialidad). CUIT con largo
distinto de 11 dígitos se toma como error de carga (`cuit_formato: irregular`), no como señal. Montos en
moneda extranjera no se suman (`otra_moneda`).

## Señales (indicios para mirar, no acusaciones)

- `SOBRE_PRESUPUESTO`: adjudicado más de 5% sobre el presupuesto oficial llevado por IPC (INDEC) al mes de
  adjudicación. Peso alto si supera 25% real. Actualizá el IPC con `node scripts/ingesta/ipc.mjs` (guarda `datos/ipc.json`).
- `UNICA_OFERTA`: adjudicación con una sola oferta.
- `POSIBLE_FRACCIONAMIENTO`: 3 o más compras ágiles parecidas en 30 días en la misma repartición.
- `PLAZO_CORTO`: menos de 3 días entre publicación y apertura en licitaciones.
- `CUIT_INVALIDO`: CUIT del adjudicatario con dígito verificador incorrecto.
- `SOBREPRECIO_DETECTADO` y `DESIERTA_O_FRACASADA`: lo que el propio organismo reporta.

## Límites conocidos

- El resultado es texto libre: personas físicas como adjudicatarias y algunos formatos raros todavía no se extraen.
- El presupuesto oficial de algunas compras ágiles parece cargado por ítem, lo que infla `SOBRE_PRESUPUESTO`.
