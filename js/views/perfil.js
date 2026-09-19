// Vista de perfil: el progreso de un junior. La ve el propio junior (y puede pedir
// validaciones), el resto del equipo (solo lectura) y los seniors (que validan).
import { evaluar, actividad, proximosObjetivos, ETIQUETA_ESTADO } from '../model.js';
import { estado, soySenior, soyYo, nombreDe } from '../estado.js';
import { radar, segmentos, graficaXP } from '../charts.js';
import { esc, icon, avatar, fecha, hace, hoy, pct, barra, dialogo, confirmar, aviso, pintarIconos } from '../ui.js';

const ICONO_ESTADO = { conseguido: 'circle-check', listo: 'sparkles', abierto: 'circle-dashed', bloqueado: 'lock' };

export async function vistaPerfil(main, id) {
  const { store, programa } = estado;
  const perfil = estado.perfilPorId.get(id);
  if (!perfil) {
    main.innerHTML = `<section class="tarjeta vacio">${icon('user-x')}<h1>No encontramos este perfil</h1><p><a href="#/juniors">Volver al equipo</a></p></section>`;
    return;
  }

  const verSolicitudes = soySenior() || soyYo(id);
  const [filas, sols] = await Promise.all([store.progreso(id), verSolicitudes ? store.solicitudes(id) : []]);
  const ev = evaluar(programa, perfil, filas);
  const ctx = {
    perfil,
    ev,
    eventos: actividad(programa, ev),
    sol: new Map(sols.map((s) => [`${s.tipo}:${s.item_id}`, s])),
    puedoValidar: soySenior() && !soyYo(id),
    esMio: soyYo(id) && perfil.rol === 'junior',
  };
  const xp = graficaXP(ctx.eventos, perfil.fecha_ingreso);

  main.innerHTML = `
    ${cabecera(ctx)}
    ${avisos(ctx)}
    <div class="rejilla rejilla--2">
      ${tarjetaRadar(ctx)}
      ${tarjetaSenior(ctx)}
    </div>
    ${bloqueHitos(ctx)}
    ${bloqueHabilidades(ctx)}
    <div class="rejilla rejilla--2-1">
      <section class="tarjeta">
        <header class="tarjeta__cabecera"><h2>XP acumulada</h2><p class="meta">Cada tarea validada y cada hito suman XP</p></header>
        ${xp.html}
      </section>
      ${tarjetaActividad(ctx)}
    </div>`;

  xp.montar(main);
  main.onclick = (e) => {
    const b = e.target.closest('[data-accion]');
    if (b) acciones[b.dataset.accion]?.(ctx, b.dataset, b);
  };
}

// --- Cabecera ------------------------------------------------------------------------------
function cabecera({ perfil, ev, puedoValidar, esMio }) {
  const { rango } = ev;
  const mentor = perfil.mentor_id ? nombreDe(perfil.mentor_id) : null;
  const esSenior = perfil.rol === 'senior';
  const cumplidos = ev.senior.requisitos.filter((r) => r.met).length;
  const total = ev.senior.requisitos.length;
  const progresoSenior = esSenior ? 1 : ev.senior.progreso;

  return `
  <section class="tarjeta cabecera-perfil">
    <div class="cabecera-perfil__id">
      ${avatar(perfil, 'avatar--xl')}
      <div>
        <p class="sobretitulo">${esSenior ? 'Senior' : 'Junior'}${perfil.departamento ? ` · ${esc(perfil.departamento)}` : ''}</p>
        <h1>${esc(perfil.nombre)}</h1>
        <p class="meta">En el equipo desde ${fecha(perfil.fecha_ingreso)}${mentor ? ` · Mentor: ${esc(mentor)}` : ''}</p>
      </div>
      ${esMio || puedoValidar ? `<button class="boton boton--sutil" data-accion="editar-perfil">${icon('pencil')}Editar</button>` : ''}
    </div>

    <div class="cabecera-perfil__rango">
      <p class="etiqueta">Rango</p>
      <p class="rango"><span class="rango__num">${rango.numero}</span><span><strong>${esc(rango.nombre)}</strong><span class="meta">${ev.xp} XP</span></span></p>
      ${barra(rango.progreso, { etiqueta: 'Progreso al siguiente rango' })}
      <p class="meta">${rango.siguiente ? `${rango.siguiente.xp - ev.xp} XP para <strong>${esc(rango.siguiente.nombre)}</strong>` : 'Rango máximo alcanzado'}</p>
    </div>

    <div class="cabecera-perfil__senior">
      <p class="etiqueta">Camino a Senior</p>
      <p class="cifra">${esSenior ? icon('badge-check', 'cifra__ico') + 'Senior' : pct(progresoSenior)}</p>
      ${barra(progresoSenior, { cls: 'barra--rosa', etiqueta: 'Progreso hacia Senior' })}
      <p class="meta">${esSenior ? `Desde ${fecha(perfil.senior_desde)}` : `${cumplidos} de ${total} requisitos cumplidos`}</p>
    </div>
  </section>`;
}

