/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Where the globe's images are served; defaults to /moon/ beside the page. */
  readonly VITE_MOON_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
