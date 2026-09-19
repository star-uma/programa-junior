// Configuración de Supabase (Project Settings → API).
// La clave pública ("anon" o "publishable") lo es por diseño: la seguridad la ponen
// las políticas RLS de supabase/schema.sql, no el secreto de esta clave.
// Nunca pongas aquí la clave "service_role" / "secret".
//
// Si se dejan vacías, la app arranca en MODO DEMO: datos de ejemplo guardados
// solo en este navegador, sin contraseñas, para probar la app sin backend.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
