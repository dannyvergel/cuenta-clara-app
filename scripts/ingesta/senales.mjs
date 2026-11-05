#!/usr/bin/env node
// Señales de alerta sobre compras reales ingestadas (JSONL de scripts/ingesta/*.mjs).
// Uso: node scripts/ingesta/senales.mjs datos/*.jsonl > datos/observatorio.json
// Las señales son indicios para mirar más de cerca, no acusaciones.

import fs from 'node:fs'
import { adjudicatarios, cuitValido, monto } from './rosario.mjs'

// --salida archivo.json escribe en UTF-8 (en PowerShell 5.1 el ">" guarda UTF-16 y rompe los acentos).
const argv = process.argv.slice(2)
const iSal = argv.indexOf('--salida')
const SALIDA = iSal >= 0 ? argv.splice(iSal, 2)[1] : null
const archivos = argv
const regs = new Map()
for (const f of archivos)
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); regs.set(`${r.fuente}:${r.id_fuente}`, r) }
const R = [...regs.values()]
// Re-derivar campos con el parser actual (los JSONL guardan el texto original del resultado).
// Solo las fuentes con resultado en texto libre (Rosario); las OCDS ya traen adjudicatarios estructurados.
for (const r of R.filter((x) => x.fuente === 'rosario')) {
  r.adjudicatarios = adjudicatarios(r.resultado).map((a) => ({ ...a, cuit_valido: a.cuit ? cuitValido(a.cuit) : null }))
  r.monto_adjudicado = r.adjudicatarios.some((a) => a.monto) ? r.adjudicatarios.reduce((s, a) => s + (a.monto ?? 0), 0) : null
}

const dias = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 864e5 : null)
const normal = (s) => (s ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const clave = (s) => normal(s).split(' ').filter((w) => w.length > 3).slice(0, 4).join(' ')

const senales = []
const add = (r, codigo, detalle, peso = 1) => senales.push({ fuente: r.fuente, id: r.id_fuente, url: r.url, objeto: r.objeto, reparticion: r.reparticion, codigo, detalle, peso })

for (const r of R) {
  const txt = r.resultado ?? ''
  if (/[uú]nic[oa] (oferente|oferta)/i.test(txt) || (r.numero_oferentes === 1 && r.estado === 'Adjudicada')) add(r, 'UNICA_OFERTA', 'Se adjudicó con una sola oferta', 2)
  // Más de 3x el presupuesto casi siempre es presupuesto cargado por ítem o mal parseado: no se marca.
  if (r.presupuesto_oficial && r.monto_adjudicado > r.presupuesto_oficial * 1.05 && r.monto_adjudicado <= r.presupuesto_oficial * 3)
    add(r, 'SOBRE_PRESUPUESTO', `Adjudicado ${Math.round((r.monto_adjudicado / r.presupuesto_oficial - 1) * 100)}% sobre el presupuesto oficial`, 3)
  const plazo = dias(r.fecha_publicacion, r.fecha_apertura)
  if (plazo !== null && plazo < 3 && /Licitaci/.test(r.tipo ?? '')) add(r, 'PLAZO_CORTO', `Solo ${Math.max(0, Math.round(plazo))} días entre publicación y apertura`, 2)
  for (const a of r.adjudicatarios ?? []) if (a.cuit && a.cuit_valido === false) add(r, 'CUIT_INVALIDO', `CUIT ${a.cuit} con dígito verificador inválido`, 3)
  if (/sobreprecio/i.test(txt)) add(r, 'SOBREPRECIO_DETECTADO', 'El propio organismo desestimó ofertas por sobreprecio', 1)
  if (/(desiert|fracasad)/i.test(txt) || /(Desierta|Fracasada)/.test(r.estado ?? '')) add(r, 'DESIERTA_O_FRACASADA', 'Ítems desiertos o fracasados: posible pliego mal armado o mercado cerrado', 1)
}

// Fraccionamiento: muchas compras ágiles del mismo objeto y repartición en 30 días.
const grupos = new Map()
for (const r of R.filter((x) => /Agil/i.test(x.tipo ?? '') && x.fecha_apertura)) {
  const k = `${r.reparticion}|${clave(r.objeto)}`
  if (!grupos.has(k)) grupos.set(k, [])
  grupos.get(k).push(r)
}
for (const [, g] of grupos) {
  g.sort((a, b) => a.fecha_apertura.localeCompare(b.fecha_apertura))
  for (let i = 0; i < g.length; i++) {
    const ventana = g.filter((x) => { const d = dias(g[i].fecha_apertura, x.fecha_apertura); return d >= 0 && d <= 30 })
    if (ventana.length >= 3) { add(g[i], 'POSIBLE_FRACCIONAMIENTO', `${ventana.length} compras ágiles parecidas en 30 días en la misma repartición`, 2); break }
  }
}

// Concentración: proveedor con más del 40% de lo adjudicado en una repartición (mínimo 3 adjudicaciones).
const porRep = new Map()
for (const r of R) for (const a of r.adjudicatarios ?? []) {
  if (!a.monto) continue
  const m = porRep.get(r.reparticion) ?? new Map()
  const p = m.get(a.nombre) ?? { monto: 0, n: 0 }
  p.monto += a.monto; p.n++
  m.set(a.nombre, p); porRep.set(r.reparticion, m)
}
const concentracion = []
for (const [rep, m] of porRep) {
  const total = [...m.values()].reduce((s, p) => s + p.monto, 0)
  for (const [prov, p] of m) if (p.n >= 3 && p.monto / total > 0.4) concentracion.push({ reparticion: rep, proveedor: prov, share: +(p.monto / total).toFixed(2), adjudicaciones: p.n, monto: p.monto })
}

// Ranking de proveedores: agrupa por razón social normalizada (EDECA S.A = EDECA SA).
const claveProv = (a) => normal(a.nombre).replace(/\b(S ?A|S ?R ?L|S ?A ?S|SOCIEDAD ANONIMA)\b/g, '').replace(/\s+/g, ' ').trim()
const prov = new Map()
for (const r of R) for (const a of r.adjudicatarios ?? []) {
  const p = prov.get(claveProv(a)) ?? { proveedor: a.nombre, cuit: a.cuit, monto: 0, adjudicaciones: 0, reparticiones: new Set() }
  p.monto += a.monto ?? 0; p.adjudicaciones++; p.reparticiones.add(r.reparticion); p.cuit ??= a.cuit
  prov.set(claveProv(a), p)
}
const proveedores = [...prov.values()].map((p) => ({ ...p, reparticiones: p.reparticiones.size })).sort((a, b) => b.monto - a.monto)

const cuenta = (f) => Object.entries(R.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])
const json = JSON.stringify({
  generado: new Date().toISOString(),
  contrataciones: R.length,
  adjudicadas: R.filter((r) => r.estado === 'Adjudicada').length,
  monto_adjudicado: R.reduce((s, r) => s + (r.monto_adjudicado ?? 0), 0),
  por_fuente: cuenta((r) => r.fuente),
  por_tipo: cuenta((r) => r.tipo), por_estado: cuenta((r) => r.estado), por_reparticion: cuenta((r) => r.reparticion).slice(0, 15),
  senales_por_codigo: Object.entries(senales.reduce((m, s) => ((m[s.codigo] = (m[s.codigo] ?? 0) + 1), m), {})),
  senales, concentracion, proveedores: proveedores.slice(0, 50),
}, null, 2)
if (SALIDA) fs.writeFileSync(SALIDA, json + '\n', 'utf8')
else console.log(json)
