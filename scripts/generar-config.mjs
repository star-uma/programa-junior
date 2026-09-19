// Escribe js/config.js de la web publicada con las variables del repositorio
// SUPABASE_URL y SUPABASE_ANON_KEY (Settings → Secrets and variables → Actions → Variables).
// Así el repositorio no lleva la configuración y en local la app arranca en modo demo.
// Uso:  node scripts/generar-config.mjs <ruta de config.js>
import { readFile, writeFile } from 'node:fs/promises';

const destino = process.argv[2] ?? 'js/config.js';
const urlBruta = (process.env.SUPABASE_URL ?? '').trim();
const clave = (process.env.SUPABASE_ANON_KEY ?? '').trim();

if (urlBruta && clave) {
  let url;
  try {
    url = new URL(urlBruta);
  } catch {
    console.error(`✗ SUPABASE_URL no es una URL válida: «${urlBruta}»`);
    process.exit(1);
  }
  if (url.protocol !== 'https:' || url.hostname.endsWith('supabase.com')) {
    console.error(`✗ SUPABASE_URL debe ser la "Project URL" (https://xxxx.supabase.co), no «${urlBruta}»`);
    process.exit(1);
  }
  // Solo vale la raíz del proyecto: una ruta como /rest/v1/ rompe el inicio de sesión.
  if (url.pathname !== '/' || url.search) {
    console.log(`::warning title=SUPABASE_URL corregida::Se ha quitado «${url.pathname}${url.search}» de la variable SUPABASE_URL. Pon solo ${url.origin}`);
  }
  url = url.origin;
  await writeFile(destino, [
    '// Generado automáticamente por GitHub Actions al publicar. No editar.',
    `export const SUPABASE_URL = ${JSON.stringify(url)};`,
    `export const SUPABASE_ANON_KEY = ${JSON.stringify(clave)};`,
    '',
  ].join('\n'));
  console.log(`✓ Supabase configurado (${url})`);
} else if (/SUPABASE_URL = '[^']+'/.test(await readFile(destino, 'utf8'))) {
  console.log('ℹ Sin variables en el repositorio: se usa la configuración de js/config.js');
} else {
  // Anotación visible en el resumen de la ejecución en GitHub.
  console.log('::warning title=Web en modo demo::Faltan las variables SUPABASE_URL y SUPABASE_ANON_KEY del repositorio. La web se publica en modo demo (sin cuentas reales).');
}
