import fs from 'node:fs'
import path from 'node:path'

export type Destacada = { id: number; url: string; codigo: string; objeto: string; reparticion: string | null; detalle: string }

export type Corrida = {
  agente: string
  fuente: string
  inicio: string
  fin: string
  contrataciones: number
  nuevas: number
  revisadas: number
  actualizadas: number
  adjudicadas: number
  errores: number
  senales_nuevas: number
  destacadas: Destacada[]
}

/** Corridas reales de los agentes (scripts/agentes/*.mjs), la más reciente primero. */
export function getCorridas(limite = 15): Corrida[] {
  const archivo = path.join(process.cwd(), 'datos', 'agentes', 'ejecuciones.jsonl')
  if (!fs.existsSync(archivo)) return []
  return fs
    .readFileSync(archivo, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Corrida)
    .reverse()
    .slice(0, limite)
}
