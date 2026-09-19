// Cálculo del progreso de un junior a partir del programa (data/programa.json)
// y de las filas de progreso validadas por seniors (tareas e hitos).
// Todo lo que se muestra (niveles, XP, estado de hitos, camino a Senior) se
// deriva aquí; en la base de datos solo se guarda qué validó quién y cuándo.

export const TIERS = [1, 2, 3];

export class Programa {
  constructor(raw) {
    this.raw = raw;
    this.nombre = raw.nombre;
    this.departamentos = raw.departamentos || [];
    this.nivelesHabilidad = raw.nivelesHabilidad;
    this.categoriasHitos = raw.categoriasHitos;
    this.rangos = [...raw.rangos].sort((a, b) => a.xp - b.xp);
    this.senior = { id: 'senior', aprobacion: true, xp: 0, ...raw.senior };

    this.tareas = new Map();
    this.habilidades = raw.habilidades.map((h) => {
      const tiers = TIERS.map((n) =>
        (h.tareas[n] || []).map((t) => ({
          ...t,
          habilidad: h.id,
          nivel: n,
          xp: t.xp ?? raw.xpPorNivel[n],
        })),
      );
      tiers.flat().forEach((t) => this.tareas.set(t.id, t));
      return { ...h, tiers };
    });
    this.habilidadPorId = new Map(this.habilidades.map((h) => [h.id, h]));
    this.hitos = raw.hitos;
    this.hitoPorId = new Map(raw.hitos.map((h) => [h.id, h]));
  }

  nombreNivel(n) {
    return this.nivelesHabilidad[n]?.nombre ?? `Nivel ${n}`;
  }

  // Nivel mínimo por habilidad que exige el ascenso a Senior (para el radar).
  minimosSenior() {
    const min = new Map(this.habilidades.map((h) => [h.id, 0]));
    const visitar = (req) => {
      if (req.habilidad) min.set(req.habilidad, Math.max(min.get(req.habilidad), req.nivel));
      if (req.habilidadesConNivel && req.habilidadesConNivel.cantidad >= this.habilidades.length) {
        for (const id of min.keys()) min.set(id, Math.max(min.get(id), req.habilidadesConNivel.nivel));
      }
    };
    this.senior.requisitos.forEach(visitar);
    return min;
  }

