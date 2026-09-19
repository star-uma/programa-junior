// Lista del equipo: tarjetas de juniors con su rango y su camino a Senior.
import { evaluar } from '../model.js';
import { estado, soyYo } from '../estado.js';
import { esc, icon, avatar, fecha, pct, barra } from '../ui.js';

export async function vistaEquipo(main) {
  const { store, programa } = estado;
  const filas = await store.progreso();
  const juniors = estado.perfiles.filter((p) => p.rol === 'junior');
  const seniors = estado.perfiles.filter((p) => p.rol === 'senior');
  const evs = juniors
    .map((p) => evaluar(programa, p, {
      tareas: filas.tareas.filter((r) => r.junior_id === p.id),
      hitos: filas.hitos.filter((r) => r.junior_id === p.id),
    }, { conFechas: false }))
    .sort((a, b) => a.perfil.nombre.localeCompare(b.perfil.nombre, 'es'));

  const departamentos = [...new Set(juniors.map((p) => p.departamento).filter(Boolean))].sort();

  main.innerHTML = `
    <header class="pagina-cabecera">
      <p class="sobretitulo">Equipo</p>
      <h1>Juniors</h1>
      ${departamentos.length > 1 ? `<div class="filtros" role="group" aria-label="Filtrar por departamento">
        <button class="filtro" aria-pressed="true" data-filtro="">Todos</button>
        ${departamentos.map((s) => `<button class="filtro" aria-pressed="false" data-filtro="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>` : ''}
    </header>

    ${evs.length ? `<div class="juniors">${evs.map(tarjeta).join('')}</div>`
      : `<section class="tarjeta vacio">${icon('users')}<p>Todavía no hay juniors registrados.</p></section>`}

    ${seniors.length ? `
    <section class="bloque">
      <header class="bloque__cabecera"><h2>Seniors</h2><p class="meta">Pueden validar tareas y otorgar hitos</p></header>
      <ul class="seniors">${seniors.map((p) => `<li>${avatar(p, 'avatar--s')}<span>${esc(p.nombre)}<span class="meta">${esc(p.departamento ?? '')}</span></span></li>`).join('')}</ul>
    </section>` : ''}`;

  main.onclick = (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    main.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    main.querySelectorAll('.junior').forEach((c) => { c.hidden = !!b.dataset.filtro && c.dataset.departamento !== b.dataset.filtro; });
  };
}

function tarjeta(ev) {
  const p = ev.perfil;
  const conseguidos = ev.hitos.filter((h) => h.estado === 'conseguido').length;
  return `
  <a class="junior tarjeta" href="#/junior/${esc(p.id)}" data-departamento="${esc(p.departamento ?? '')}">
    <span class="junior__cabeza">
      ${avatar(p, 'avatar--l')}
      <span>
        <strong>${esc(p.nombre)}${soyYo(p.id) ? ' <span class="chip chip--acento">Tú</span>' : ''}</strong>
        <span class="meta">${esc(p.departamento ?? 'Sin departamento')} · desde ${fecha(p.fecha_ingreso)}</span>
      </span>
    </span>
    <span class="junior__datos">
      <span class="rango rango--peq"><span class="rango__num">${ev.rango.numero}</span><span><strong>${esc(ev.rango.nombre)}</strong><span class="meta">${ev.xp} XP</span></span></span>
      <span class="junior__hitos">${icon('award')}${conseguidos} ${conseguidos === 1 ? 'hito' : 'hitos'}</span>
    </span>
    <span class="junior__senior">
      <span class="meta">Camino a Senior</span><span class="junior__pct">${pct(ev.senior.progreso)}</span>
      ${barra(ev.senior.progreso, { cls: 'barra--rosa' })}
    </span>
  </a>`;
}
