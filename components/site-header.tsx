'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Logo } from '@/components/logo'
import { ETIQUETA_ROL, type Rol, type Usuario } from '@/lib/roles'
import { cn } from '@/lib/utils'

const secciones: { href: string; label: string; roles?: Rol[] }[] = [
  { href: '/observatorio', label: 'Observatorio' },
  { href: '/licitaciones', label: 'Licitaciones' },
  { href: '/mapa', label: 'Mapa' },
  { href: '/presupuesto', label: 'Presupuesto' },
  { href: '/proveedores', label: 'Proveedores' },
  { href: '/portal', label: 'Portal de proveedores', roles: ['proveedor', 'admin'] },
  { href: '/ciudadano', label: 'Ciudadanía' },
  { href: '/agentes', label: 'Agentes y flujos', roles: ['admin'] },
]

export function SiteHeader({ usuario }: { usuario: Usuario | null }) {
  const pathname = usePathname()
  const router = useRouter()

  async function salir() {
    await fetch('/api/sesion', { method: 'DELETE' })
    router.push('/licitaciones')
    router.refresh()
  }

  const visibles = secciones.filter((s) => !s.roles || (usuario && s.roles.includes(usuario.rol)))

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 shadow-sm backdrop-blur">
      <div className="h-1 bg-primary" aria-hidden="true" />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pb-2 pt-3 md:px-6">
        <Link href="/" aria-label="Cuenta Clara, inicio" className="rounded-sm">
          <Logo />
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {usuario ? (
            <>
              <span className="hidden flex-col text-right leading-tight sm:flex">
                <span className="font-medium">{usuario.nombre}</span>
                <span className="text-xs text-muted-foreground">{ETIQUETA_ROL[usuario.rol]}</span>
              </span>
              <button
                type="button"
                onClick={salir}
                className="h-9 rounded-md border border-border px-3 font-medium transition-colors hover:bg-muted"
              >
                Salir
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
      <nav aria-label="Secciones principales" className="mx-auto max-w-6xl overflow-x-auto px-4 md:px-6">
        <ul className="flex gap-1">
          {visibles.map((s) => {
            const activo = pathname === s.href || pathname.startsWith(`${s.href}/`)
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  aria-current={activo ? 'page' : undefined}
                  className={cn(
                    'block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    activo
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {s.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}
