#!/usr/bin/env node
// Baja el IPC nacional mensual del INDEC (nivel general, base dic-2016=100) desde la API de series de datos.gob.ar
// y lo guarda en datos/ipc.json. Lo usa senales.mjs para comparar presupuestos y adjudicaciones a valores del mismo mes.
// Uso: node scripts/ingesta/ipc.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const URL = 'https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=1000&format=json&start_date=2016-12-01'
const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl'
const d = JSON.parse(execFileSync(CURL, ['-sSL', '--fail', '-m', '60', URL], { encoding: 'utf8' }))
const serie = Object.fromEntries(d.data.map(([f, v]) => [f.slice(0, 7), v]))
fs.writeFileSync('datos/ipc.json', JSON.stringify({ fuente: 'INDEC vía apis.datos.gob.ar, serie 148.3_INIVELNAL_DICI_M_26', actualizado: new Date().toISOString(), serie }, null, 1) + '\n', 'utf8')
console.error(`IPC: ${d.data.length} meses, último ${d.data.at(-1)[0].slice(0, 7)}`)
