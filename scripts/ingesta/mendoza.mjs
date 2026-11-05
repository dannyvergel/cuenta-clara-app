#!/usr/bin/env node
// Ingesta de compras de la Provincia de Mendoza (COMPR.AR Mendoza) publicadas en estándar OCDS.
// Fuente: https://datosabiertos-compras.mendoza.gov.ar/datasets/ (CC BY 4.0).
// Uso: node scripts/ingesta/mendoza.mjs [--salida datos/mendoza.jsonl]
// Baja todos los paquetes de releases, se queda con la última versión de cada proceso (ocid)
// y escribe un JSONL con el mismo formato que datos/rosario.jsonl.

import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { cuitValido } from './rosario.mjs'

const run = promisify(execFile)
const BASE = 'https://datosabiertos-compras.mendoza.gov.ar'
const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl'

async function bajar(url) {
  for (let i = 1; i <= 3; i++) {
    try {
      const { stdout } = await run(CURL, ['-sSL', '--fail', '-m', '300', '-A', 'CuentaClara/1.0 (observatorio de compras)', url], { maxBuffer: 1 << 30 })
      return stdout
    } catch (e) {
      if (i === 3) throw e
      await new Promise((r) => setTimeout(r, 3000 * i))
    }
  }
}

const ESTADO = { complete: 'Adjudicada', unsuccessful: 'Fracasada', active: 'Abierta', cancelled: 'Sin Efecto', planned: 'Planificada' }
const dia = (s) => (s ? String(s).slice(0, 10) : null)

export function aRegistro(rel) {
  const t = rel.tender ?? {}
  const awards = (rel.awards ?? []).filter((a) => a.status !== 'cancelled' && a.status !== 'unsuccessful')
  const porProv = new Map()
  for (const a of awards)
    for (const s of a.suppliers ?? []) {
      const cuit = String(s.id ?? '').replace(/\D/g, '') || null
      const k = cuit ?? s.name
      const p = porProv.get(k) ?? { nombre: s.name, cuit, monto: 0 }
      // Un award con varios proveedores reparte el monto en partes iguales (OCDS no lo desagrega).
      p.monto += (a.value?.amount ?? 0) / Math.max(1, a.suppliers.length)
      porProv.set(k, p)
    }
  const adjudicatarios = [...porProv.values()].map((a) => ({ ...a, monto: a.monto || null, cuit_valido: a.cuit ? cuitValido(a.cuit) : null }))
  const monto = adjudicatarios.reduce((s, a) => s + (a.monto ?? 0), 0)
  let estado = ESTADO[t.status] ?? (awards.length ? 'Adjudicada' : 'Sin dato')
  if (estado === 'Abierta' && awards.length) estado = 'Adjudicada'
  return {
    fuente: 'mendoza',
    id_fuente: rel.ocid,
    url: t.awardCriteriaDetails?.startsWith('http') ? t.awardCriteriaDetails : `${BASE}/`,
    tipo: t.submissionMethodDetails ?? t.procurementMethod ?? null,
    estado,
    numero: t.id ?? null,
    expediente: null,
    objeto: t.title ?? t.description ?? rel.planning?.budget?.description ?? null,
    presupuesto_oficial: rel.planning?.budget?.amount?.amount ?? t.value?.amount ?? null,
    fecha_apertura: t.tenderPeriod?.endDate ?? null,
    fecha_publicacion: dia(t.tenderPeriod?.startDate ?? t.enquiryPeriod?.startDate ?? rel.date),
    fecha_actualizacion: dia(rel.date),
    resolucion: null,
    fecha_resolucion: dia(awards[0]?.date),
    resultado: null,
    numero_oferentes: t.numberOfTenderers ?? null,
    reparticion: (rel.buyer?.name ?? '').replace(/^[\d-]+\s*-\s*/, '') || null,
    pliegos: [],
    adjudicatarios,
    monto_adjudicado: adjudicatarios.length ? monto : null,
    capturado: new Date().toISOString(),
  }
}

// Release compilado simple: los objetos se toman del release más nuevo que los tenga;
// awards y contracts se unen por id (gana la versión más nueva).
export function compilar(rels) {
  const orden = [...rels].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const c = { ocid: orden[0].ocid, awards: [], contracts: [] }
  const unir = (lista, nuevos) => { for (const n of nuevos ?? []) { const i = lista.findIndex((x) => x.id === n.id); if (i >= 0) lista[i] = n; else lista.push(n) } }
  for (const r of orden) {
    for (const k of ['date', 'buyer', 'planning', 'tender']) if (r[k]) c[k] = r[k]
    unir(c.awards, r.awards); unir(c.contracts, r.contracts)
  }
  return c
}

async function main() {
  const argv = process.argv.slice(2)
  const iSal = argv.indexOf('--salida')
  const salida = iSal >= 0 ? argv[iSal + 1] : 'datos/mendoza.jsonl'
  const html = await bajar(`${BASE}/datasets/`)
  const paquetes = [...new Set([...html.matchAll(/href="(\/descargar-json\/[^"]+\.json)"/g)].map((m) => m[1]))]
  if (!paquetes.length) throw new Error('No encontré paquetes OCDS en /datasets/ (¿cambió el sitio?)')
  // Un proceso puede venir en varios releases (tender en uno, award/contract en otro): se compilan.
  const porOcid = new Map()
  for (const p of paquetes) {
    console.error(`bajando ${p}`)
    const pkg = JSON.parse(await bajar(BASE + p))
    for (const rel of pkg.releases ?? []) {
      if (!porOcid.has(rel.ocid)) porOcid.set(rel.ocid, [])
      porOcid.get(rel.ocid).push(rel)
    }
  }
  const regs = [...porOcid.values()].map(compilar).map(aRegistro).sort((a, b) => (b.fecha_publicacion ?? '').localeCompare(a.fecha_publicacion ?? ''))
  fs.mkdirSync(path.dirname(salida), { recursive: true })
  fs.writeFileSync(salida, regs.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  console.error(`${regs.length} procesos de ${paquetes.length} paquetes -> ${salida}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => { console.error(e.message); process.exit(1) })
