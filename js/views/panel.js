// Panel de seniors: solicitudes pendientes, hitos listos para otorgar y matriz de habilidades.
import { evaluar } from '../model.js';
import { estado } from '../estado.js';
import { esc, icon, avatar, fecha, hace, hoy, pct, barra, aviso, confirmar } from '../ui.js';

export async function vistaPanel(main) {
  const { store, programa } = estado;
  const juniors = estado.perfiles.filter((p) => p.rol === 'junior');
  const [filas, sols] = await Promise.all([store.progreso(), store.solicitudes()]);

  const evs = juniors.map((p) => evaluar(programa, p, {
    tareas: filas.tareas.filter((r) => r.junior_id === p.id),
    hitos: filas.hitos.filter((r) => r.junior_id === p.id),
  }));
  const solPendiente = new Set(sols.map((s) => `${s.junior_id}:${s.tipo}:${s.item_id}`));
  const listos = evs.flatMap((ev) => ev.hitos
    .filter((h) => h.estado === 'listo' && !solPendiente.has(`${ev.perfil.id}:hito:${h.id}`))
    .map((h) => ({ ev, h })));
  const paraSenior = evs.filter((ev) => ev.senior.estado === 'listo');
  const pendientes = sols.filter((s) => estado.perfilPorId.get(s.junior_id)?.rol === 'junior');

  main.innerHTML = `
    <header class="pagina-cabecera">
      <p class="sobretitulo">Seniors</p>
      <h1>Panel de validación</h1>
    </header>

    <div class="kpis">
      ${kpi('Juniors', juniors.length, 'users')}
      ${kpi('Solicitudes pendientes', pendientes.length, 'inbox', pendientes.length ? 'acento' : '')}
      ${kpi('Hitos listos para otorgar', listos.length, 'sparkles')}
      ${kpi('Listos para Senior', paraSenior.length, 'party-popper', paraSenior.length ? 'rosa' : '')}
    </div>

    <section class="tarjeta">
      <header class="tarjeta__cabecera"><h2>Solicitudes pendientes</h2><p class="meta">Los juniors las envían desde su perfil</p></header>
      ${pendientes.length ? `<ul class="solicitudes">${pendientes.map(filaSolicitud).join('')}</ul>`
        : `<p class="vacio-linea">${icon('inbox')}No hay solicitudes pendientes.</p>`}
    </section>

    ${listos.length || paraSenior.length ? `
    <section class="tarjeta">
      <header class="tarjeta__cabecera"><h2>Listos para otorgar</h2><p class="meta">Cumplen los requisitos pero nadie lo ha solicitado aún</p></header>
      <ul class="solicitudes">
        ${paraSenior.map((ev) => `
          <li class="solicitud-fila">
            ${avatar(ev.perfil)}
            <div class="solicitud-fila__texto">
              <a href="#/junior/${esc(ev.perfil.id)}"><strong>${esc(ev.perfil.nombre)}</strong></a>
              <span>${icon('party-popper')} Cumple todos los requisitos para <strong>Senior</strong></span>
            </div>
            <a class="boton boton--rosa boton--peq" href="#/junior/${esc(ev.perfil.id)}">Revisar perfil</a>
          </li>`).join('')}
        ${listos.map(({ ev, h }) => `
          <li class="solicitud-fila">
            ${avatar(ev.perfil)}
            <div class="solicitud-fila__texto">
              <a href="#/junior/${esc(ev.perfil.id)}"><strong>${esc(ev.perfil.nombre)}</strong></a>
              <span>${icon(h.def.icono)} Hito: ${esc(h.def.nombre)}</span>
            </div>
            <button class="boton boton--peq" data-accion="otorgar" data-junior="${esc(ev.perfil.id)}" data-id="${esc(h.id)}">${icon('award')}Otorgar</button>
          </li>`).join('')}
      </ul>
    </section>` : ''}

    <section class="tarjeta">
      <header class="tarjeta__cabecera">
        <h2>Matriz de habilidades</h2>
        <ul class="leyenda leyenda--niveles" aria-label="Leyenda de niveles">
          ${[0, 1, 2, 3].map((n) => `<li><span class="celda-muestra nv-${n}"></span>${esc(programa.nombreNivel(n))}</li>`).join('')}
        </ul>
      </header>
      ${juniors.length ? matriz(evs) : '<p class="meta">Aún no hay juniors registrados.</p>'}
    </section>`;

  main.onclick = async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const { accion, junior, id, sol } = b.dataset;
    b.disabled = true;
    try {
      if (accion === 'aprobar') {
        const s = pendientes.find((x) => x.id === Number(sol));
        if (s.tipo === 'tarea') await store.validarTarea(s.junior_id, s.item_id, { fecha: hoy(), nota: null });
        else await store.otorgarHito(s.junior_id, s.item_id, { fecha: hoy(), nota: null });
        aviso(s.tipo === 'tarea' ? 'Tarea validada' : 'Hito otorgado');
      } else if (accion === 'rechazar') {
        if (!(await confirmar('Rechazar solicitud', 'La solicitud se borrará. Explícale al junior en persona qué le falta.', { boton: 'Rechazar' }))) { b.disabled = false; return; }
        await store.borrarSolicitud(Number(sol));
        aviso('Solicitud rechazada');
      } else if (accion === 'otorgar') {
        await store.otorgarHito(junior, id, { fecha: hoy(), nota: null });
        aviso('Hito otorgado');
      }
      await estado.refrescar();
    } catch (err) {
      aviso(err.message, 'error');
      b.disabled = false;
    }
  };
}

