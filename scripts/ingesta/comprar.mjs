#!/usr/bin/env node
// Ingesta de COMPR.AR: compras de bienes y servicios de la Administración Pública Nacional.
// Fuente: datos.gob.ar, dataset "Sistema de Contrataciones Electrónicas" (Oficina Nacional de Contrataciones, CC BY 4.0).
// Une Convocatorias (presupuesto, fechas, objeto) con Adjudicaciones (proveedor, CUIT, orden de compra, monto)
// por número de procedimiento y escribe datos/comprar.jsonl con el mismo formato que Rosario y Mendoza.
//
// Uso (PowerShell 5.1, desde Argentina: datos.gob.ar no responde desde el exterior):
//   node scripts/ingesta/comprar.mjs                       # busca en datos.gob.ar los CSV 2016-2026 y los baja
//   node scripts/ingesta/comprar.mjs --desde 2024           # solo procesos publicados desde 2024 (por defecto 2024)
//   node scripts/ingesta/comprar.mjs --convocatorias conv.csv --adjudicaciones adj.csv   # CSV ya bajados
// Los CSV bajados quedan en datos/crudo/ (ignorado por git) y se reusan si ya están.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { cuitValido } from './rosario.mjs'

const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl'
const CKAN = 'https://datos.gob.ar/api/3/action/package_show?id=sistema-de-contrataciones-electronicas'
const CRUDO = 'datos/crudo'

// CSV RFC 4180 (comillas, comas y saltos de línea dentro de campos).
export function parseCSV(txt) {
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (comillas) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++ } else comillas = false }
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo.replace(/\r$/, '')); filas.push(fila); fila = []; campo = '' }
    else campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  const [cab, ...resto] = filas
  // Los CSV viejos dicen "Número Procedimiento"; los 2016-2026, "Numero_Proceso". Se normaliza a minúsculas sin acentos ni separadores.
  const claves = cab.map((h) => h.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''))
  return resto.filter((f) => f.length > 1).map((f) => Object.fromEntries(claves.map((k, i) => [k, (f[i] ?? '').trim()])))
}

const v = (r, ...ks) => { for (const k of ks) if (r[k]) return r[k]; return '' }
const numero = (r) => v(r, 'numeroprocedimiento', 'numeroproceso')

// "05/11/2020 12:24:00 p.m." o ISO -> "2020-11-05" (o con hora si se pide).
export function fecha(s, conHora = false) {
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (iso) return conHora && iso[4] ? `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}` : `${iso[1]}-${iso[2]}-${iso[3]}`
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?)?/i)
  if (!m) return null
  const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (!conHora || !m[4]) return d
  let h = +m[4] % 12
  if ((m[6] ?? '').toLowerCase() === 'p') h += 12
  else if (!m[6]) h = +m[4]
  return `${d}T${String(h).padStart(2, '0')}:${m[5]}`
}

