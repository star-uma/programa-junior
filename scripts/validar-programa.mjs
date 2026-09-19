// Comprueba que data/programa.json y data/demo.json son JSON válido y coherente
// (ids que existen, sin duplicados, requisitos bien escritos...).
// Lo ejecuta GitHub Actions antes de publicar; si falla, la web no se actualiza.
// En local:  node scripts/validar-programa.mjs
import { readFile } from 'node:fs/promises';
import { Programa, filasHuerfanas } from '../js/model.js';

async function leerJson(ruta) {
  try {
    return JSON.parse(await readFile(new URL(`../${ruta}`, import.meta.url), 'utf8'));
  } catch (e) {
    console.error(`✗ ${ruta} no es un JSON válido: ${e.message}`);
    process.exit(1);
  }
}

const raw = await leerJson('data/programa.json');
let programa;
try {
  programa = new Programa(raw);
} catch (e) {
  console.error(`✗ data/programa.json tiene una estructura inesperada: ${e.message}`);
  process.exit(1);
}

const errores = programa.validar();

const demo = await leerJson('data/demo.json');
const filas = {
  tareas: demo.tareas.map(([, tarea_id]) => ({ tarea_id })),
  hitos: demo.hitos.map(([, hito_id]) => ({ hito_id })),
};
for (const a of filasHuerfanas(programa, filas)) errores.push(`data/demo.json usa la ${a}, que no existe en el programa`);

if (errores.length) {
  console.error(`✗ Hay ${errores.length} ${errores.length === 1 ? 'error' : 'errores'} en el programa:`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✓ Programa correcto: ${programa.habilidades.length} habilidades, ${programa.tareas.size} tareas y ${programa.hitos.length} hitos.`);
