// Escribe js/config.js de la web publicada con las variables del repositorio
// SUPABASE_URL y SUPABASE_ANON_KEY (Settings → Secrets and variables → Actions → Variables).
// Así el repositorio no lleva la configuración y en local la app arranca en modo demo.
// Uso:  node scripts/generar-config.mjs <ruta de config.js>
import { readFile, writeFile } from 'node:fs/promises';

const destino = process.argv[2] ?? 'js/config.js';
const url = (process.env.SUPABASE_URL ?? '').trim();
const clave = (process.env.SUPABASE_ANON_KEY ?? '').trim();

if (url && clave) {
  if (!/^https:\/\/\S+$/.test(url)) {
    console.error(`✗ SUPABASE_URL no parece una URL válida: «${url}»`);
    process.exit(1);
  }
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