  // Comprueba que los ids usados en programa.json existen y no se repiten (ayuda a detectar erratas).
  validar() {
    const avisos = [];
    const duplicados = (lista, que) => {
      const vistos = new Set();
      for (const id of lista) {
        if (vistos.has(id)) avisos.push(`${que} duplicado: ${id}`);
        vistos.add(id);
      }
    };
    duplicados(this.raw.habilidades.flatMap((h) => Object.values(h.tareas).flat().map((t) => t.id)), 'Id de tarea');
    duplicados(this.habilidades.map((h) => h.id), 'Id de habilidad');
    duplicados(this.hitos.map((h) => h.id), 'Id de hito');

    const categorias = new Set(this.categoriasHitos.map((c) => c.id));
    for (const h of this.hitos) {
      if (!categorias.has(h.categoria)) avisos.push(`Hito ${h.id}: la categoría «${h.categoria}» no existe`);
    }
    for (const r of this.rangos) {
      if (typeof r.xp !== 'number') avisos.push(`Rango «${r.nombre}»: falta el número de XP`);
    }
    for (const t of this.tareas.values()) {
      if (typeof t.xp !== 'number') avisos.push(`Tarea ${t.id}: no tiene XP (revisa xpPorNivel)`);
    }
    const TIPOS = ['habilidad', 'tarea', 'hito', 'habilidadesConNivel', 'algunoDe', 'tareasCompletadas'];
    const revisar = (req, donde) => {
      if (!TIPOS.some((t) => t in req)) avisos.push(`${donde}: requisito no reconocido ${JSON.stringify(req)}`);
      if (req.habilidad && !TIERS.includes(req.nivel)) avisos.push(`${donde}: el nivel de «${req.habilidad}» debe ser 1, 2 o 3`);
      if (req.tarea && !this.tareas.has(req.tarea)) avisos.push(`${donde}: la tarea «${req.tarea}» no existe`);
      if (req.hito && !this.hitoPorId.has(req.hito)) avisos.push(`${donde}: el hito «${req.hito}» no existe`);
      if (req.habilidad && !this.habilidadPorId.has(req.habilidad)) avisos.push(`${donde}: la habilidad «${req.habilidad}» no existe`);
      (req.algunoDe || []).forEach((r) => revisar(r, donde));
    };
    this.hitos.forEach((h) => (h.requisitos || []).forEach((r) => revisar(r, `Hito ${h.id}`)));
    this.senior.requisitos.forEach((r) => revisar(r, 'Senior'));
    return avisos;
  }
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Evalúa el estado de un junior.
 * @param {Programa} programa
 * @param {object} perfil  fila de `perfiles`
 * @param {{tareas: object[], hitos: object[]}} filas  progreso validado de ESTE junior
 * @param {{hasta?: string, conFechas?: boolean}} opciones  `hasta` limita a filas con fecha <= hasta
 */
export function evaluar(programa, perfil, filas, { hasta = null, conFechas = true } = {}) {
  const enFecha = (row) => !hasta || row.fecha <= hasta;
  const tareas = new Map(filas.tareas.filter(enFecha).map((r) => [r.tarea_id, r]));
  const otorgados = new Map(filas.hitos.filter(enFecha).map((r) => [r.hito_id, r]));

  // --- Habilidades -------------------------------------------------------------
  const habilidades = programa.habilidades.map((h) => {
    const tiers = h.tiers.map((lista, i) => ({
      nivel: i + 1,
      tareas: lista,
      total: lista.length,
      hechas: lista.filter((t) => tareas.has(t.id)).length,
    }));
    let nivel = 0;
    for (const t of tiers) {
      if (t.total > 0 && t.hechas === t.total) nivel++;
      else break;
    }
    const siguiente = tiers[nivel];
    const valor = nivel + (siguiente && siguiente.total ? siguiente.hechas / siguiente.total : 0);
    const hechas = tiers.reduce((a, t) => a + t.hechas, 0);
    const total = tiers.reduce((a, t) => a + t.total, 0);
    return { id: h.id, habilidad: h, tiers, nivel, valor, hechas, total };
  });
  const habPorId = new Map(habilidades.map((h) => [h.id, h]));

  const fraccionHasta = (hab, n) => {
    let hechas = 0, total = 0;
    for (const t of hab.tiers.slice(0, n)) { hechas += t.hechas; total += t.total; }
    return { hechas, total, fraccion: total ? hechas / total : 1 };
  };

  // --- Requisitos e hitos -------------------------------------------------------
  const estados = new Map();
  const visitando = new Set();

  const evalReq = (req) => {
    if (req.habilidad) {
      const hab = habPorId.get(req.habilidad);
      const def = programa.habilidadPorId.get(req.habilidad);
      if (!hab) return { met: false, progreso: 0, texto: req.texto ?? `Habilidad desconocida: ${req.habilidad}` };
      const f = fraccionHasta(hab, req.nivel);
      const met = hab.nivel >= req.nivel;
      return {
        tipo: 'habilidad', ref: req.habilidad, met,
        progreso: met ? 1 : f.fraccion,
        texto: req.texto ?? `${def.nombre}: nivel ${programa.nombreNivel(req.nivel)}`,
        detalle: met ? 'Conseguido' : `${f.hechas}/${f.total} tareas`,
      };
    }
    if (req.tarea) {
      const def = programa.tareas.get(req.tarea);
      const met = tareas.has(req.tarea);
      return {
        tipo: 'tarea', ref: req.tarea, met, progreso: met ? 1 : 0,
        texto: req.texto ?? (def ? def.nombre : `Tarea desconocida: ${req.tarea}`),
        detalle: def ? programa.habilidadPorId.get(def.habilidad).nombre : '',
      };
    }
    if (req.hito) {
      const def = programa.hitoPorId.get(req.hito);
      const st = evalHito(req.hito);
      const met = st.estado === 'conseguido';
      return {
        tipo: 'hito', ref: req.hito, met,
        progreso: met ? 1 : st.requisitos.length ? st.progreso * 0.9 : 0,
        texto: req.texto ?? `Hito «${def ? def.nombre : req.hito}»`,
        detalle: met ? 'Conseguido' : ETIQUETA_ESTADO[st.estado],
      };
    }
    if (req.habilidadesConNivel) {
      const { nivel, cantidad } = req.habilidadesConNivel;
      const fr = habilidades
        .map((h) => (h.nivel >= nivel ? 1 : fraccionHasta(h, nivel).fraccion))
        .sort((a, b) => b - a);
      const cuenta = habilidades.filter((h) => h.nivel >= nivel).length;
      const todas = cantidad >= habilidades.length;
      return {
        tipo: 'habilidades', met: cuenta >= cantidad,
        progreso: cuenta >= cantidad ? 1 : media(fr.slice(0, cantidad)),
        texto: req.texto ?? (todas
          ? `Nivel ${programa.nombreNivel(nivel)} en todas las habilidades`
          : `Nivel ${programa.nombreNivel(nivel)} en ${cantidad === 1 ? 'una habilidad' : `al menos ${cantidad} habilidades`}`),
        detalle: `${Math.min(cuenta, cantidad)}/${cantidad} habilidades`,
      };
    }
    if (req.algunoDe) {
      const hijos = req.algunoDe.map(evalReq);
      const met = hijos.some((h) => h.met);
      return {
        tipo: 'algunoDe', met, hijos,
        progreso: Math.max(0, ...hijos.map((h) => h.progreso)),
        texto: req.texto ?? hijos.map((h) => h.texto).join(' o '),
        detalle: met ? 'Conseguido' : 'Cualquiera de las opciones',
      };
    }
    if (req.tareasCompletadas) {
      const n = req.tareasCompletadas;
      return {
        tipo: 'contador', met: tareas.size >= n,
        progreso: Math.min(tareas.size / n, 1),
        texto: req.texto ?? (n === 1 ? 'Completar tu primera tarea' : `Completar ${n} tareas`),
        detalle: `${Math.min(tareas.size, n)}/${n}`,
      };
    }
    return { met: false, progreso: 0, texto: req.texto ?? 'Requisito no reconocido' };
  };

  const evalHito = (id) => {
    if (estados.has(id)) return estados.get(id);
    const def = id === 'senior' ? programa.senior : programa.hitoPorId.get(id);
    if (!def || visitando.has(id)) return { id, estado: 'bloqueado', requisitos: [], progreso: 0 };
    visitando.add(id);
    const requisitos = (def.requisitos || []).map(evalReq);
    visitando.delete(id);

    const cumple = requisitos.every((r) => r.met);
    const progreso = requisitos.length ? media(requisitos.map((r) => r.progreso)) : 0;
    const concedido = id === 'senior'
      ? (perfil.rol === 'senior' ? { fecha: perfil.senior_desde, otorgado_por: null } : null)
      : otorgados.get(id);

    let estado;
    if (concedido) estado = 'conseguido';
    else if (!def.aprobacion && requisitos.length && cumple) estado = 'conseguido';
    else if (def.aprobacion && requisitos.length && cumple) estado = 'listo';
    else if (!requisitos.length) estado = 'abierto';
    else estado = 'bloqueado';

    const st = {
      id, def, estado, requisitos, cumple, progreso,
      automatico: !def.aprobacion,
      fecha: concedido?.fecha ?? null,
      otorgado_por: concedido?.otorgado_por ?? null,
      nota: concedido?.nota ?? null,
    };
    estados.set(id, st);
    return st;
  };

  const hitos = programa.hitos.map((h) => evalHito(h.id));
  const senior = evalHito('senior');

  // Los hitos automáticos no tienen fila en la BD: su fecha es la primera en la que se cumplían.
  if (conFechas) {
    const fechas = [...new Set([...tareas.values(), ...otorgados.values()].map((r) => r.fecha))].sort();
    for (const st of hitos) {
      if (st.estado !== 'conseguido' || st.fecha) continue;
      for (const f of fechas) {
        const antes = evaluar(programa, perfil, filas, { hasta: f, conFechas: false });
        if (antes.hitoPorId.get(st.id).estado === 'conseguido') { st.fecha = f; break; }
      }
    }
  }

  // --- XP y rango -----------------------------------------------------------------
  let xp = 0;
  for (const id of tareas.keys()) xp += programa.tareas.get(id)?.xp ?? 0;
  for (const st of hitos) if (st.estado === 'conseguido') xp += st.def.xp ?? 0;

  const rangos = programa.rangos;
  let ri = 0;
  rangos.forEach((r, i) => { if (xp >= r.xp) ri = i; });
  const rango = {
    numero: ri + 1,
    nombre: rangos[ri].nombre,
    desde: rangos[ri].xp,
    siguiente: rangos[ri + 1] ?? null,
    progreso: rangos[ri + 1] ? (xp - rangos[ri].xp) / (rangos[ri + 1].xp - rangos[ri].xp) : 1,
  };

  return {
    perfil,
    habilidades,
    habPorId,
    hitos,
    hitoPorId: new Map(hitos.map((h) => [h.id, h])),
    senior,
    tareas,
    xp,
    rango,
  };
}

export const ETIQUETA_ESTADO = {
  conseguido: 'Conseguido',
  listo: 'Listo para solicitar',
  abierto: 'Lo otorga un senior',
  bloqueado: 'Bloqueado',
};

// Historial de eventos (para la línea de tiempo y la gráfica de XP).
export function actividad(programa, ev) {
  const eventos = [];
  for (const row of ev.tareas.values()) {
    const t = programa.tareas.get(row.tarea_id);
    if (!t) continue;
    eventos.push({ fecha: row.fecha, tipo: 'tarea', xp: t.xp, titulo: t.nombre, habilidad: t.habilidad, por: row.validado_por });
  }
  for (const st of ev.hitos) {
    if (st.estado !== 'conseguido' || !st.fecha) continue;
    eventos.push({ fecha: st.fecha, tipo: 'hito', xp: st.def.xp ?? 0, titulo: st.def.nombre, icono: st.def.icono, por: st.otorgado_por, automatico: st.automatico });
  }
  if (ev.senior.estado === 'conseguido' && ev.senior.fecha) {
    eventos.push({ fecha: ev.senior.fecha, tipo: 'senior', xp: 0, titulo: 'Ascenso a Senior' });
  }
  return eventos.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

// Hitos más cercanos a desbloquearse, con lo que falta.
export function proximosObjetivos(ev, max = 3) {
  return ev.hitos
    .filter((h) => h.estado === 'bloqueado')
    .sort((a, b) => b.progreso - a.progreso)
    .slice(0, max)
    .map((h) => ({ ...h, faltan: h.requisitos.filter((r) => !r.met) }));
}

// Comprueba que las filas de progreso apuntan a tareas/hitos que existen en el programa.
export function filasHuerfanas(programa, filas) {
  const avisos = [];
  for (const r of filas.tareas) if (!programa.tareas.has(r.tarea_id)) avisos.push(`tarea «${r.tarea_id}»`);
  for (const r of filas.hitos) if (!programa.hitoPorId.has(r.hito_id)) avisos.push(`hito «${r.hito_id}»`);
  return avisos;
}
