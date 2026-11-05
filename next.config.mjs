/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingIncludes: {
    '/observatorio': ['./datos/observatorio.json'],
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
