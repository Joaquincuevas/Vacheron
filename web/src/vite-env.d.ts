/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origen del Worker. Vacío en desarrollo: Vite proxea /api a :8787. */
  readonly VITE_API_BASE?: string;
  /** Token compartido. Viaja en el bundle — ver la nota de seguridad del README. */
  readonly VITE_APP_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
