import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Corrida } from '@/lib/corridas'
import { SENALES } from '@/lib/observatorio'

const fecha = (iso: string) =>
  Number.isNaN(new Date(iso).getTime()) ? iso : new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const minutos = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) || 1)

export function CorridasVigia({ corridas }: { corridas: Corrida[] }) {
  const ultima = corridas[0]
  return (
    <section aria-labelledby="t-vigia" className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-vigia" className="text-xl font-semibold">
          Vigía de compras · <span className="text-ok">activo</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {ultima ? `Última corrida: ${fecha(ultima.fin)} · ${ultima.contrataciones.toLocaleString('es-AR')} contrataciones` : 'Todavía no corrió'}
        </p>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Todos los días baja las fichas nuevas de rosario.gob.ar, revisa las contrataciones abiertas para captar
        adjudicaciones, recalcula las señales y publica los cambios en el Observatorio.
      </p>

      {ultima && ultima.destacadas.length > 0 && (
        <div className="mb-4 rounded-lg border border-warn/30 bg-warn-soft p-4">
          <p className="mb-2 text-sm font-semibold">Señales nuevas en la última corrida</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {ultima.destacadas.map((d) => (
              <li key={`${d.id}-${d.codigo}`}>
                <span className="font-medium">{SENALES[d.codigo]?.titulo ?? d.codigo}:</span> {d.objeto}{' '}
                <a href={d.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                  ficha {d.id}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {corridas.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="pl-4">Corrida</TableHead>
                <TableHead className="text-right">Nuevas</TableHead>
                <TableHead className="text-right">Revisadas</TableHead>
                <TableHead className="text-right">Cambiaron</TableHead>
                <TableHead className="text-right">Señales nuevas</TableHead>
                <TableHead className="pr-4 text-right">Errores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corridas.map((c) => (
                <TableRow key={c.inicio}>
                  <TableCell className="pl-4">
                    {fecha(c.inicio)} <span className="text-muted-foreground">· {minutos(c.inicio, c.fin)} min</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.nuevas}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.revisadas}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.actualizadas}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.senales_nuevas}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{c.errores}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
