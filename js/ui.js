// Utilidades de interfaz: escape de HTML, iconos, fechas, diálogos, avisos y tooltips.

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = (nombre, cls = '') => `<i data-lucide="${esc(nombre)}" class="ico ${cls}" aria-hidden="true"></i>`;

export const pintarIconos = () => window.lucide?.createIcons({ attrs: { 'stroke-width': 2 } });

export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const aFecha = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const FMT_LARGO = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const FMT_MES = new Intl.DateTimeFormat('es-ES', { month: 'short' });
export const fecha = (iso) => (iso ? FMT_LARGO.format(aFecha(iso)).replace('.', '') : '');
export const mesCorto = (d) => FMT_MES.format(d).replace('.', '');
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);
export { aFecha };

export function hace(iso) {
  const d = diasEntre(iso.slice(0, 10), hoy());
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  const m = Math.round(d / 30);
  return m < 12 ? `hace ${m} ${m === 1 ? 'mes' : 'meses'}` : `hace ${Math.round(m / 12)} ${m < 18 ? 'año' : 'años'}`;
}

export const iniciales = (nombre) =>
  String(nombre).trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

export const avatar = (perfil, cls = '') =>
  `<span class="avatar ${cls}" aria-hidden="true">${esc(iniciales(perfil?.nombre ?? '?'))}</span>`;

export const pct = (x) => `${Math.round(x * 100)} %`;

// Barra de progreso simple: relleno y pista del mismo tono.
export const barra = (fraccion, { cls = '', etiqueta = '' } = {}) => {
  const v = Math.max(0, Math.min(1, fraccion));
  return `<span class="barra ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}"${etiqueta ? ` aria-label="${esc(etiqueta)}"` : ''}><span class="barra__relleno" style="width:${(v * 100).toFixed(1)}%"></span></span>`;
};

// --- Avisos (toasts) ------------------------------------------------------------------
export function aviso(texto, tipo = 'ok') {
  let zona = document.getElementById('avisos');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'avisos';
    zona.setAttribute('role', 'status');
    zona.setAttribute('aria-live', 'polite');
    document.body.append(zona);
  }
  const el = document.createElement('div');
  el.className = `aviso aviso--${tipo}`;
  el.innerHTML = `${icon(tipo === 'error' ? 'circle-alert' : 'circle-check')}<span>${esc(texto)}</span>`;
  zona.append(el);
  pintarIconos();
  setTimeout(() => el.classList.add('aviso--fuera'), 3200);
  setTimeout(() => el.remove(), 3600);
}

// --- Diálogo modal ----------------------------------------------------------------------
// acciones: [{ id, texto, tipo: 'primario'|'peligro'|'', icono }]
// Devuelve { accion, datos } o null si se cancela. Si `alEnviar` lanza un error, el
// diálogo sigue abierto y muestra el mensaje.
export function dialogo({ titulo, cuerpo, acciones = [], alEnviar = null, ancho = '' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `dialogo ${ancho}`;
    dlg.innerHTML = `
      <form method="dialog" class="dialogo__form">
        <header class="dialogo__cabecera">
          <h2>${titulo}</h2>
          <button type="button" class="boton-icono" data-cerrar aria-label="Cerrar">${icon('x')}</button>
        </header>
        <div class="dialogo__cuerpo">${cuerpo}</div>
        <p class="dialogo__error" hidden></p>
        ${acciones.length ? `<footer class="dialogo__pie">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          ${acciones.map((a) => `<button type="submit" value="${esc(a.id)}" class="boton ${a.tipo ? `boton--${a.tipo}` : ''}">${a.icono ? icon(a.icono) : ''}${esc(a.texto)}</button>`).join('')}
        </footer>` : ''}
      </form>`;
    document.body.append(dlg);
    pintarIconos();

    // Se resuelve directamente al cerrar, sin depender del evento 'close' (que el navegador
    // puede retrasar en pestañas en segundo plano).
    let terminado = false;
    const terminar = (resultado) => {
      if (terminado) return;
      terminado = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      resolve(resultado);
    };
    const cerrar = () => terminar(null);
    dlg.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) cerrar(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
    dlg.addEventListener('close', cerrar);

    const form = dlg.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const accion = e.submitter?.value ?? acciones[0]?.id;
      const datos = Object.fromEntries(new FormData(form));
      const err = dlg.querySelector('.dialogo__error');
      if (alEnviar) {
        const botones = form.querySelectorAll('button');
        botones.forEach((b) => (b.disabled = true));
        try {
          await alEnviar(accion, datos);
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
          botones.forEach((b) => (b.disabled = false));
          return;
        }
      }
      terminar({ accion, datos });
    });

    dlg.showModal();
    dlg.querySelector('input:not([type=hidden]), textarea, select')?.focus();
  });
}

export const confirmar = (titulo, texto, { boton = 'Confirmar', tipo = 'peligro' } = {}) =>
  dialogo({ titulo, cuerpo: `<p>${texto}</p>`, acciones: [{ id: 'ok', texto: boton, tipo }] }).then((r) => r?.accion === 'ok');

// --- Tooltips ---------------------------------------------------------------------------
// Cualquier elemento con data-tip="texto" (admite saltos de línea con \n) muestra un tooltip
// al pasar el ratón o al recibir el foco del teclado.
let tip = null;
let actual = null;

// Muestra un tooltip con `texto` (primera línea en negrita) en coordenadas de ventana.
export function mostrarTip(texto, x, y, origen = null) {
  actual = origen;
  const [cabeza, ...resto] = texto.split('\n');
  tip.innerHTML = `<strong>${esc(cabeza)}</strong>${resto.map((l) => `<span>${esc(l)}</span>`).join('')}`;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const px = Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8);
  const py = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
  tip.style.transform = `translate(${px}px, ${py}px)`;
}

export function ocultarTip() {
  actual = null;
  if (tip) tip.hidden = true;
}

export function activarTooltips() {
  tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  const mostrar = (el, x, y) => mostrarTip(el.dataset.tip, x, y, el);
  const ocultar = ocultarTip;

  document.addEventListener('pointermove', (e) => {
    if (e.target.closest?.('[data-tip-propio]')) return;
    const el = e.target.closest?.('[data-tip]');
    if (el) mostrar(el, e.clientX, e.clientY);
    else if (actual) ocultar();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    mostrar(el, r.left + r.width / 2, r.top);
  });
  document.addEventListener('focusout', ocultar);
  document.addEventListener('scroll', ocultar, true);
}
