import { MIN_PUNTOS_REFERENCIA, detectarSenales, proyeccionLineal, totalCotizacion } from './calculos'
import { ErrorApi, ErrorConexion } from './errores'
import * as mock from './mock'
import { esSellada, ocultarBusqueda, type Fuente } from './publicacion'
import type { LicitacionInput, ObservacionInput } from './schemas'
import { canonico, sha256 } from './sha256'
import type {
  ConfirmacionCotizacion,
  DesglosePartida,
  ConfirmacionObservacion,
  SeguimientoObservacion,
  Cotizacion,
  Decision,
  EstadoLicitacion,
  Licitacion,
  LicitacionDetalle,
  LicitacionResumen,
  Partida,
  ProyeccionPartida,
  RankingProveedor,
} from './types'

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '') || '/api'

/** true cuando los datos vienen de la base propia (Route Handlers de /api). */
export const apiInterna = API_BASE === '/api'

/**
 * Respaldo con datos sintéticos: siempre en desarrollo y, en un despliegue de demostración,
 * cuando NEXT_PUBLIC_DATOS_DEMO=1 (sin base de datos; lo que se escribe no persiste).
 */
const enDesarrollo = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DATOS_DEMO === '1'

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${ruta}`, { cache: 'no-store', ...init })
  } catch {
    throw new ErrorConexion(`No se pudo contactar ${API_BASE}`)
  }
  const cuerpo = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (res.status === 503) throw new ErrorConexion(cuerpo?.error)
  if (!res.ok) throw new ErrorApi(res.status, cuerpo?.error ?? `El servidor respondió ${res.status}`)
  return cuerpo as T
}

const q = (pedidoId: string) => `?pedido_id=${encodeURIComponent(pedidoId)}`

const fuenteHttp: Fuente = {
  partidas: () => pedir('/partidas'),
  proveedores: () => pedir('/proveedores'),
  licitaciones: () => pedir('/licitaciones'),
  cotizaciones: (id) => pedir(`/cotizaciones${q(id)}`),
  busquedas: (id) => pedir(`/busquedas${q(id)}`),
  decisiones: () => pedir('/decisiones'),
  observaciones: (id) => pedir(`/observaciones?licitacion_id=${encodeURIComponent(id)}`),
}

/** Mismas reglas de publicación que la API, aplicadas sobre los datos sintéticos. */
const abierto = (id: string) => mock.licitaciones.find((l) => l.id === id)?.estado === 'abierto'
const fuenteMock: Fuente = {
  partidas: async () => mock.partidas,
  proveedores: async () => mock.proveedores,
  licitaciones: async () => mock.licitaciones,
  cotizaciones: async (id) => {
    const propias = mock.cotizaciones.filter((c) => c.pedido_id === id)
    return abierto(id) ? { pedido_id: id, estado: 'abierto', cantidad: propias.length } : propias
  },
  busquedas: async (id) => {
    const propias = mock.busquedas.filter((b) => b.pedido_id === id)
    return abierto(id) ? propias.map(ocultarBusqueda) : propias
  },
  decisiones: async () => mock.registro,
  observaciones: async (id) =>
    mock.observaciones
      .filter((o) => o.licitacion_id === id && o.estado === 'publicada')
      .map(({ codigo: _c, estado: _e, revisada: _r, ...publica }) => publica),
}

/** En el servidor se consulta la base directamente: no hace falta un salto HTTP a la propia app. */
async function fuentePrincipal(): Promise<Fuente> {
  if (typeof window === 'undefined' && apiInterna) return (await import('./server/repositorio')).fuenteDb
  return fuenteHttp
}

let avisado = false
/** true si alguna lectura cayó a los datos sintéticos (en desarrollo o en modo demo, sin base). */
export const datosDemo = () => avisado
function conRespaldo<K extends keyof Fuente>(clave: K) {
  return (async (...args: Parameters<Fuente[K]>) => {
    const principal = await fuentePrincipal()
    try {
      return await (principal[clave] as (...a: unknown[]) => Promise<unknown>)(...args)
    } catch (e) {
      if (!(enDesarrollo && e instanceof ErrorConexion)) throw e
      if (!avisado) {
        console.warn(`[api] ${e.message}. Usando datos mock (solo en desarrollo).`)
        avisado = true
      }
      return (fuenteMock[clave] as (...a: unknown[]) => Promise<unknown>)(...args)
    }
  }) as Fuente[K]
}

const fuente: Fuente = {
  partidas: conRespaldo('partidas'),
  proveedores: conRespaldo('proveedores'),
  licitaciones: conRespaldo('licitaciones'),
  cotizaciones: conRespaldo('cotizaciones'),
  busquedas: conRespaldo('busquedas'),
  decisiones: conRespaldo('decisiones'),
  observaciones: conRespaldo('observaciones'),
}

export const ESTADOS: EstadoLicitacion[] = ['abierto', 'aprobado', 'observado', 'rechazado']

export async function getPartidas(): Promise<Partida[]> {
  return fuente.partidas()
}

export async function getLicitaciones(filtros: { estado?: string; partida?: string } = {}): Promise<LicitacionResumen[]> {
  const [lics, parts] = await Promise.all([fuente.licitaciones(), fuente.partidas()])
  return lics
    .filter((l) => !filtros.estado || l.estado === filtros.estado)
    .filter((l) => !filtros.partida || l.partida_id === filtros.partida)
    .map((l) => ({ ...l, partida: parts.find((p) => p.id === l.partida_id)! }))
    .sort((a, b) => b.fecha_cierre.localeCompare(a.fecha_cierre))
}

export async function getLicitacionesAbiertas(): Promise<LicitacionResumen[]> {
  return getLicitaciones({ estado: 'abierto' })
}

export async function getLicitacion(id: string): Promise<LicitacionDetalle | null> {
  const [lics, parts, provs] = await Promise.all([fuente.licitaciones(), fuente.partidas(), fuente.proveedores()])
  const licitacion = lics.find((l) => l.id === id)
  if (!licitacion) return null
  const partida = parts.find((p) => p.id === licitacion.partida_id)!

  const [cots, busquedas, decs, observaciones] = await Promise.all([
    fuente.cotizaciones(id),
    fuente.busquedas(id),
    fuente.decisiones(),
    fuente.observaciones(id),
  ])

  // Ofertas selladas: la fuente solo informa la cantidad mientras el pedido esté abierto.
  if (esSellada(cots)) {
    return {
      licitacion,
      partida,
      decision: null,
      cantidad_ofertas: cots.cantidad,
      cotizaciones: null,
      puntos_referencia: 0,
      referencia_concluyente: false,
      busquedas,
      senales: null,
      observaciones_publicadas: observaciones.length,
    }
  }

  const senales = detectarSenales({ licitacion, cotizaciones: cots, licitaciones: lics, decisiones: decs, proveedores: provs })

  const decision = decs.find((d) => d.pedido_id === id) ?? null
  const puntos = cots.length + (decision?.referencia.fuentes.length ?? 0)
  const concluyente = decision !== null && puntos >= MIN_PUNTOS_REFERENCIA
  const referencia = decision?.referencia.valor ?? 0

  return {
    licitacion,
    partida,
    decision,
    cantidad_ofertas: cots.length,
    cotizaciones: cots
      .map((c) => {
        const total = totalCotizacion(c)
        return {
          ...c,
          proveedor_nombre: provs.find((p) => p.id === c.proveedor_id)?.nombre ?? c.proveedor_id,
          total_ars: total,
          desvio: concluyente && referencia > 0 ? (total - referencia) / referencia : null,
        }
      })
      .sort((a, b) => a.total_ars - b.total_ars),
    puntos_referencia: puntos,
    referencia_concluyente: concluyente,
    busquedas,
    senales,
    observaciones_publicadas: observaciones.length,
  }
}

export async function getProyeccionPresupuesto(): Promise<ProyeccionPartida[]> {
  const parts = await fuente.partidas()
  return parts.map((p) => {
    const proyeccion = proyeccionLineal(p.ejecutado)
    return { ...p, proyeccion, desvio_proyectado: (proyeccion - p.asignado) / p.asignado }
  })
}

export async function getRankingProveedores(): Promise<RankingProveedor[]> {
  const [proveedores, lics] = await Promise.all([fuente.proveedores(), fuente.licitaciones()])
  const cerradas = lics.filter((l) => l.estado !== 'abierto')
  const detalles = await Promise.all(cerradas.map((l) => getLicitacion(l.id)))
  const cotizaciones = detalles.flatMap((d) => d?.cotizaciones ?? [])

  return proveedores
    .map((p) => {
      const propias = cotizaciones.filter((c) => c.proveedor_id === p.id)
      const conDesvio = propias.filter((c) => c.desvio !== null).map((c) => c.desvio as number)
      return {
        ...p,
        cotizaciones: propias.length,
        desvio_promedio: conDesvio.length ? conDesvio.reduce((a, b) => a + b, 0) / conDesvio.length : null,
        observaciones: conDesvio.filter((d) => d > 0.25).length,
      }
    })
    .filter((p) => p.cotizaciones > 0 || p.id.startsWith('PRV-'))
    .sort((a, b) => (b.desvio_promedio ?? -Infinity) - (a.desvio_promedio ?? -Infinity))
}

/** Altera el contenido del tercer registro sin recalcular su hash, para demostrar la verificación. */
function alterar(registros: Decision[]): Decision[] {
  const i = Math.min(2, registros.length - 1)
  return registros.map((d, j) =>
    j === i ? { ...d, referencia: { ...d.referencia, valor: Math.round(d.referencia.valor * 1.18) } } : d,
  )
}

export async function getRegistro(variante: 'original' | 'alterado' = 'original'): Promise<Decision[]> {
  const registros = [...(await fuente.decisiones())].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return variante === 'alterado' ? alterar(registros) : registros
}

export async function enviarObservacion(datos: ObservacionInput): Promise<ConfirmacionObservacion> {
  return pedir<ConfirmacionObservacion>('/observaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
}

export async function consultarObservacion(codigo: string): Promise<SeguimientoObservacion | null> {
  if (typeof window === 'undefined' && apiInterna) {
    const { consultarSeguimiento } = await import('./server/repositorio')
    try {
      return await consultarSeguimiento(codigo)
    } catch (e) {
      if (e instanceof ErrorApi && e.status === 404) return null
      throw e
    }
  }
  try {
    return await pedir<SeguimientoObservacion>(`/observaciones/${encodeURIComponent(codigo)}`)
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 404) return null
    throw e
  }
}

export async function enviarCotizacion(cotizacion: Cotizacion): Promise<ConfirmacionCotizacion> {
  const datos: Cotizacion = { ...cotizacion, origen: 'portal' }
  try {
    return await pedir<ConfirmacionCotizacion>('/cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
  } catch (e) {
    if (!(enDesarrollo && e instanceof ErrorConexion)) throw e
    console.warn('[api] Cotización no persistida: base no disponible (desarrollo).')
    const hash = sha256(canonico(datos))
    return { id: `COT-${hash.slice(0, 8).toUpperCase()}`, hash, recibida: new Date().toISOString() }
  }
}

export async function crearLicitacion(datos: LicitacionInput): Promise<Licitacion> {
  return pedir<Licitacion>('/licitaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
}

export async function getDesglosePartidas(): Promise<DesglosePartida[]> {
  const [partidas, lics] = await Promise.all([fuente.partidas(), fuente.licitaciones()])
  const detalles = await Promise.all(lics.filter((l) => l.estado !== 'abierto').map((l) => getLicitacion(l.id)))
  const cerradas = new Map(detalles.filter((d) => d !== null).map((d) => [d!.licitacion.id, d!]))

  return partidas.map((p) => {
    const propias = lics.filter((l) => l.partida_id === p.id)
    const abiertas = propias.filter((l) => l.estado === 'abierto')
    let ofertado = 0
    let adjudicado = 0
    let nAdjudicadas = 0
    let nCerradas = 0
    for (const l of propias.filter((x) => x.estado !== 'abierto')) {
      const ofertas = cerradas.get(l.id)?.cotizaciones ?? []
      if (!ofertas.length) continue
      nCerradas++
      ofertado += ofertas[0].total_ars
      if (l.estado === 'aprobado') {
        const ganadora = ofertas.find((c) => c.proveedor_id === l.proveedor_adjudicado_id) ?? ofertas[0]
        adjudicado += ganadora.total_ars
        nAdjudicadas++
      }
    }
    return {
      ...p,
      abiertas: abiertas.length,
      estimado_abierto: abiertas.reduce((s, l) => s + l.monto_estimado, 0),
      cerradas: nCerradas,
      ofertado_cerrado: ofertado,
      adjudicadas: nAdjudicadas,
      adjudicado,
    }
  })
}
