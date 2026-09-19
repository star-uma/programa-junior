// Almacén de MODO DEMO: imita la base de datos de Supabase en localStorage.
// Aplica las mismas reglas de permisos que las políticas RLS de supabase/schema.sql
// para que la demo muestre fielmente qué puede hacer cada rol.

const CLAVE = 'star-jr-demo-v2';
const CLAVE_SESION = 'star-jr-demo-sesion';

const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento: la demo vive en memoria */ } };

export function crearStoreDemo() {
  let db = null;
  let sesionId = null;
  const oyentes = new Set();

  const guardar = () => escribir(CLAVE, db);
  const avisar = () => oyentes.forEach((cb) => cb());
  const yo = () => db.perfiles.find((p) => p.id === sesionId) ?? null;
  const exigirSenior = (juniorId) => {
    if (yo()?.rol !== 'senior') throw new Error('Solo un senior puede hacer esto.');
    if (juniorId === sesionId) throw new Error('No puedes validarte a ti mismo.');
  };

  async function semilla() {
    const res = await fetch('data/demo.json', { cache: 'no-store' });
    const s = await res.json();
    return {
      perfiles: s.perfiles,
      tareas: s.tareas.map(([junior_id, tarea_id, fecha, validado_por, nota]) => ({ junior_id, tarea_id, fecha, validado_por, nota: nota ?? null })),
      hitos: s.hitos.map(([junior_id, hito_id, fecha, otorgado_por, nota]) => ({ junior_id, hito_id, fecha, otorgado_por, nota: nota ?? null })),
      solicitudes: s.solicitudes.map((x, i) => ({ id: i + 1, ...x })),
      siguienteId: s.solicitudes.length + 1,
    };
  }

  return {
    modo: 'demo',

    async init() {
      db = leer(CLAVE) ?? (await semilla());
      guardar();
      sesionId = leer(CLAVE_SESION);
      if (!db.perfiles.some((p) => p.id === sesionId)) sesionId = null;
    },

    async sesion() {
      const perfil = yo();
      return perfil ? { userId: perfil.id, perfil } : null;
    },

    onCambio(cb) { oyentes.add(cb); },

    // --- Solo demo -----------------------------------------------------------------
    async usuariosDemo() { return db.perfiles; },
    async entrarComo(id) { sesionId = id; escribir(CLAVE_SESION, id); avisar(); },
    async restablecer() {
      db = await semilla();
      guardar();
      if (!db.perfiles.some((p) => p.id === sesionId)) { sesionId = null; escribir(CLAVE_SESION, null); }
      avisar();
    },

    // --- Autenticación -----------------------------------------------------------
    async entrar() { throw new Error('En modo demo elige un usuario de la lista.'); },
    async registrar({ nombre, departamento }) {
      const id = `demo-${Date.now().toString(36)}`;
      db.perfiles.push({
        id, nombre, departamento, rol: 'junior', mentor_id: null,
        fecha_ingreso: new Date().toISOString().slice(0, 10), senior_desde: null,
      });
      guardar();
      await this.entrarComo(id);
      return { confirmar: false };
    },
    async salir() { sesionId = null; escribir(CLAVE_SESION, null); avisar(); },
    async recuperar() { throw new Error('No disponible en modo demo.'); },

    // --- Perfiles -----------------------------------------------------------------
    async perfiles() { return db.perfiles.map((p) => ({ ...p })); },

    async actualizarPerfil(id, cambios) {
      const p = db.perfiles.find((x) => x.id === id);
      const esSenior = yo()?.rol === 'senior';
      if (!p || (id !== sesionId && !esSenior)) throw new Error('No puedes editar este perfil.');
      const permitidos = esSenior ? ['nombre', 'departamento', 'mentor_id', 'fecha_ingreso'] : ['nombre', 'departamento'];
      for (const k of Object.keys(cambios)) {
        if (!permitidos.includes(k)) throw new Error(`No puedes cambiar «${k}».`);
      }
      Object.assign(p, cambios);
      guardar();
    },

    async ascenderSenior(id, fecha) {
      exigirSenior(id);
      const p = db.perfiles.find((x) => x.id === id);
      p.rol = 'senior';
      p.senior_desde = fecha;
      guardar();
    },

    // --- Progreso -------------------------------------------------------------------
    async progreso(juniorId) {
      const f = (r) => !juniorId || r.junior_id === juniorId;
      return { tareas: db.tareas.filter(f).map((r) => ({ ...r })), hitos: db.hitos.filter(f).map((r) => ({ ...r })) };
    },

    async validarTarea(juniorId, tareaId, { fecha, nota }) {
      exigirSenior(juniorId);
      db.tareas = db.tareas.filter((r) => !(r.junior_id === juniorId && r.tarea_id === tareaId));
      db.tareas.push({ junior_id: juniorId, tarea_id: tareaId, fecha, validado_por: sesionId, nota: nota || null });
      db.solicitudes = db.solicitudes.filter((s) => !(s.junior_id === juniorId && s.tipo === 'tarea' && s.item_id === tareaId));
      guardar();
    },

    async anularTarea(juniorId, tareaId) {
      exigirSenior(juniorId);
      db.tareas = db.tareas.filter((r) => !(r.junior_id === juniorId && r.tarea_id === tareaId));
      guardar();
    },

    async otorgarHito(juniorId, hitoId, { fecha, nota }) {
      exigirSenior(juniorId);
      db.hitos = db.hitos.filter((r) => !(r.junior_id === juniorId && r.hito_id === hitoId));
      db.hitos.push({ junior_id: juniorId, hito_id: hitoId, fecha, otorgado_por: sesionId, nota: nota || null });
      db.solicitudes = db.solicitudes.filter((s) => !(s.junior_id === juniorId && s.tipo === 'hito' && s.item_id === hitoId));
      guardar();
    },

    async revocarHito(juniorId, hitoId) {
      exigirSenior(juniorId);
      db.hitos = db.hitos.filter((r) => !(r.junior_id === juniorId && r.hito_id === hitoId));
      guardar();
    },

    // --- Solicitudes de validación ------------------------------------------------------
    async solicitudes(juniorId) {
      const esSenior = yo()?.rol === 'senior';
      return db.solicitudes
        .filter((s) => (esSenior || s.junior_id === sesionId) && (!juniorId || s.junior_id === juniorId))
        .map((s) => ({ ...s }));
    },

    async solicitar({ tipo, item_id, mensaje }) {
      const p = yo();
      if (!p || p.rol !== 'junior') throw new Error('Solo los juniors pueden pedir validaciones.');
      if (db.solicitudes.some((s) => s.junior_id === p.id && s.tipo === tipo && s.item_id === item_id)) {
        throw new Error('Ya has enviado esta solicitud.');
      }
      db.solicitudes.push({ id: db.siguienteId++, junior_id: p.id, tipo, item_id, mensaje: mensaje || null, created_at: new Date().toISOString() });
      guardar();
    },

    async borrarSolicitud(id) {
      const s = db.solicitudes.find((x) => x.id === id);
      if (!s) return;
      if (s.junior_id !== sesionId && yo()?.rol !== 'senior') throw new Error('No puedes borrar esta solicitud.');
      db.solicitudes = db.solicitudes.filter((x) => x.id !== id);
      guardar();
    },
  };
}
