declare module 'https://esm.sh/@supabase/supabase-js@2.89.0' {
  export * from '@supabase/supabase-js'
}

declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}
