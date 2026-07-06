import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Server Actions - Ajuste de límite de tamaño
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Headers para evitar caché del HTML (los chunks de _next/static ya tienen hash inmutable)
  async headers() {
    return [
      {
        source: '/:path*{.html,.php,/}',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0',
          },
        ],
      },
      {
        // También aplica para rutas sin extensión (páginas de Next.js)
        source: '/((?!_next|api|favicon|icon|manifest).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/vale.html',
        destination: '/vale',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