const num = (s) => {
  if (!s) return null
  const t = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const esPesos = (m) => !m || /peso/i.test(m) || /^ARS$/i.test(m)
const organismo = (s) => s.replace(/^\d+\s*-\s*/, '') || null

export function unir(convocatorias, adjudicaciones, desde = 0) {
  const porNum = new Map()
  for (const c of convocatorias) {
    const n = numero(c)
    if (!n) continue
    porNum.set(n, { c, adj: [] })
  }
  for (const a of adjudicaciones) {
    const n = numero(a)
    if (!n) continue
    if (!porNum.has(n)) porNum.set(n, { c: null, adj: [] })
    porNum.get(n).adj.push(a)
  }
  const regs = []
  for (const [n, { c, adj }] of porNum) {
    const base = c ?? adj[0]
    const publicacion = fecha(v(c ?? {}, 'fechadepublicacion'))
    const adjFecha = adj.map((a) => fecha(v(a, 'fechadeadjudicacion'))).filter(Boolean).sort()[0] ?? null
    const anio = Number((publicacion ?? adjFecha ?? v(base, 'ejercicio')).slice(0, 4)) || 0
    if (anio < desde) continue
    const porProv = new Map()
    let otraMoneda = false
    for (const a of adj) {
      const cuit = v(a, 'cuit', 'cuitnit').replace(/\D/g, '') || null
      const k = cuit ?? v(a, 'descripcionproveedor', 'razonsocial')
      const p = porProv.get(k) ?? { nombre: v(a, 'descripcionproveedor', 'razonsocial') || null, cuit, monto: 0, ordenes: [] }
      const monto = num(v(a, 'monto'))
      if (esPesos(v(a, 'moneda'))) p.monto += monto ?? 0
      else otraMoneda = true
      const oc = v(a, 'documentocontractual')
      if (oc && !p.ordenes.includes(oc)) p.ordenes.push(oc)
      porProv.set(k, p)
    }
    const adjudicatarios = [...porProv.values()].map((p) => ({ ...p, monto: p.monto || null, // Solo se juzga el dígito verificador con 11 dígitos; otros largos son errores de carga del organismo (cuit_formato).
      cuit_valido: p.cuit?.length === 11 ? cuitValido(p.cuit) : null, cuit_formato: p.cuit && p.cuit.length !== 11 ? 'irregular' : undefined }))
    const total = adjudicatarios.reduce((s, p) => s + (p.monto ?? 0), 0)
    regs.push({
      fuente: 'comprar',
      id_fuente: n,
      url: 'https://comprar.gob.ar/', // COMPR.AR no tiene enlace directo por número: se busca en el portal
      tipo: v(base, 'tipodeprocedimiento') || null,
      estado: adj.length ? 'Adjudicada' : v(c ?? {}, 'etapa') ? 'Publicada' : 'Sin dato',
      numero: n,
      expediente: null,
      objeto: v(c ?? {}, 'objetodelprocedimiento', 'objetodelproceso', 'nombredelprocedimiento', 'nombredelproceso') || v(base, 'rubros') || null,
      presupuesto_oficial: num(v(c ?? {}, 'montoestimado')),
      fecha_apertura: fecha(v(c ?? {}, 'fechadeapertura'), true),
      fecha_publicacion: publicacion,
      fecha_actualizacion: adjFecha ?? publicacion,
      resolucion: null,
      fecha_resolucion: adjFecha,
      resultado: null,
      numero_oferentes: null,
      apartado_directa: v(base, 'apartadodirecta') || null,
      reparticion: organismo(v(base, 'descripcionsaf')),
      unidad: v(base, 'descripcionuoc') || null,
      pliegos: [],
      adjudicatarios,
      monto_adjudicado: adjudicatarios.length ? total : null,
      otra_moneda: otraMoneda || undefined,
      capturado: new Date().toISOString(),
    })
  }
  return regs.sort((a, b) => (b.fecha_publicacion ?? '').localeCompare(a.fecha_publicacion ?? ''))
}

function bajar(url, destino) {
  if (fs.existsSync(destino) && fs.statSync(destino).size > 1000) return destino
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  console.error(`bajando ${url}`)
  execFileSync(CURL, ['-sSL', '--fail', '--retry', '3', '-m', '1800', '-A', 'Mozilla/5.0 (CuentaClara)', '-o', destino, url], { stdio: 'inherit' })
  return destino
}

function buscarRecursos() {
  const pkg = JSON.parse(execFileSync(CURL, ['-sSL', '--fail', '-m', '60', '-A', 'Mozilla/5.0 (CuentaClara)', CKAN], { encoding: 'utf8' }))
  const rec = pkg.result.resources
  const elegir = (re) => rec.find((r) => re.test(r.name) && /2026/.test(r.name) && /csv/i.test(r.format ?? r.url))
  const conv = elegir(/convocatoria/i), adj = elegir(/adjudicaci/i)
  if (!conv || !adj) throw new Error(`No encontré los CSV 2016-2026 en datos.gob.ar. Recursos: ${rec.map((r) => r.name).join(' | ')}`)
  return { conv: conv.url, adj: adj.url }
}

function main() {
  const argv = process.argv.slice(2)
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const desde = Number(arg('--desde', '2024'))
  const salida = arg('--salida', 'datos/comprar.jsonl')
  let fConv = arg('--convocatorias'), fAdj = arg('--adjudicaciones')
  if (!fConv || !fAdj) {
    const { conv, adj } = buscarRecursos()
    fConv = bajar(conv, path.join(CRUDO, 'comprar-' + path.basename(new URL(conv).pathname)))
    fAdj = bajar(adj, path.join(CRUDO, 'comprar-' + path.basename(new URL(adj).pathname)))
  }
  const conv = parseCSV(fs.readFileSync(fConv, 'utf8'))
  const adj = parseCSV(fs.readFileSync(fAdj, 'utf8'))
  console.error(`convocatorias: ${conv.length} filas, adjudicaciones: ${adj.length} filas`)
  const regs = unir(conv, adj, desde)
  fs.mkdirSync(path.dirname(salida), { recursive: true })
  fs.writeFileSync(salida, regs.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  console.error(`${regs.length} procesos desde ${desde} -> ${salida}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main() } catch (e) { console.error(e.message); process.exit(1) }
}
