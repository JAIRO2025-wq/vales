import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Roboto, Space_Grotesk, Inter } from 'next/font/google';

const roboto = Roboto({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-headline',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'ValeDigit | Gestión de Vales de Caja Chica',
  description: 'Digitalización y firma de vales de caja chica para empresas.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ValeDigit',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${roboto.variable} ${spaceGrotesk.variable} ${inter.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" crossOrigin="use-credentials" />
        <meta name="theme-color" content="#1A237E" />
      </head>
      <body className="font-body antialiased min-h-screen bg-background text-foreground">
        {children}
        <Toaster />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Solo registrar el SW en producción.
              // En desarrollo, Next.js recompila sw.js en cada cambio y provoca
              // un loop de "nueva versión → recargar" (peor con "Update on reload").
              if (${process.env.NODE_ENV === 'production'} && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('SW registrado con scope:', registration.scope);
                      // Detectar cuando hay un nuevo SW esperando activarse
                      registration.addEventListener('updatefound', function() {
                        var newWorker = registration.installing;
                        if (newWorker) {
                          newWorker.addEventListener('statechange', function() {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                              // Guard: recargar como máximo una vez por sesión
                              if (!sessionStorage.getItem('sw-reloaded')) {
                                sessionStorage.setItem('sw-reloaded', '1');
                                console.log('Nueva versión disponible. Recargando...');
                                window.location.reload();
                              }
                            }
                          });
                        }
                      });
                    },
                    function(err) {
                      console.log('Error al registrar SW:', err);
                    }
                  );
                });

                // Recargar cuando el SW tome el control (tras skipWaiting + claim)
                var refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                  if (!refreshing && !sessionStorage.getItem('sw-reloaded')) {
                    refreshing = true;
                    sessionStorage.setItem('sw-reloaded', '1');
                    window.location.reload();
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
