#!/usr/bin/env node
// Ingesta de compras y licitaciones de la Municipalidad de Rosario.
// Fuente: fichas públicas en https://www.rosario.gob.ar/inicio/compras-licitaciones/detalle/<id>
// (el portal de datos abiertos suele estar caído; las fichas sí responden).
//
// Uso:
//   node scripts/ingesta/rosario.mjs --desde 38000 --hasta 38722 [--salida datos/rosario.jsonl] [--concurrencia 3]
//
// Escribe una línea JSON por contratación encontrada. Es reanudable: saltea ids ya presentes en la salida.

import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const sh = promisify(execFile)

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]])
    return acc
  }, []),
)
const DESDE = Number(args.desde ?? 38600)
const HASTA = Number(args.hasta ?? 38722)
const SALIDA = args.salida ?? 'datos/rosario.jsonl'
const CONC = Number(args.concurrencia ?? 3)
const BASE = 'https://www.rosario.gob.ar/inicio/compras-licitaciones/detalle/'

const ETIQUETAS = [
  'Tipo de contratación', 'Estado', 'N° de contratación', 'Expediente', 'Objeto',
  'Presupuesto oficial', 'Fecha de apertura', 'Costo de impugnación', 'Fecha de publicación',
  'Fecha Última Actualización', 'N° de resolución', 'Fecha de resolución', 'Resultado',
  'Consulta pliego', 'Recepción de ofertas', 'Lugar de apertura', 'Repartición licitante',
  'Ver pliego adjunto apto para cotizar',
]

const decode = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))

export function lineas(html) {
  const t = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '\n')
  return decode(t).split('\n').map((l) => l.trim()).filter(Boolean)
}

// Montos escritos a mano: "$1.602.103,50", "$21915.03", "$1.559.944.10", "$ 596.000".
export const monto = (s) => {
  if (!s) return null
  const m = s.match(/\$\s*(\d[\d.,]*)/)
  if (!m) return null
  let n = m[1].replace(/[.,]+$/, '')
  const dec = n.match(/[.,](\d{1,2})$/)
  const entero = (dec ? n.slice(0, -dec[0].length) : n).replace(/[.,]/g, '')
  return Number(dec ? `${entero}.${dec[1]}` : entero)
}

const fecha = (s) => {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?/)
  return m ? `${m[3]}-${m[2]}-${m[1]}${m[4] ? `T${m[4]}:00-03:00` : ''}` : null
}

