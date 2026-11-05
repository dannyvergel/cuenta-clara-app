# Agentes

## Vigía de compras (`vigia.mjs`)

Mantiene al día el Observatorio con datos reales de Rosario. Cada corrida:

1. Baja las fichas nuevas después del último id conocido (corta tras 40 ids vacíos seguidos).
2. Revisa 60 contrataciones abiertas, las que hace más tiempo no mira, para captar adjudicaciones.
3. Recalcula las señales (`scripts/ingesta/senales.mjs`) y anota cuáles son nuevas.
4. Registra la corrida en `datos/agentes/ejecuciones.jsonl` (la muestra la pantalla `/agentes`).
5. Con `--publicar`, hace commit y push de `datos/`.

Tiene que correr desde una IP argentina: rosario.gob.ar corta conexiones de afuera.

### Correrlo a mano (PowerShell 5.1)

```powershell
node scripts/agentes/vigia.mjs
node scripts/agentes/vigia.mjs --publicar
```

Opciones: `--nuevas 300 --vacios 40 --revisar 60 --pausa 1500` (pausa en ms entre fichas).

### Dejarlo programado en Windows

```powershell
powershell -ExecutionPolicy Bypass -File scripts\agentes\instalar-vigia.ps1
Start-ScheduledTask -TaskName CuentaClara-Vigia
Get-Content logs\vigia.log -Tail 20
```

Cambiar la hora: `-Hora 06:30`. Quitarlo: `-Quitar`. Corre con tu usuario, así que usa tus credenciales de git para el push.
