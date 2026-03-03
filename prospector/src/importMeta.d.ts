interface ImportMetaEnv {
  readonly PROD: boolean
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.png' {
  const value: string;
  export default value;
}
