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
              if ('serviceWorker' in navigator) {
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
                              console.log('Nueva versión disponible. Recargando...');
                              // Recargar la página para obtener el nuevo HTML con los chunks actualizados
                              window.location.reload();
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
                  if (!refreshing) {
                    refreshing = true;
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
