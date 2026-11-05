/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingIncludes: {
    '/observatorio': ['./datos/observatorio*.json'],
    '/agentes': ['./datos/observatorio.json', './datos/agentes/ejecuciones.jsonl'],
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