// --- Avisos de acción ------------------------------------------------------------------------
function avisos({ ev, sol, esMio, puedoValidar, perfil }) {
  const out = [];
  if (esMio) {
    const listos = ev.hitos.filter((h) => h.estado === 'listo' && !sol.has(`hito:${h.id}`));
    if (ev.senior.estado === 'listo') {
      out.push(banda('rosa', 'party-popper', '<strong>¡Cumples todos los requisitos para ser Senior!</strong> Habla con coordinación para tu ascenso.'));
    }
    if (listos.length) {
      out.push(banda('acento', 'sparkles', `<strong>Tienes ${listos.length === 1 ? 'un hito listo' : `${listos.length} hitos listos`} para solicitar:</strong> ${listos.map((h) => `<button class="enlace" data-accion="hito" data-id="${h.id}">${esc(h.def.nombre)}</button>`).join(', ')}`));
    }
    if (!ev.tareas.size && !sol.size) {
      out.push(banda('neutro', 'info', '<strong>¿Por dónde empiezo?</strong> Haz una tarea con un senior y pulsa <em>Solicitar validación</em> en ella. Cuando la valide, sumarás XP.'));
    }
  }
  if (puedoValidar) {
    if (sol.size) {
      out.push(banda('acento', 'inbox', `<strong>${sol.size === 1 ? 'Una solicitud pendiente' : `${sol.size} solicitudes pendientes`}</strong> de ${esc(perfil.nombre)}. Están marcadas abajo.`));
    }
    if (ev.senior.estado === 'listo') {
      out.push(banda('rosa', 'party-popper', `<strong>Cumple todos los requisitos para ser Senior.</strong> <button class="boton boton--rosa boton--peq" data-accion="ascender">${icon('arrow-big-up-dash')}Ascender a Senior</button>`));
    }
  }
  return out.join('');
}

const banda = (tono, ico, html) => `<div class="banda banda--${tono}">${icon(ico)}<p>${html}</p></div>`;

