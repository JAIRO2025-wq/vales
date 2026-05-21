import { getServerConfig } from "@/lib/config-server";
import ConfigClient from "./config-client";

export default async function ConfigPage() {
  // Obtenemos la configuración del servidor antes de pasarla al cliente
  const config = getServerConfig();

  return <ConfigClient initialConfig={config} />;
}
