# Instala el agente vigía como tarea programada de Windows (PowerShell 5.1).
# Corre todos los días a la hora indicada, con tu usuario, desde la carpeta del repo.
#
# Uso, desde la raíz del repo:
#   powershell -ExecutionPolicy Bypass -File scripts\agentes\instalar-vigia.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\agentes\instalar-vigia.ps1 -Hora 06:30
#   powershell -ExecutionPolicy Bypass -File scripts\agentes\instalar-vigia.ps1 -Quitar

param(
  [string]$Hora = "07:00",
  [switch]$Quitar
)

$Nombre = "CuentaClara-Vigia"

if ($Quitar) {
  Unregister-ScheduledTask -TaskName $Nombre -Confirm:$false
  Write-Host "Tarea $Nombre quitada."
  exit 0
}

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Node = (Get-Command node -ErrorAction Stop).Source

$Accion = New-ScheduledTaskAction -Execute $Node -Argument "scripts\agentes\vigia.mjs --publicar" -WorkingDirectory $Repo
$Disparador = New-ScheduledTaskTrigger -Daily -At $Hora
$Ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)

Register-ScheduledTask -TaskName $Nombre -Action $Accion -Trigger $Disparador -Settings $Ajustes `
  -Description "Cuenta Clara: baja compras nuevas de Rosario, recalcula señales y publica." -Force | Out-Null

Write-Host "Listo: $Nombre corre todos los días a las $Hora desde $Repo"
Write-Host "Probar ahora:  Start-ScheduledTask -TaskName $Nombre"
Write-Host "Ver el log:    Get-Content $Repo\logs\vigia.log -Tail 20"
