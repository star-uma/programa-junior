// Punto de entrada: carga el programa, elige el almacén (demo o Supabase), gestiona la
// sesión y enruta entre vistas con el hash de la URL (#/yo, #/junior/<id>, #/panel...).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { Programa } from './model.js';
import { estado, cargarPerfiles, soySenior } from './estado.js';
import { esc, icon, avatar, activarTooltips, pintarIconos, confirmar, aviso } from './ui.js';
import { crearStoreDemo } from './store/demo.js';
import { vistaPerfil } from './views/perfil.js';
import { vistaPanel } from './views/panel.js';
import { vistaEquipo } from './views/equipo.js';
import { vistaPrograma } from './views/programa.js';
import { vistaAcceso, pedirNuevaPassword } from './views/acceso.js';

const main = document.getElementById('main');

async function iniciar() {
  aplicarTemaGuardado();
  activarTooltips();
  try {
    const res = await fetch('data/programa.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`No se pudo cargar data/programa.json (${res.status})`);
    estado.programa = new Programa(await res.json());
    const avisos = estado.programa.validar();
    if (avisos.length) console.warn('Revisa data/programa.json:\n' + avisos.join('\n'));

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const { crearStoreSupabase } = await import('./store/supabase.js');
      estado.store = crearStoreSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      estado.store = crearStoreDemo();
    }
    await estado.store.init();
  } catch (e) {
    return fallo(e);
  }

  estado.refrescar = () => pintar({ conservarScroll: true });
  estado.store.onCambio(async (tipo) => {
    if (tipo === 'recuperacion') return pedirNuevaPassword();
    const antes = estado.sesion?.userId;
    await cargarSesion();
    if (estado.sesion?.userId === antes) return;
    const destino = rutaInicial();
    if (location.hash !== destino) location.hash = destino; // hashchange vuelve a pintar
    else pintar();
  });
  window.addEventListener('hashchange', () => pintar());

  await cargarSesion();
  pintar();
}

async function cargarSesion() {
  estado.sesion = await estado.store.sesion();
  if (estado.sesion) await cargarPerfiles();
}

const rutaInicial = () => (!estado.sesion ? '#/' : soySenior() ? '#/panel' : '#/yo');

function ruta() {
  const h = location.hash.startsWith('#/') ? location.hash.slice(2) : '';
  const [vista = '', id = ''] = h.split('/').map(decodeURIComponent);
  return { vista, id };
}

let pintando = 0;
async function pintar({ conservarScroll = false } = {}) {
  const turno = ++pintando;
  const scroll = window.scrollY;
  const abiertos = [...main.querySelectorAll('details[open][data-clave]')].map((d) => d.dataset.clave);
  if (conservarScroll) await cargarSesion();

  let { vista, id } = ruta();
  if (!estado.sesion && vista !== 'programa') vista = 'acceso';
  if (estado.sesion && (vista === '' || vista === 'acceso')) {
    location.replace(rutaInicial());
    return;
  }
  if (vista === 'panel' && !soySenior()) vista = 'yo';

  pintarCabecera(vista);
  main.setAttribute('aria-busy', 'true');
  try {
    if (vista === 'acceso') vistaAcceso(main);
    else if (vista === 'programa') vistaPrograma(main);
    else if (vista === 'panel') await vistaPanel(main);
    else if (vista === 'juniors') await vistaEquipo(main);
    else if (vista === 'junior') await vistaPerfil(main, id);
    else await vistaPerfil(main, estado.sesion.userId);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<section class="tarjeta vacio">${icon('triangle-alert')}<h1>Algo ha fallado</h1><p class="meta">${esc(e.message)}</p></section>`;
  }
  if (turno !== pintando) return;
  main.removeAttribute('aria-busy');
  abiertos.forEach((k) => main.querySelector(`details[data-clave="${CSS.escape(k)}"]`)?.setAttribute('open', ''));
  pintarIconos();
  window.scrollTo(0, conservarScroll ? scroll : 0);
}

function pintarCabecera(vista) {
  const s = estado.sesion;
  const enlaces = !s ? [['programa', 'Programa', 'book-open']]
    : soySenior()
      ? [['panel', 'Panel', 'layout-dashboard'], ['juniors', 'Juniors', 'users'], ['programa', 'Programa', 'book-open']]
      : [['yo', 'Mi progreso', 'radar'], ['juniors', 'Equipo', 'users'], ['programa', 'Programa', 'book-open']];
  const activa = vista === 'junior' && s && ruta().id === s.userId ? 'yo' : vista === 'junior' ? 'juniors' : vista;

  document.getElementById('nav').innerHTML = enlaces.map(([r, texto, ico]) =>
    `<a href="#/${r}" ${activa === r ? 'aria-current="page"' : ''}>${icon(ico)}<span>${texto}</span></a>`).join('');

  const demo = estado.store.modo === 'demo';
  document.getElementById('usuario').innerHTML = `
    <button class="boton-icono" data-accion="tema" aria-label="Cambiar tema claro/oscuro">${icon('sun-moon')}</button>
    ${s ? `
      <span class="usuario">${avatar(s.perfil, 'avatar--s')}<span class="usuario__texto"><strong>${esc(s.perfil.nombre)}</strong><span>${s.perfil.rol === 'senior' ? 'Senior' : 'Junior'}</span></span></span>
      <button class="boton boton--oscuro boton--peq" data-accion="salir">${icon(demo ? 'repeat' : 'log-out')}<span>${demo ? 'Cambiar' : 'Salir'}</span></button>` : ''}`;

  document.getElementById('banda-demo').innerHTML = demo ? `
    <div class="banda-demo">${icon('flask-conical')}<span><strong>Modo demo</strong><span class="solo-ancho"> · datos de ejemplo guardados solo en este navegador.</span></span>
      <button class="enlace" data-accion="restablecer">Restablecer datos</button></div>` : '';
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('header [data-accion], #banda-demo [data-accion]');
  if (!b) return;
  const accion = b.dataset.accion;
  if (accion === 'tema') alternarTema();
  if (accion === 'salir') await estado.store.salir();
  if (accion === 'restablecer' && (await confirmar('Restablecer demo', 'Se borrarán los cambios que hayas hecho y se cargarán los datos de ejemplo.', { boton: 'Restablecer' }))) {
    await estado.store.restablecer();
    aviso('Datos de ejemplo restablecidos');
    await pintar();
  }
});

// --- Tema claro / oscuro --------------------------------------------------------------------------
function aplicarTemaGuardado() {
  try {
    const t = localStorage.getItem('star-jr-tema');
    if (t) document.documentElement.dataset.theme = t;
  } catch { /* sin almacenamiento: se usa el tema del sistema */ }
}

function alternarTema() {
  const oscuroAhora = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const nuevo = oscuroAhora ? 'light' : 'dark';
  document.documentElement.dataset.theme = nuevo;
  try { localStorage.setItem('star-jr-tema', nuevo); } catch { /* no pasa nada */ }
}

function fallo(e) {
  console.error(e);
  const local = location.protocol === 'file:';
  main.innerHTML = `<section class="tarjeta vacio">${icon('plug-zap')}<h1>No se pudo iniciar la aplicación</h1>
    <p class="meta">${esc(e.message)}</p>
    ${local ? '<p>Estás abriendo el archivo directamente. Arranca un servidor local: <code>powershell -ExecutionPolicy Bypass -File serve.ps1</code> y abre <code>http://localhost:8080</code>.</p>' : ''}</section>`;
  pintarIconos();
}

iniciar();
