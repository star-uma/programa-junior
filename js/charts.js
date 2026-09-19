// Gráficas en SVG sin dependencias: radar de habilidades, XP acumulada y medidores.
import { esc, fecha, mesCorto, aFecha, hoy, diasEntre, mostrarTip, ocultarTip } from './ui.js';

const f1 = (n) => n.toFixed(1);

// --- Radar de habilidades ---------------------------------------------------------------
// Serie "Tú" (color de acento) frente al mínimo exigido para Senior (gris).
export function radar(ev, programa) {
  const W = 480, H = 380, cx = 240, cy = 192, R = 124, MAX = 3;
  const habs = ev.habilidades;
  const n = habs.length;
  const minimos = programa.minimosSenior();
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * (R * v) / MAX, cy + Math.sin(ang(i)) * (R * v) / MAX];
  const poly = (vals) => vals.map((v, i) => pt(i, v).map(f1).join(',')).join(' ');

  const anillos = [1, 2, 3].map((v) => `<polygon class="radar__anillo" points="${poly(habs.map(() => v))}"/>`).join('');
  const radios = habs.map((_, i) => { const [x, y] = pt(i, MAX); return `<line class="radar__radio" x1="${cx}" y1="${cy}" x2="${f1(x)}" y2="${f1(y)}"/>`; }).join('');
  const marcasNivel = [1, 2, 3].map((v) => {
    const [x, y] = pt(0, v);
    return `<text class="radar__nivel" x="${f1(x + 5)}" y="${f1(y + 11)}">${v}</text>`;
  }).join('');

  const etiquetas = habs.map((h, i) => {
    const a = ang(i);
    const [x, y] = pt(i, MAX);
    const dx = Math.cos(a) * 14, dy = Math.sin(a) * 14;
    const anchor = Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle';
    const base = Math.sin(a) < -0.3 ? -2 : Math.sin(a) > 0.3 ? 12 : 4;
    return `<text class="radar__etiqueta" x="${f1(x + dx)}" y="${f1(y + dy + base)}" text-anchor="${anchor}">${esc(h.habilidad.nombre)}</text>`;
  }).join('');

  const ref = poly(habs.map((h) => minimos.get(h.id) ?? 0));
  const tu = poly(habs.map((h) => Math.max(h.valor, 0.04)));

  const puntos = habs.map((h, i) => {
    const [x, y] = pt(i, Math.max(h.valor, 0.04));
    const min = minimos.get(h.id) ?? 0;
    const tip = [
      h.habilidad.nombre,
      `Nivel ${h.nivel} · ${programa.nombreNivel(h.nivel)}`,
      `${h.hechas} de ${h.total} tareas`,
      min ? `Mínimo para Senior: ${programa.nombreNivel(min)}` : '',
    ].filter(Boolean).join('\n');
    return `<g class="radar__punto" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip.replace(/\n/g, ', '))}">
      <circle class="radar__hit" cx="${f1(x)}" cy="${f1(y)}" r="16"/>
      <circle class="radar__dot" cx="${f1(x)}" cy="${f1(y)}" r="4.5"/>
    </g>`;
  }).join('');

  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="Perfil de habilidades frente al mínimo para Senior">
    ${anillos}${radios}${marcasNivel}
    <polygon class="radar__ref" points="${ref}"/>
    <polygon class="radar__tu" points="${tu}"/>
    ${puntos}${etiquetas}
  </svg>`;
}

// --- Medidor segmentado por niveles (1, 2, 3) -------------------------------------------
export function segmentos(hab, programa) {
  return `<span class="segmentos" aria-hidden="true">${hab.tiers.map((t) => {
    const f = t.total ? t.hechas / t.total : 0;
    const tip = `Nivel ${t.nivel} · ${programa.nombreNivel(t.nivel)}\n${t.hechas} de ${t.total} tareas`;
    return `<span class="seg${f === 1 ? ' seg--completo' : ''}" data-tip="${esc(tip)}"><span class="seg__relleno" style="width:${(f * 100).toFixed(1)}%"></span></span>`;
  }).join('')}</span>`;
}

// --- XP acumulada en el tiempo -------------------------------------------------------------
// Línea escalonada (la XP solo cambia cuando se valida algo) con área suave y cruceta al pasar el ratón.
export function graficaXP(eventos, fechaIngreso) {
  const W = 640, H = 230, m = { l: 44, r: 18, t: 14, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  const porDia = new Map();
  for (const e of [...eventos].reverse()) {
    const d = porDia.get(e.fecha) ?? { fecha: e.fecha, xp: 0, items: [] };
    d.xp += e.xp;
    d.items.push(e);
    porDia.set(e.fecha, d);
  }
  const dias = [...porDia.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let acum = 0;
  dias.forEach((d) => { acum += d.xp; d.total = acum; });

  const inicio = [fechaIngreso, dias[0]?.fecha].filter(Boolean).sort()[0];
  const fin = hoy();
  const span = Math.max(diasEntre(inicio, fin), 14);
  const x = (iso) => m.l + (diasEntre(inicio, iso) / span) * iw;

  const bruto = Math.max(acum, 50);
  const paso = [10, 25, 50, 100, 200, 250, 500, 1000].find((p) => bruto / p <= 4) ?? 1000;
  const ymax = Math.ceil(bruto / paso) * paso;
  const y = (v) => m.t + ih - (v / ymax) * ih;

  // Trazo escalonado
  let d = `M${f1(x(inicio))},${f1(y(0))}`;
  let prev = 0;
  for (const p of dias) {
    d += ` H${f1(x(p.fecha))} V${f1(y(p.total))}`;
    prev = p.total;
  }
  d += ` H${f1(x(fin))}`;
  const area = `${d} V${f1(y(0))} Z`;

  const rejilla = [];
  for (let v = 0; v <= ymax; v += paso) {
    rejilla.push(`<line class="graf__rejilla" x1="${m.l}" x2="${W - m.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>
      <text class="graf__eje" x="${m.l - 8}" y="${f1(y(v) + 4)}" text-anchor="end">${v}</text>`);
  }

  // Marcas de meses (como mucho ~7 etiquetas)
  const marcas = [];
  const i0 = aFecha(inicio);
  const meses = Math.max(1, Math.round(span / 30));
  const cada = Math.ceil(meses / 7);
  for (let k = 1, c = 0; ; k++) {
    const dm = new Date(i0.getFullYear(), i0.getMonth() + k, 1);
    const iso = `${dm.getFullYear()}-${String(dm.getMonth() + 1).padStart(2, '0')}-01`;
    if (iso > fin) break;
    if (c++ % cada) continue;
    const etiqueta = dm.getMonth() === 0 ? `${mesCorto(dm)} ${dm.getFullYear()}` : mesCorto(dm);
    marcas.push(`<text class="graf__eje" x="${f1(x(iso))}" y="${H - 8}" text-anchor="middle">${etiqueta}</text>`);
  }

  const html = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="XP acumulada desde ${esc(fecha(inicio))}: ${acum} XP" data-tip-propio>
    ${rejilla.join('')}
    <line class="graf__base" x1="${m.l}" x2="${W - m.r}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>
    ${marcas.join('')}
    <path class="graf__area" d="${area}"/>
    <path class="graf__linea" d="${d}"/>
    <circle class="graf__fin" cx="${f1(x(fin))}" cy="${f1(y(prev))}" r="4.5"/>
    <text class="graf__valor" x="${f1(x(fin) - 8)}" y="${f1(y(prev) - 10)}" text-anchor="end">${acum} XP</text>
    <line class="graf__cruz" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>
    <circle class="graf__foco" r="4.5" visibility="hidden"/>
    <rect class="graf__captura" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/>
  </svg>`;

  const montar = (raiz) => {
    const svg = raiz.querySelector('svg.graf');
    if (!svg || !dias.length) return;
    const cruz = svg.querySelector('.graf__cruz');
    const foco = svg.querySelector('.graf__foco');
    const captura = svg.querySelector('.graf__captura');
    const mover = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      let mejor = dias[0];
      for (const p of dias) if (Math.abs(x(p.fecha) - px) < Math.abs(x(mejor.fecha) - px)) mejor = p;
      const cx = x(mejor.fecha), cy = y(mejor.total);
      cruz.setAttribute('x1', cx); cruz.setAttribute('x2', cx); cruz.setAttribute('visibility', 'visible');
      foco.setAttribute('cx', cx); foco.setAttribute('cy', cy); foco.setAttribute('visibility', 'visible');
      const lineas = mejor.items.slice(0, 4).map((it) => `${it.tipo === 'tarea' ? '✓' : '★'} ${it.titulo}`);
      if (mejor.items.length > 4) lineas.push(`y ${mejor.items.length - 4} más`);
      const escala = r.width / W;
      mostrarTip(`${fecha(mejor.fecha)} · ${mejor.total} XP (+${mejor.xp})\n${lineas.join('\n')}`, r.left + cx * escala, r.top + cy * escala);
    };
    const salir = () => { cruz.setAttribute('visibility', 'hidden'); foco.setAttribute('visibility', 'hidden'); ocultarTip(); };
    captura.addEventListener('pointermove', mover);
    captura.addEventListener('pointerleave', salir);
  };

  return { html, montar };
}
