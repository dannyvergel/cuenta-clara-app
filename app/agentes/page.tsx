import type { Metadata } from 'next'
import { ConfiguracionAgentes } from '@/components/agentes/configuracion-agentes'
import { CorridasVigia } from '@/components/agentes/corridas-vigia'
import { PageHeader } from '@/components/page-header'
import { getCorridas } from '@/lib/corridas'
import { exigirRol } from '@/lib/sesion'

export const metadata: Metadata = { title: 'Agentes y flujos' }

export default async function AgentesPage() {
  await exigirRol(['admin'], '/agentes')
  return (
    <>
      <PageHeader
        eyebrow="Configuración"
        title="Agentes y flujos"
        description="Qué agentes trabajan solos sobre los datos de compras, qué encontraron en cada corrida y cuáles vienen después."
      />
      <CorridasVigia corridas={getCorridas()} />
      <h2 className="mb-1 text-xl font-semibold">Próximos agentes</h2>
      <p className="mb-4 text-sm text-muted-foreground">En diseño: la configuración se guarda solo en este navegador y todavía no ejecutan.</p>
      <ConfiguracionAgentes />
    </>
  )
}