// Extrae adjudicatarios del texto libre del resultado: razón social, CUIT y monto si aparecen.
export function adjudicatarios(texto) {
  if (!texto) return []
  // Sólo los tramos que adjudican: se cortan las frases de desestimación, desierto o fracaso.
  const tramos = texto
    .split(/(?=Se\s+desestim|Se\s+declara|DESESTIM|DESIERT|FRACASAD|Se\s+rechaz)/i)
    .filter((t) => !/^(Se\s+desestim|Se\s+declara|DESESTIM|DESIERT|FRACASAD|Se\s+rechaz)/i.test(t))
    .join(' ')
  const out = []
  const re = /([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 .,&'\-]{1,80}?\s(?:S\.?\s?A\.?\s?S\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?|S\.?\s?C\.?|COOPERATIVA[A-Z .]*|LTDA\.?|S\.?\s?H\.?))(?=[^A-ZÁÉÍÓÚÑ0-9]|$)\s*,?\s*(?:CUIT[:\s]*([0-9]{2}-?[0-9]{8}-?[0-9]))?/g
  let m
  while ((m = re.exec(tramos))) {
    const nombre = m[1].replace(/^[\d.,$\s]+/, '').replace(/^(ADJUDICATARIOS?:?|SE ADJUDICA A:?|ADJUDICA A|A|Y A|Y)\s+/i, '').trim().replace(/[ ,]+$/, '')
    const resto = tramos.slice(re.lastIndex, re.lastIndex + 400)
    const corte = resto.search(/[;*]| y a | a [A-ZÁÉÍÓÚÑ]{3,}/)
    const tramo = corte > 0 ? resto.slice(0, corte) : resto
    out.push({ nombre, cuit: m[2]?.replace(/-/g, '') ?? null, monto: monto(tramo) })
  }
  const vistos = new Set()
  return out.filter((a) => (vistos.has(a.nombre) ? false : vistos.add(a.nombre)))
}

export function cuitValido(cuit) {
  if (!/^\d{11}$/.test(cuit ?? '')) return false
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const s = w.reduce((a, p, i) => a + p * +cuit[i], 0)
  const dv = 11 - (s % 11)
  return (dv === 11 ? 0 : dv === 10 ? 9 : dv) === +cuit[10]
}

export function parsear(id, html) {
  const ls = lineas(html)
  const i0 = ls.indexOf('Tipo de contratación')
  if (i0 < 0) return null
  const campos = {}
  let actual = null
  for (const l of ls.slice(i0)) {
    if (l === 'Servicios') break
    if (ETIQUETAS.includes(l)) { actual = l; campos[l] = []; continue }
    if (actual) campos[actual].push(l)
  }
  const v = (k) => campos[k]?.join(' ') || null
  const resultado = v('Resultado')
  const adj = adjudicatarios(resultado).map((a) => ({ ...a, cuit_valido: a.cuit ? cuitValido(a.cuit) : null }))
  return {
    fuente: 'rosario', id_fuente: id, url: BASE + id,
    tipo: v('Tipo de contratación'), estado: v('Estado'),
    numero: v('N° de contratación'), expediente: v('Expediente'), objeto: v('Objeto'),
    presupuesto_oficial: monto(v('Presupuesto oficial')),
    fecha_apertura: fecha(v('Fecha de apertura')), fecha_publicacion: fecha(v('Fecha de publicación')),
    fecha_actualizacion: fecha(v('Fecha Última Actualización')), resolucion: v('N° de resolución'),
    fecha_resolucion: fecha(v('Fecha de resolución')), resultado,
    reparticion: v('Repartición licitante')?.split(' - ')[0] ?? null,
    pliegos: campos['Ver pliego adjunto apto para cotizar'] ?? [],
    adjudicatarios: adj,
    monto_adjudicado: adj.some((a) => a.monto) ? adj.reduce((s, a) => s + (a.monto ?? 0), 0) : null,
    capturado: new Date().toISOString(),
  }
}

// Se usa curl (viene en Windows 10+, macOS y Linux): más tolerante que fetch con estos servidores.
export async function bajar(id, intento = 1) {
  try {
    const { stdout } = await sh('curl', ['-sL', '--max-time', '40', '-A', 'Mozilla/5.0 (CuentaClara observatorio)', '-w', '\n%{http_code}', BASE + id], { maxBuffer: 20e6 })
    const corte = stdout.lastIndexOf('\n')
    const status = Number(stdout.slice(corte + 1))
    if (status === 404) return null
    if (status !== 200) throw new Error('HTTP ' + status)
    return parsear(id, stdout.slice(0, corte))
  } catch (e) {
    if (intento < 3) { await new Promise((s) => setTimeout(s, 3000 * intento)); return bajar(id, intento + 1) }
    console.error(`id ${id}: ${e.message.split('\n')[0]}`)
    return null
  }
}

async function main() {
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true })
  const ya = new Set()
  if (fs.existsSync(SALIDA)) for (const l of fs.readFileSync(SALIDA, 'utf8').split('\n')) if (l) ya.add(JSON.parse(l).id_fuente)
  const cola = []
  for (let id = HASTA; id >= DESDE; id--) if (!ya.has(id)) cola.push(id)
  const out = fs.createWriteStream(SALIDA, { flags: 'a' })
  let ok = 0, vacios = 0
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (cola.length) {
      const id = cola.shift()
      const reg = await bajar(id)
      if (reg) { out.write(JSON.stringify(reg) + '\n'); ok++ } else vacios++
      await new Promise((s) => setTimeout(s, 250))
    }
  }))
  out.end()
  console.log(`listo: ${ok} contrataciones, ${vacios} ids vacíos → ${SALIDA}`)
}

// pathToFileURL: en Windows argv[1] es C:\\... y la comparación con file:// fallaba en silencio.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
