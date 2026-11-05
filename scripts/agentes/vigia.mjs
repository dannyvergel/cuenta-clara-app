#!/usr/bin/env node
// Agente vigía: mantiene al día el observatorio de compras de Rosario.
//
// Cada corrida:
//   1. Busca fichas nuevas después del último id conocido (corta tras N ids vacíos seguidos).
//   2. Revisa un lote de contrataciones abiertas (las que hace más tiempo no mira) para captar adjudicaciones.
//   3. Recalcula las señales y anota cuáles son nuevas.
//   4. Registra la corrida en datos/agentes/ejecuciones.jsonl (la lee la pantalla /agentes).
//   5. Con --publicar hace git commit + push de datos/.
//
// Uso (PowerShell 5.1 o cualquier shell):
//   node scripts/agentes/vigia.mjs                 # corre y deja los cambios locales
//   node scripts/agentes/vigia.mjs --publicar      # además commitea y pushea
//   Opciones: --nuevas 300 --vacios 40 --revisar 60 --pausa 1500
//
// Tiene que correr desde una IP argentina: rosario.gob.ar corta conexiones de afuera.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { bajar } from '../ingesta/rosario.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true])
    return acc
  }, []),
)
const JSONL = 'datos/rosario.jsonl'
const OBS = 'datos/observatorio.json'
const EJEC = 'datos/agentes/ejecuciones.jsonl'
const LOG = 'logs/vigia.log'
const MAX_NUEVAS = Number(args.nuevas ?? 300)
const MAX_VACIOS = Number(args.vacios ?? 40)
const MAX_REVISAR = Number(args.revisar ?? 60)
const PAUSA = Number(args.pausa ?? 1500)
const ABIERTOS = new Set(['Abierta en Evaluacion', 'Publicada para Apertura'])

const dormir = (ms) => new Promise((s) => setTimeout(s, ms))
function log(msg) {
  const linea = `${new Date().toISOString()} ${msg}`
  console.log(linea)
  fs.mkdirSync(path.dirname(LOG), { recursive: true })
  fs.appendFileSync(LOG, linea + '\n', 'utf8')
}

function leerRegistros() {
  const m = new Map()
  if (fs.existsSync(JSONL)) for (const l of fs.readFileSync(JSONL, 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); m.set(r.id_fuente, r) }
  return m
}

const claveSenal = (s) => `${s.id}|${s.codigo}`
function senalesActuales() {
  if (!fs.existsSync(OBS)) return new Set()
  return new Set(JSON.parse(fs.readFileSync(OBS, 'utf8')).senales.map(claveSenal))
}

async function main() {
  const inicio = new Date()
  const regs = leerRegistros()
  const antes = senalesActuales()
  const errores = []
  let nuevas = 0, actualizadas = 0, adjudicadas = 0

  // 1. Fichas nuevas.
  const ultimo = Math.max(0, ...regs.keys())
  let vacios = 0
  for (let id = ultimo + 1; nuevas < MAX_NUEVAS && vacios < MAX_VACIOS; id++) {
    const r = await bajar(id)
    if (r) { regs.set(id, r); nuevas++; vacios = 0 } else vacios++
    await dormir(PAUSA)
  }
  log(`nuevas: ${nuevas} (último id antes: ${ultimo})`)

  // 2. Revisión de abiertas, empezando por las que hace más tiempo no se miran.
  const abiertas = [...regs.values()].filter((r) => ABIERTOS.has(r.estado)).sort((a, b) => (a.capturado ?? '').localeCompare(b.capturado ?? '')).slice(0, MAX_REVISAR)
  for (const viejo of abiertas) {
    const r = await bajar(viejo.id_fuente)
    if (!r) { errores.push(viejo.id_fuente); await dormir(PAUSA); continue }
    if (r.estado !== viejo.estado || r.resultado !== viejo.resultado) {
      actualizadas++
      if (r.estado === 'Adjudicada') adjudicadas++
    }
    regs.set(viejo.id_fuente, r)
    await dormir(PAUSA)
  }
  log(`revisadas: ${abiertas.length}, cambiaron: ${actualizadas} (${adjudicadas} adjudicadas), errores: ${errores.length}`)

  // Reescribe el JSONL ordenado y sin duplicados.
  const ordenados = [...regs.values()].sort((a, b) => b.id_fuente - a.id_fuente)
  fs.writeFileSync(JSONL, ordenados.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

  // 3. Señales.
  execFileSync(process.execPath, ['scripts/ingesta/senales.mjs', JSONL, '--salida', OBS], { stdio: 'inherit' })
  const obs = JSON.parse(fs.readFileSync(OBS, 'utf8'))
  const senalesNuevas = obs.senales.filter((s) => !antes.has(claveSenal(s))).sort((a, b) => b.peso - a.peso)
  log(`señales nuevas: ${senalesNuevas.length}`)

  // 4. Registro de la corrida.
  const corrida = {
    agente: 'vigia',
    fuente: 'rosario',
    inicio: inicio.toISOString(),
    fin: new Date().toISOString(),
    contrataciones: obs.contrataciones,
    nuevas,
    revisadas: abiertas.length,
    actualizadas,
    adjudicadas,
    errores: errores.length,
    senales_nuevas: senalesNuevas.length,
    destacadas: senalesNuevas.slice(0, 10).map(({ id, url, codigo, objeto, reparticion, detalle }) => ({ id, url, codigo, objeto, reparticion, detalle })),
  }
  fs.mkdirSync(path.dirname(EJEC), { recursive: true })
  fs.appendFileSync(EJEC, JSON.stringify(corrida) + '\n', 'utf8')

  // 5. Publicar.
  if (args.publicar) {
    const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
    git('add', 'datos')
    if (git('status', '--porcelain', 'datos')) {
      git('commit', '-m', `Vigía: ${nuevas} nuevas, ${actualizadas} actualizadas, ${senalesNuevas.length} señales nuevas`)
      git('push')
      log('publicado')
    } else log('sin cambios para publicar')
  }
  log('fin')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { log(`ERROR ${e.stack ?? e}`); process.exit(1) })
