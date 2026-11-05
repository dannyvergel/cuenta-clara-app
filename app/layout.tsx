import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { sesionActual } from '@/lib/sesion'
import './globals.css'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  title: {
    default: 'Cuenta Clara · Trazabilidad de compras públicas',
    template: '%s · Cuenta Clara',
  },
  description:
    'Plataforma pública de trazabilidad de compras estatales: licitaciones, cotizaciones, precios de referencia, presupuesto y registro verificable de decisiones.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f6f7f9',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const usuario = await sesionActual()
  return (
    <html lang="es-AR" className={`${plexSans.variable} ${plexMono.variable} bg-background`}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Saltar al contenido
        </a>
        <SiteHeader usuario={usuario} />
        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 md:py-10">
          {children}
        </main>
        <SiteFooter />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