// --- Radar ----------------------------------------------------------------------------------------
function tarjetaRadar({ ev }) {
  const { programa } = estado;
  const minimos = programa.minimosSenior();
  return `
  <section class="tarjeta">
    <header class="tarjeta__cabecera">
      <h2>Perfil de habilidades</h2>
      <button class="boton boton--sutil boton--peq" data-accion="alternar-tabla" aria-pressed="false">${icon('table')}Ver tabla</button>
    </header>
    <ul class="leyenda">
      <li><span class="leyenda__muestra leyenda__muestra--tu"></span>Tu nivel</li>
      <li><span class="leyenda__muestra leyenda__muestra--ref"></span>Mínimo para Senior</li>
    </ul>
    <div class="radar-caja">${radar(ev, programa)}</div>
    <table class="tabla tabla--compacta" hidden>
      <thead><tr><th>Habilidad</th><th>Nivel</th><th class="num">Tareas</th><th>Mínimo Senior</th></tr></thead>
      <tbody>${ev.habilidades.map((h) => `<tr>
        <td>${esc(h.habilidad.nombre)}</td>
        <td>${h.nivel} · ${esc(programa.nombreNivel(h.nivel))}</td>
        <td class="num">${h.hechas}/${h.total}</td>
        <td>${esc(programa.nombreNivel(minimos.get(h.id) ?? 0))}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="meta nota-radar">Anillos: 1 Básico · 2 Autónomo · 3 Avanzado. Entre anillos, la fracción de tareas del siguiente nivel.</p>
  </section>`;
}

// --- Requisitos para Senior y próximos objetivos --------------------------------------------------
export function listaRequisitos(reqs) {
  return `<ul class="requisitos">${reqs.map((r) => `
    <li class="requisito ${r.met ? 'requisito--ok' : ''}">
      ${icon(r.met ? 'circle-check' : 'circle-dashed', 'requisito__ico')}
      <span class="requisito__texto">${esc(r.texto)}<span class="meta">${esc(r.detalle ?? '')}</span></span>
      ${r.met ? '' : `<span class="requisito__barra">${barra(r.progreso)}</span>`}
    </li>`).join('')}</ul>`;
}

function tarjetaSenior({ ev, perfil }) {
  const prox = proximosObjetivos(ev);
  return `
  <section class="tarjeta">
    <header class="tarjeta__cabecera">
      <h2>Requisitos para Senior</h2>
      ${perfil.rol === 'senior' ? `<span class="chip chip--ok">${icon('badge-check')}Conseguido</span>` : ''}
    </header>
    ${listaRequisitos(ev.senior.requisitos)}
    ${prox.length ? `
      <h3 class="subtitulo">Próximos hitos a tu alcance</h3>
      <ul class="objetivos">${prox.map((h) => `
        <li>
          <button class="objetivo" data-accion="hito" data-id="${h.id}">
            <span class="objetivo__ico">${icon(h.def.icono)}</span>
            <span class="objetivo__texto"><strong>${esc(h.def.nombre)}</strong>
              <span class="meta">Falta: ${h.faltan.map((r) => esc(r.texto)).join(' · ')}</span></span>
            <span class="objetivo__pct">${pct(h.progreso)}</span>
          </button>
        </li>`).join('')}
      </ul>` : ''}
  </section>`;
}

// --- Hitos ------------------------------------------------------------------------------------------
function bloqueHitos({ ev, sol }) {
  const { programa } = estado;
  const conseguidos = ev.hitos.filter((h) => h.estado === 'conseguido').length;
  return `
  <section class="bloque">
    <header class="bloque__cabecera">
      <h2>Hitos</h2>
      <p class="meta">${conseguidos} de ${ev.hitos.length} conseguidos</p>
    </header>
    ${programa.categoriasHitos.map((c) => {
      const lista = ev.hitos.filter((h) => h.def.categoria === c.id);
      if (!lista.length) return '';
      return `<h3 class="subtitulo">${esc(c.nombre)} <span class="meta">${esc(c.descripcion ?? '')}</span></h3>
        <div class="hitos">${lista.map((h) => fichaHito(h, sol.get(`hito:${h.id}`))).join('')}</div>`;
    }).join('')}
  </section>`;
}

function fichaHito(h, solicitud) {
  let estadoTxt = ETIQUETA_ESTADO[h.estado];
  if (h.estado === 'conseguido' && h.fecha) estadoTxt += ` · ${fecha(h.fecha)}`;
  if (solicitud) estadoTxt = 'Solicitado';
  return `
  <button class="hito hito--${h.estado}${solicitud ? ' hito--solicitado' : ''}" data-accion="hito" data-id="${h.id}">
    <span class="hito__icono">${icon(h.def.icono)}</span>
    <span class="hito__texto">
      <span class="hito__nombre">${esc(h.def.nombre)}</span>
      <span class="hito__estado">${icon(solicitud ? 'hourglass' : ICONO_ESTADO[h.estado])}${esc(estadoTxt)}</span>
      ${h.estado === 'bloqueado' ? barra(h.progreso, { cls: 'barra--fina' }) : ''}
    </span>
    <span class="hito__xp">+${h.def.xp ?? 0}</span>
  </button>`;
}

// --- Habilidades ------------------------------------------------------------------------------------
function bloqueHabilidades(ctx) {
  const { ev } = ctx;
  const hechas = ev.habilidades.reduce((a, h) => a + h.hechas, 0);
  const total = ev.habilidades.reduce((a, h) => a + h.total, 0);
  return `
  <section class="bloque">
    <header class="bloque__cabecera">
      <h2>Habilidades</h2>
      <p class="meta">${hechas} de ${total} tareas validadas</p>
    </header>
    <div class="habilidades">${ev.habilidades.map((h) => tarjetaHabilidad(h, ctx)).join('')}</div>
  </section>`;
}

function tarjetaHabilidad(h, ctx) {
  const { programa } = estado;
  const def = h.habilidad;
  const pendientes = h.tiers.flatMap((t) => t.tareas).filter((t) => ctx.sol.has(`tarea:${t.id}`)).length;
  return `
  <details class="habilidad tarjeta" data-clave="hab-${def.id}">
    <summary>
      <span class="habilidad__icono">${icon(def.icono)}</span>
      <span class="habilidad__titulo">
        <strong>${esc(def.nombre)}</strong>
        <span class="meta">Nivel ${h.nivel} · ${esc(programa.nombreNivel(h.nivel))} · ${h.hechas}/${h.total}</span>
      </span>
      ${pendientes ? `<span class="chip chip--acento" title="Solicitudes pendientes">${icon('hourglass')}${pendientes}</span>` : ''}
      ${segmentos(h, programa)}
      ${icon('chevron-down', 'habilidad__flecha')}
    </summary>
    <div class="habilidad__cuerpo">
      <p class="meta">${esc(def.descripcion ?? '')}</p>
      ${h.tiers.map((t) => `
        <h4 class="nivel-titulo">Nivel ${t.nivel} · ${esc(programa.nombreNivel(t.nivel))}
          <span class="meta">${esc(programa.nivelesHabilidad[t.nivel]?.descripcion ?? '')} · ${t.hechas}/${t.total}</span></h4>
        <ul class="tareas">${t.tareas.map((tarea) => filaTarea(tarea, ctx)).join('')}</ul>`).join('')}
    </div>
  </details>`;
}

function filaTarea(t, { ev, sol, puedoValidar, esMio }) {
  const hecha = ev.tareas.get(t.id);
  const s = sol.get(`tarea:${t.id}`);
  let meta = '';
  let accion = '';
  if (hecha) {
    meta = `Validada por ${esc(nombreDe(hecha.validado_por))} · ${fecha(hecha.fecha)}${hecha.nota ? ` · «${esc(hecha.nota)}»` : ''}`;
    if (puedoValidar) accion = `<button class="boton boton--sutil boton--peq" data-accion="anular-tarea" data-id="${t.id}">Anular</button>`;
  } else if (s) {
    meta = `<span class="solicitud">${icon('hourglass')}Solicitud enviada ${hace(s.created_at)}${s.mensaje ? `: «${esc(s.mensaje)}»` : ''}</span>`;
    if (puedoValidar) accion = `<button class="boton boton--primario boton--peq" data-accion="validar-tarea" data-id="${t.id}">${icon('check')}Validar</button>`;
    else if (esMio) accion = `<button class="boton boton--sutil boton--peq" data-accion="retirar" data-sol="${s.id}">Retirar</button>`;
  } else if (puedoValidar) {
    accion = `<button class="boton boton--peq" data-accion="validar-tarea" data-id="${t.id}">${icon('check')}Validar</button>`;
  } else if (esMio) {
    accion = `<button class="boton boton--sutil boton--peq" data-accion="solicitar" data-tipo="tarea" data-id="${t.id}">${icon('send')}Solicitar validación</button>`;
  }
  return `
  <li class="tarea ${hecha ? 'tarea--hecha' : ''} ${s ? 'tarea--solicitada' : ''}">
    ${icon(hecha ? 'circle-check' : 'circle', 'tarea__ico')}
    <div class="tarea__texto">
      <span class="tarea__nombre">${esc(t.nombre)}</span>
      ${t.detalle ? `<span class="meta">${esc(t.detalle)}</span>` : ''}
      ${meta ? `<span class="tarea__meta">${meta}</span>` : ''}
    </div>
    <span class="tarea__xp">+${t.xp} XP</span>
    ${accion ? `<span class="tarea__accion">${accion}</span>` : ''}
  </li>`;
}

// --- Actividad ------------------------------------------------------------------------------------
function tarjetaActividad({ eventos }) {
  const { programa } = estado;
  const MAX = 10;
  const fila = (e, oculto) => {
    const ico = e.tipo === 'tarea' ? programa.habilidadPorId.get(e.habilidad)?.icono ?? 'check' : e.tipo === 'senior' ? 'badge-check' : e.icono;
    const quien = e.tipo === 'senior' ? '' : e.automatico ? 'Automático' : e.por ? `por ${esc(nombreDe(e.por))}` : '';
    return `<li class="evento evento--${e.tipo}"${oculto ? ' hidden' : ''}>
      <span class="evento__ico">${icon(ico)}</span>
      <span class="evento__texto"><strong>${e.tipo === 'hito' ? 'Hito: ' : ''}${esc(e.titulo)}</strong>
        <span class="meta">${fecha(e.fecha)}${quien ? ` · ${quien}` : ''}</span></span>
      ${e.xp ? `<span class="evento__xp">+${e.xp}</span>` : ''}
    </li>`;
  };
  return `
  <section class="tarjeta">
    <header class="tarjeta__cabecera"><h2>Actividad</h2></header>
    ${eventos.length ? `<ol class="actividad">${eventos.map((e, i) => fila(e, i >= MAX)).join('')}</ol>
      ${eventos.length > MAX ? `<button class="boton boton--sutil boton--peq" data-accion="ver-actividad">Ver las ${eventos.length}</button>` : ''}`
      : '<p class="meta">Todavía no hay nada validado.</p>'}
  </section>`;
}

// --- Acciones -------------------------------------------------------------------------------------
const trasCambio = async (msg) => { aviso(msg); await estado.refrescar(); };

const campoFechaNota = (nota = '') => `
  <div class="campos">
    <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${hoy()}" max="${hoy()}" required></label>
    <label class="campo campo--ancho"><span>Nota (opcional)</span><input type="text" name="nota" maxlength="500" value="${esc(nota)}" placeholder="p. ej. qué hizo o dónde"></label>
  </div>`;

const acciones = {
  'alternar-tabla'(_ctx, _d, b) {
    const tarjeta = b.closest('.tarjeta');
    const tabla = tarjeta.querySelector('table');
    const verTabla = tabla.hidden;
    tabla.hidden = !verTabla;
    tarjeta.querySelector('.radar-caja').hidden = verTabla;
    tarjeta.querySelector('.leyenda').hidden = verTabla;
    b.setAttribute('aria-pressed', String(verTabla));
    b.innerHTML = verTabla ? `${icon('radar')}Ver gráfica` : `${icon('table')}Ver tabla`;
    pintarIconos();
  },

  'ver-actividad'(_ctx, _d, b) {
    b.closest('.tarjeta').querySelectorAll('.evento[hidden]').forEach((li) => (li.hidden = false));
    b.remove();
  },

  async 'validar-tarea'({ perfil, sol }, { id }) {
    const t = estado.programa.tareas.get(id);
    const s = sol.get(`tarea:${id}`);
    const r = await dialogo({
      titulo: 'Validar tarea',
      cuerpo: `<p class="dialogo__lead">${esc(t.nombre)}</p>
        <p class="meta">${esc(estado.programa.habilidadPorId.get(t.habilidad).nombre)} · Nivel ${t.nivel} · +${t.xp} XP para ${esc(perfil.nombre)}</p>
        ${s?.mensaje ? `<blockquote class="cita">«${esc(s.mensaje)}»</blockquote>` : ''}
        ${campoFechaNota()}`,
      acciones: [{ id: 'ok', texto: 'Validar', tipo: 'primario', icono: 'check' }],
      alEnviar: (_a, d) => estado.store.validarTarea(perfil.id, id, d),
    });
    if (r) await trasCambio('Tarea validada');
  },

  async 'anular-tarea'({ perfil }, { id }) {
    const t = estado.programa.tareas.get(id);
    if (!(await confirmar('Anular validación', `¿Quitar «${esc(t.nombre)}» del progreso de ${esc(perfil.nombre)}?`, { boton: 'Anular' }))) return;
    try { await estado.store.anularTarea(perfil.id, id); await trasCambio('Validación anulada'); } catch (e) { aviso(e.message, 'error'); }
  },

  async solicitar(_ctx, { tipo, id }) {
    const nombre = tipo === 'tarea' ? estado.programa.tareas.get(id).nombre : estado.programa.hitoPorId.get(id).nombre;
    const r = await dialogo({
      titulo: tipo === 'tarea' ? 'Solicitar validación' : 'Solicitar hito',
      cuerpo: `<p class="dialogo__lead">${esc(nombre)}</p>
        <p class="meta">Un senior revisará tu solicitud. Cuéntale brevemente qué hiciste y con quién.</p>
        <label class="campo"><span>Mensaje (opcional)</span><textarea name="mensaje" rows="3" maxlength="500" placeholder="p. ej. Lo hice el martes con Pablo en el taller"></textarea></label>`,
      acciones: [{ id: 'ok', texto: 'Enviar solicitud', tipo: 'primario', icono: 'send' }],
      alEnviar: (_a, d) => estado.store.solicitar({ tipo, item_id: id, mensaje: d.mensaje.trim() }),
    });
    if (r) await trasCambio('Solicitud enviada');
  },

  async retirar(_ctx, { sol }) {
    try { await estado.store.borrarSolicitud(Number(sol)); await trasCambio('Solicitud retirada'); } catch (e) { aviso(e.message, 'error'); }
  },

  async hito(ctx, { id }) {
    const { perfil, ev, sol, puedoValidar, esMio } = ctx;
    const h = ev.hitoPorId.get(id);
    const s = sol.get(`hito:${id}`);
    const acc = [];
    let extra = '';

    if (h.estado === 'conseguido') {
      extra = `<p class="chip chip--ok">${icon('circle-check')}Conseguido${h.fecha ? ` el ${fecha(h.fecha)}` : ''}${h.automatico ? ' · automático' : h.otorgado_por ? ` · otorgado por ${esc(nombreDe(h.otorgado_por))}` : ''}</p>
        ${h.nota ? `<blockquote class="cita">${esc(h.nota)}</blockquote>` : ''}`;
      if (puedoValidar && !h.automatico) acc.push({ id: 'revocar', texto: 'Revocar', tipo: 'peligro', icono: 'undo-2' });
    } else if (h.automatico) {
      extra = `<p class="meta">${icon('zap')} Se consigue automáticamente al cumplir los requisitos.</p>`;
    } else {
      if (s) extra = `<p class="chip chip--acento">${icon('hourglass')}Solicitado ${hace(s.created_at)}</p>${s.mensaje ? `<blockquote class="cita">«${esc(s.mensaje)}»</blockquote>` : ''}`;
      if (puedoValidar) {
        if (h.estado === 'bloqueado') extra += `<p class="banda banda--neutro">${icon('triangle-alert')}Todavía no cumple todos los requisitos. Puedes otorgarlo igualmente si coordinación lo ha decidido.</p>`;
        extra += campoFechaNota();
        acc.push({ id: 'otorgar', texto: 'Otorgar hito', tipo: 'primario', icono: 'award' });
      } else if (esMio && !s && h.estado !== 'bloqueado') {
        extra += `<label class="campo"><span>Mensaje para el senior (opcional)</span><textarea name="mensaje" rows="3" maxlength="500"></textarea></label>`;
        acc.push({ id: 'solicitar', texto: 'Solicitar', tipo: 'primario', icono: 'send' });
      } else if (esMio && s) {
        acc.push({ id: 'retirar', texto: 'Retirar solicitud', tipo: '', icono: 'undo-2' });
      }
    }

    const r = await dialogo({
      titulo: `${icon(h.def.icono)} ${esc(h.def.nombre)}`,
      ancho: 'dialogo--ancho',
      cuerpo: `
        <p class="dialogo__lead">${esc(h.def.descripcion ?? '')}</p>
        <p class="meta">${esc(estado.programa.categoriasHitos.find((c) => c.id === h.def.categoria)?.nombre ?? '')} · +${h.def.xp ?? 0} XP${h.def.aprobacion ? ' · lo otorga un senior' : ''}</p>
        ${h.requisitos.length ? `<h3 class="subtitulo">Requisitos</h3>${listaRequisitos(h.requisitos)}` : '<p class="meta">Sin requisitos previos: lo otorga un senior cuando corresponde.</p>'}
        ${extra}`,
      acciones: acc,
      alEnviar: async (accion, d) => {
        const store = estado.store;
        if (accion === 'otorgar') await store.otorgarHito(perfil.id, id, d);
        if (accion === 'revocar') await store.revocarHito(perfil.id, id);
        if (accion === 'solicitar') await store.solicitar({ tipo: 'hito', item_id: id, mensaje: (d.mensaje ?? '').trim() });
        if (accion === 'retirar') await store.borrarSolicitud(s.id);
      },
    });
    if (r) await trasCambio({ otorgar: 'Hito otorgado', revocar: 'Hito revocado', solicitar: 'Solicitud enviada', retirar: 'Solicitud retirada' }[r.accion]);
  },

  async 'editar-perfil'({ perfil, puedoValidar }) {
    const departamentos = estado.programa.departamentos;
    const seniors = estado.perfiles.filter((p) => p.rol === 'senior' && p.id !== perfil.id);
    const r = await dialogo({
      titulo: 'Editar perfil',
      cuerpo: `
        <label class="campo"><span>Nombre</span><input name="nombre" required minlength="2" maxlength="80" value="${esc(perfil.nombre)}"></label>
        <label class="campo"><span>Departamento</span><select name="departamento">${departamentos.map((s) => `<option ${s === perfil.departamento ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        ${puedoValidar ? `
          <label class="campo"><span>Mentor</span><select name="mentor_id"><option value="">Sin mentor</option>${seniors.map((s) => `<option value="${esc(s.id)}" ${s.id === perfil.mentor_id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></label>
          <label class="campo"><span>Fecha de ingreso</span><input type="date" name="fecha_ingreso" value="${esc(perfil.fecha_ingreso)}" required></label>` : ''}`,
      acciones: [{ id: 'ok', texto: 'Guardar', tipo: 'primario' }],
      alEnviar: (_a, d) => {
        const cambios = { nombre: d.nombre.trim(), departamento: d.departamento };
        if (puedoValidar) Object.assign(cambios, { mentor_id: d.mentor_id || null, fecha_ingreso: d.fecha_ingreso });
        return estado.store.actualizarPerfil(perfil.id, cambios);
      },
    });
    if (r) await trasCambio('Perfil actualizado');
  },

  async ascender({ perfil }) {
    if (!(await confirmar('Ascender a Senior', `${esc(perfil.nombre)} pasará a ser Senior y podrá validar el progreso de los juniors. ¿Continuar?`, { boton: 'Ascender', tipo: 'rosa' }))) return;
    try { await estado.store.ascenderSenior(perfil.id, hoy()); await trasCambio(`¡${perfil.nombre} ya es Senior!`); } catch (e) { aviso(e.message, 'error'); }
  },
};
