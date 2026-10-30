import type { UserConfig } from "vite";
import { apiDevPlugin } from "./vite-plugin";

// spec-5 A3
export const devConfig: UserConfig = {
  plugins: [apiDevPlugin()],
  server: { host: true }, // escuta em 0.0.0.0: abre pelo IP local da máquina (celular na mesma rede)
};
