// Almacén real: Supabase (Postgres + Auth). Los permisos los aplica la base de
// datos mediante RLS (supabase/schema.sql); este módulo solo hace las consultas.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export function crearStoreSupabase(url, anonKey) {
  // Solo la raíz del proyecto: si la URL trae una ruta (p. ej. /rest/v1/), el login falla.
  const sb = createClient(new URL(url).origin, anonKey);
  let userId = null;

  // Traduce errores de Supabase/Postgres a mensajes legibles.
  const comprobar = ({ data, error }) => {
    if (!error) return data;
    const msg = error.message || String(error);
    if (/row-level security|permission denied|Solo un senior/i.test(msg)) throw new Error('No tienes permiso para hacer esto.');
    if (/duplicate key/i.test(msg)) throw new Error('Ya existe.');
    if (/Invalid login credentials/i.test(msg)) throw new Error('Correo o contraseña incorrectos.');
    if (/Email not confirmed/i.test(msg)) throw new Error('Confirma tu correo antes de entrar (revisa la bandeja de entrada).');
    if (/already registered/i.test(msg)) throw new Error('Ese correo ya tiene una cuenta.');
    throw new Error(msg);
  };

  // Supabase devuelve como máximo 1.000 filas por consulta y no avisa si corta.
  // Esta función pide páginas hasta traerlas todas. `consulta` crea la consulta
  // desde cero en cada página; debe llevar un orden estable para no saltar filas.
  const POR_PAGINA = 1000;
  const todas = async (consulta) => {
    const filas = [];
    for (let desde = 0; ; desde += POR_PAGINA) {
      const pagina = comprobar(await consulta().range(desde, desde + POR_PAGINA - 1));
      filas.push(...pagina);
      if (pagina.length < POR_PAGINA) return filas;
    }
  };

  return {
    modo: 'supabase',

    async init() {
      const { data } = await sb.auth.getSession();
      userId = data.session?.user.id ?? null;
    },

    async sesion() {
      const { data } = await sb.auth.getSession();
      userId = data.session?.user.id ?? null;
      if (!userId) return null;
      const perfil = comprobar(await sb.from('perfiles').select('*').eq('id', userId).maybeSingle());
      return perfil ? { userId, perfil, email: data.session.user.email } : null;
    },

    onCambio(cb) {
      sb.auth.onAuthStateChange((evento) => {
        // Los callbacks de Supabase no deben esperar a otras llamadas de Supabase: se difieren.
        if (evento === 'PASSWORD_RECOVERY') setTimeout(() => cb('recuperacion'));
        else if (['SIGNED_IN', 'SIGNED_OUT'].includes(evento)) setTimeout(() => cb(evento));
      });
    },

    // --- Autenticación -----------------------------------------------------------
    async entrar({ email, password }) {
      comprobar(await sb.auth.signInWithPassword({ email, password }));
    },

    async registrar({ email, password, nombre, departamento }) {
      const data = comprobar(await sb.auth.signUp({
        email,
        password,
        options: {
          data: { nombre, departamento },
          emailRedirectTo: location.origin + location.pathname,
        },
      }));
      return { confirmar: !data.session };
    },

    async salir() { comprobar(await sb.auth.signOut()); },

    async recuperar(email) {
      comprobar(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
    },

    async cambiarPassword(password) {
      comprobar(await sb.auth.updateUser({ password }));
    },

    // --- Perfiles -----------------------------------------------------------------
    async perfiles() {
      return todas(() => sb.from('perfiles').select('*').order('nombre').order('id'));
    },

    async actualizarPerfil(id, cambios) {
      comprobar(await sb.from('perfiles').update(cambios).eq('id', id));
    },

    async ascenderSenior(id, fecha) {
      comprobar(await sb.from('perfiles').update({ rol: 'senior', senior_desde: fecha }).eq('id', id));
    },

    // --- Progreso -------------------------------------------------------------------
    async progreso(juniorId) {
      const filtrar = (q) => (juniorId ? q.eq('junior_id', juniorId) : q);
      const [tareas, hitos] = await Promise.all([
        todas(() => filtrar(sb.from('tareas_completadas').select('*')).order('junior_id').order('tarea_id')),
        todas(() => filtrar(sb.from('hitos_otorgados').select('*')).order('junior_id').order('hito_id')),
      ]);
      return { tareas, hitos };
    },

    async validarTarea(juniorId, tareaId, { fecha, nota }) {
      comprobar(await sb.from('tareas_completadas').upsert(
        { junior_id: juniorId, tarea_id: tareaId, fecha, nota: nota || null, validado_por: userId },
        { onConflict: 'junior_id,tarea_id' },
      ));
    },

    async anularTarea(juniorId, tareaId) {
      comprobar(await sb.from('tareas_completadas').delete().eq('junior_id', juniorId).eq('tarea_id', tareaId));
    },

    async otorgarHito(juniorId, hitoId, { fecha, nota }) {
      comprobar(await sb.from('hitos_otorgados').upsert(
        { junior_id: juniorId, hito_id: hitoId, fecha, nota: nota || null, otorgado_por: userId },
        { onConflict: 'junior_id,hito_id' },
      ));
    },

    async revocarHito(juniorId, hitoId) {
      comprobar(await sb.from('hitos_otorgados').delete().eq('junior_id', juniorId).eq('hito_id', hitoId));
    },

    // --- Solicitudes de validación ------------------------------------------------------
    async solicitudes(juniorId) {
      return todas(() => {
        const q = sb.from('solicitudes').select('*');
        return (juniorId ? q.eq('junior_id', juniorId) : q).order('created_at').order('id');
      });
    },

    async solicitar({ tipo, item_id, mensaje }) {
      comprobar(await sb.from('solicitudes').insert({ tipo, item_id, mensaje: mensaje || null }));
    },

    async borrarSolicitud(id) {
      comprobar(await sb.from('solicitudes').delete().eq('id', id));
    },
  };
}
