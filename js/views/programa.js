// El programa completo: cómo funciona, qué hay que hacer y qué desbloquea cada cosa.
import { estado } from '../estado.js';
import { esc, icon } from '../ui.js';

const textoReq = (req) => {
  const { programa } = estado;
  if (req.texto) return req.texto;
  if (req.habilidad) return `${programa.habilidadPorId.get(req.habilidad)?.nombre}: nivel ${programa.nombreNivel(req.nivel)}`;
  if (req.tarea) return `Tarea: ${programa.tareas.get(req.tarea)?.nombre}`;
  if (req.hito) return `Hito «${programa.hitoPorId.get(req.hito)?.nombre}»`;
  if (req.habilidadesConNivel) {
    const { nivel, cantidad } = req.habilidadesConNivel;
    return `Nivel ${programa.nombreNivel(nivel)} en ${cantidad >= programa.habilidades.length ? 'todas las habilidades' : cantidad === 1 ? 'una habilidad' : `al menos ${cantidad} habilidades`}`;
  }
  if (req.algunoDe) return req.algunoDe.map(textoReq).join(' o ');
  if (req.tareasCompletadas) return req.tareasCompletadas === 1 ? 'Completar tu primera tarea' : `Completar ${req.tareasCompletadas} tareas`;
  return '';
};

export function vistaPrograma(main) {
  const { programa } = estado;
  main.innerHTML = `
    <header class="pagina-cabecera">
      <p class="sobretitulo">Guía</p>
      <h1>${esc(programa.nombre)}</h1>
      <p class="lead">Todo lo que necesitas para pasar de Junior a Senior en STAR.</p>
    </header>

    <section class="pasos">
      ${paso(1, 'hammer', 'Aprende haciendo', 'Trabaja cada tarea en el taller junto a un senior o tu mentor.')}
      ${paso(2, 'send', 'Pide la validación', 'Desde tu perfil pulsa «Solicitar validación» y cuenta qué hiciste.')}
      ${paso(3, 'badge-check', 'Un senior la valida', 'Solo los seniors pueden validar: así tu progreso refleja lo que sabes hacer.')}
      ${paso(4, 'trophy', 'Sube de nivel', 'Ganas XP, desbloqueas hitos y permisos, y te acercas al ascenso a Senior.')}
    </section>

    <div class="rejilla rejilla--2">
      <section class="tarjeta">
        <header class="tarjeta__cabecera"><h2>${esc(programa.senior.nombre)}</h2></header>
        <p class="meta">${esc(programa.senior.descripcion ?? '')}</p>
        <ul class="lista-check">${programa.senior.requisitos.map((r) => `<li>${icon('circle-dashed')}${esc(textoReq(r))}</li>`).join('')}</ul>
      </section>
      <section class="tarjeta">
        <header class="tarjeta__cabecera"><h2>Niveles y rangos</h2></header>
        <p class="meta">Cada habilidad tiene tres niveles. Completas un nivel cuando te validan todas sus tareas.</p>
        <ul class="lista-niveles">${programa.nivelesHabilidad.slice(1).map((n, i) => `<li><span class="celda-muestra nv-${i + 1}"></span><strong>${i + 1} · ${esc(n.nombre)}</strong><span class="meta">${esc(n.descripcion)} · +${programa.raw.xpPorNivel[i + 1]} XP por tarea</span></li>`).join('')}</ul>
        <p class="meta">Con la XP subes de rango:</p>
        <ol class="rangos">${programa.rangos.map((r, i) => `<li><span class="rango__num">${i + 1}</span><strong>${esc(r.nombre)}</strong><span class="meta">${r.xp} XP</span></li>`).join('')}</ol>
      </section>
    </div>

    <section class="bloque">
      <header class="bloque__cabecera"><h2>Hitos</h2></header>
      ${programa.categoriasHitos.map((c) => `
        <h3 class="subtitulo">${esc(c.nombre)} <span class="meta">${esc(c.descripcion ?? '')}</span></h3>
        <div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Hito</th><th>Requisitos</th><th class="num">XP</th></tr></thead>
          <tbody>${programa.hitos.filter((h) => h.categoria === c.id).map((h) => `<tr>
            <td><span class="celda-hito">${icon(h.icono)}<span><strong>${esc(h.nombre)}</strong><span class="meta">${esc(h.descripcion)}</span></span></span></td>
            <td>${h.requisitos.length ? `<ul class="lista-simple">${h.requisitos.map((r) => `<li>${esc(textoReq(r))}</li>`).join('')}</ul>` : '<span class="meta">Lo otorga un senior</span>'}
              ${h.aprobacion ? '' : '<span class="chip">Automático</span>'}</td>
            <td class="num">${h.xp}</td></tr>`).join('')}
          </tbody>
        </table></div>`).join('')}
    </section>

    <section class="bloque">
      <header class="bloque__cabecera"><h2>Habilidades y tareas</h2></header>
      <div class="habilidades">${programa.habilidades.map((h) => `
        <details class="habilidad tarjeta" data-clave="prog-${h.id}">
          <summary>
            <span class="habilidad__icono">${icon(h.icono)}</span>
            <span class="habilidad__titulo"><strong>${esc(h.nombre)}</strong><span class="meta">${esc(h.descripcion ?? '')}</span></span>
            ${icon('chevron-down', 'habilidad__flecha')}
          </summary>
          <div class="habilidad__cuerpo">${h.tiers.map((lista, i) => `
            <h4 class="nivel-titulo">Nivel ${i + 1} · ${esc(programa.nombreNivel(i + 1))}</h4>
            <ul class="tareas">${lista.map((t) => `<li class="tarea">${icon('circle', 'tarea__ico')}<div class="tarea__texto"><span class="tarea__nombre">${esc(t.nombre)}</span>${t.detalle ? `<span class="meta">${esc(t.detalle)}</span>` : ''}</div><span class="tarea__xp">+${t.xp} XP</span></li>`).join('')}</ul>`).join('')}
          </div>
        </details>`).join('')}
      </div>
    </section>`;
}

const paso = (n, ico, titulo, texto) => `
  <div class="paso tarjeta">
    <span class="paso__num">${n}</span>
    <span class="paso__ico">${icon(ico)}</span>
    <h3>${esc(titulo)}</h3>
    <p class="meta">${esc(texto)}</p>
  </div>`;
