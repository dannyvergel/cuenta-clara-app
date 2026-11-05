import fs from 'node:fs'
import path from 'node:path'

export type Senal = {
  fuente?: string
  id: number | string
  url: string
  objeto: string
  reparticion: string | null
  codigo: string
  detalle: string
  peso: number
}

export type ProveedorObs = {
  proveedor: string
  cuit: string | null
  monto: number
  adjudicaciones: number
  reparticiones: number
}

export type Observatorio = {
  generado: string
  contrataciones: number
  adjudicadas: number
  monto_adjudicado: number
  por_tipo: [string, number][]
  por_estado: [string, number][]
  por_reparticion: [string, number][]
  senales_por_codigo: [string, number][]
  senales: Senal[]
  proveedores: ProveedorObs[]
}

export const SENALES: Record<string, { titulo: string; explicacion: string }> = {
  SOBRE_PRESUPUESTO: { titulo: 'Sobre presupuesto', explicacion: 'Adjudicado más de 5% por encima del presupuesto oficial.' },
  UNICA_OFERTA: { titulo: 'Única oferta', explicacion: 'Se adjudicó con una sola oferta: poca competencia.' },
  POSIBLE_FRACCIONAMIENTO: { titulo: 'Posible fraccionamiento', explicacion: 'Tres o más compras ágiles parecidas en 30 días en la misma repartición.' },
  PLAZO_CORTO: { titulo: 'Plazo corto', explicacion: 'Menos de 3 días entre publicación y apertura.' },
  CUIT_INVALIDO: { titulo: 'CUIT inválido', explicacion: 'El CUIT del adjudicatario no pasa el dígito verificador.' },
  SOBREPRECIO_DETECTADO: { titulo: 'Sobreprecio reportado', explicacion: 'El propio organismo desestimó ofertas por sobreprecio.' },
  DESIERTA_O_FRACASADA: { titulo: 'Desierta o fracasada', explicacion: 'Ítems sin ofertas válidas: pliego a revisar o mercado cerrado.' },
}

export const FUENTES: Record<string, { nombre: string; origen: string }> = {
  rosario: { nombre: 'Municipalidad de Rosario', origen: 'las fichas oficiales de rosario.gob.ar' },
  mendoza: { nombre: 'Gobierno de Mendoza', origen: 'los datos abiertos OCDS de COMPR.AR Mendoza' },
}

// Cada jurisdicción tiene su propio archivo: no se mezclan montos de un municipio con los de una provincia.
export function getObservatorio(fuente = 'rosario'): Observatorio | null {
  if (!FUENTES[fuente]) return null
  const archivo = path.join(process.cwd(), 'datos', fuente === 'rosario' ? 'observatorio.json' : `observatorio-${fuente}.json`)
  if (!fs.existsSync(archivo)) return null
  return JSON.parse(fs.readFileSync(archivo, 'utf8')) as Observatorio
}