const kpi = (etiqueta, valor, ico, tono = '') => `
  <div class="kpi tarjeta ${tono ? `kpi--${tono}` : ''}">
    <span class="kpi__ico">${icon(ico)}</span>
    <span class="kpi__valor">${valor}</span>
    <span class="kpi__etiqueta">${esc(etiqueta)}</span>
  </div>`;

function filaSolicitud(s) {
  const { programa } = estado;
  const junior = estado.perfilPorId.get(s.junior_id);
  let que;
  if (s.tipo === 'tarea') {
    const t = programa.tareas.get(s.item_id);
    const h = t && programa.habilidadPorId.get(t.habilidad);
    que = t ? `${icon(h.icono)} ${esc(t.nombre)} <span class="meta">${esc(h.nombre)} · Nivel ${t.nivel}</span>` : `Tarea desconocida (${esc(s.item_id)})`;
  } else {
    const h = programa.hitoPorId.get(s.item_id);
    que = h ? `${icon(h.icono)} Hito: ${esc(h.nombre)}` : `Hito desconocido (${esc(s.item_id)})`;
  }
  return `
  <li class="solicitud-fila">
    ${avatar(junior)}
    <div class="solicitud-fila__texto">
      <span><a href="#/junior/${esc(s.junior_id)}"><strong>${esc(junior?.nombre ?? '¿?')}</strong></a> <span class="meta">· ${hace(s.created_at)}</span></span>
      <span>${que}</span>
      ${s.mensaje ? `<span class="cita cita--linea">«${esc(s.mensaje)}»</span>` : ''}
    </div>
    <span class="solicitud-fila__acciones">
      <button class="boton boton--sutil boton--peq" data-accion="rechazar" data-sol="${s.id}">Rechazar</button>
      <button class="boton boton--primario boton--peq" data-accion="aprobar" data-sol="${s.id}">${icon('check')}${s.tipo === 'tarea' ? 'Validar' : 'Otorgar'}</button>
    </span>
  </li>`;
}

function matriz(evs) {
  const { programa } = estado;
  const ordenados = [...evs].sort((a, b) => b.senior.progreso - a.senior.progreso);
  return `
  <div class="tabla-scroll">
    <table class="tabla matriz">
      <thead><tr>
        <th scope="col">Junior</th>
        ${programa.habilidades.map((h) => `<th scope="col" class="matriz__hab" title="${esc(h.nombre)}">${icon(h.icono)}<span>${esc(h.nombre)}</span></th>`).join('')}
        <th scope="col" class="num">XP</th>
        <th scope="col">Camino a Senior</th>
      </tr></thead>
      <tbody>${ordenados.map((ev) => `
        <tr>
          <th scope="row"><a class="matriz__nombre" href="#/junior/${esc(ev.perfil.id)}">${avatar(ev.perfil, 'avatar--s')}<span>${esc(ev.perfil.nombre)}<span class="meta">${esc(ev.perfil.departamento ?? '')} · desde ${fecha(ev.perfil.fecha_ingreso)}</span></span></a></th>
          ${ev.habilidades.map((h) => `<td class="celda nv-${h.nivel}" data-tip="${esc(`${ev.perfil.nombre} · ${h.habilidad.nombre}\nNivel ${h.nivel} · ${programa.nombreNivel(h.nivel)}\n${h.hechas} de ${h.total} tareas`)}">${h.nivel}</td>`).join('')}
          <td class="num">${ev.xp}</td>
          <td class="matriz__senior">${barra(ev.senior.progreso, { cls: 'barra--rosa' })}<span>${pct(ev.senior.progreso)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
