import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FUENTES, getObservatorio, SENALES } from '@/lib/observatorio'
import { formatoMoneda } from '@/lib/format'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Observatorio de compras' }

const PESO_CLASE: Record<number, string> = {
  3: 'bg-danger-soft text-danger border-danger/25',
  2: 'bg-warn-soft text-warn border-warn/30',
  1: 'bg-info-soft text-primary border-primary/20',
}

export default async function ObservatorioPage({ searchParams }: { searchParams: Promise<{ senal?: string; fuente?: string }> }) {
  const { senal, fuente: f } = await searchParams
  const fuente = f && FUENTES[f] ? f : 'rosario'
  const obs = getObservatorio(fuente)
  const q = (extra: Record<string, string>) => '/observatorio?' + new URLSearchParams({ ...(fuente !== 'rosario' ? { fuente } : {}), ...extra }).toString()
  const selector = (
    <nav aria-label="Jurisdicción" className="mb-6 flex flex-wrap gap-2">
      {Object.entries(FUENTES).map(([k, v]) => (
        <Link
          key={k}
          href={k === 'rosario' ? '/observatorio' : `/observatorio?fuente=${k}`}
          className={cn('rounded-md border px-3 py-1.5 text-sm font-medium', k === fuente ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
        >
          {v.nombre}
        </Link>
      ))}
    </nav>
  )

  if (!obs) {
    return (
      <>
        {selector}
        <PageHeader
          eyebrow="Observatorio"
          title="Todavía no hay datos ingestados"
          description="Corré el script de ingesta de esta fuente y senales.mjs para generar su observatorio."
        />
      </>
    )
  }

  const filtro = senal && SENALES[senal] ? senal : null
  const senales = obs.senales
    .filter((s) => !filtro || s.codigo === filtro)
    .sort((a, b) => b.peso - a.peso || String(b.id).localeCompare(String(a.id), 'es', { numeric: true }))
  const generado = new Date(obs.generado).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      {selector}
      <PageHeader
        eyebrow={`Observatorio · ${FUENTES[fuente].nombre}`}
        title="Compras públicas reales, con lupa"
        description={
          <>
            {obs.contrataciones.toLocaleString('es-AR')} contrataciones leídas de {FUENTES[fuente].origen},
            actualizado el {generado}. Las señales son indicios para mirar de cerca, no acusaciones.
          </>
        }
      />

      <section aria-label="Resumen" className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          { k: 'Contrataciones', v: obs.contrataciones.toLocaleString('es-AR') },
          { k: 'Adjudicadas', v: obs.adjudicadas.toLocaleString('es-AR') },
          { k: 'Monto adjudicado', v: formatoMoneda(obs.monto_adjudicado) },
        ].map((c) => (
          <div key={c.k} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{c.k}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{c.v}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="t-senales" className="mb-10">
        <h2 id="t-senales" className="mb-3 text-xl font-semibold">Señales de alerta</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href={q({})}
            className={cn('rounded-full border px-3 py-1 text-sm', !filtro ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
          >
            Todas ({obs.senales.length})
          </Link>
          {obs.senales_por_codigo.map(([codigo, n]) => (
            <Link
              key={codigo}
              href={q({ senal: codigo })}
              title={SENALES[codigo]?.explicacion}
              className={cn('rounded-full border px-3 py-1 text-sm', filtro === codigo ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
            >
              {SENALES[codigo]?.titulo ?? codigo} ({n})
            </Link>
          ))}
        </div>
        {filtro && <p className="mb-3 text-sm text-muted-foreground">{SENALES[filtro].explicacion}</p>}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="pl-4">Señal</TableHead>
                <TableHead>Objeto</TableHead>
                <TableHead>Repartición</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="pr-4">Fuente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {senales.slice(0, 200).map((s, i) => (
                <TableRow key={`${s.id}-${s.codigo}-${i}`}>
                  <TableCell className="pl-4">
                    <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', PESO_CLASE[s.peso] ?? PESO_CLASE[1])}>
                      {SENALES[s.codigo]?.titulo ?? s.codigo}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">{s.objeto}</TableCell>
                  <TableCell className="max-w-[12rem] whitespace-normal text-muted-foreground">{s.reparticion}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal">{s.detalle}</TableCell>
                  <TableCell className="pr-4">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                      {typeof s.id === 'string' ? s.id.replace(/^ocds-[a-z0-9]+-/, '') : `Ficha ${s.id}`}
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="t-prov">
          <h2 id="t-prov" className="mb-3 text-xl font-semibold">Proveedores con más adjudicado</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableHead className="pl-4">Proveedor</TableHead>
                  <TableHead className="text-right">Adjudicaciones</TableHead>
                  <TableHead className="pr-4 text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obs.proveedores.slice(0, 15).map((p) => (
                  <TableRow key={p.proveedor}>
                    <TableCell className="pl-4 whitespace-normal">{p.proveedor}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.adjudicaciones}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{formatoMoneda(p.monto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section aria-labelledby="t-rep">
          <h2 id="t-rep" className="mb-3 text-xl font-semibold">Reparticiones que más compran</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableHead className="pl-4">Repartición</TableHead>
                  <TableHead className="pr-4 text-right">Contrataciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obs.por_reparticion.slice(0, 15).map(([rep, n]) => (
                  <TableRow key={rep}>
                    <TableCell className="pl-4 whitespace-normal">{rep}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{n}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </>
  )
}
