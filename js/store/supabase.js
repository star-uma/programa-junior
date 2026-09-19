// Almacén real: Supabase (Postgres + Auth). Los permisos los aplica la base de
// datos mediante RLS (supabase/schema.sql); este módulo solo hace las consultas.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export function crearStoreSupabase(url, anonKey) {
  const sb = createClient(url, anonKey);
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
      return comprobar(await sb.from('perfiles').select('*').order('nombre'));
    },

    async actualizarPerfil(id, cambios) {
      comprobar(await sb.from('perfiles').update(cambios).eq('id', id));
    },

    async ascenderSenior(id, fecha) {
      comprobar(await sb.from('perfiles').update({ rol: 'senior', senior_desde: fecha }).eq('id', id));
    },

    // --- Progreso -------------------------------------------------------------------
    async progreso(juniorId) {
      let qt = sb.from('tareas_completadas').select('*');
      let qh = sb.from('hitos_otorgados').select('*');
      if (juniorId) { qt = qt.eq('junior_id', juniorId); qh = qh.eq('junior_id', juniorId); }
      const [t, h] = await Promise.all([qt, qh]);
      return { tareas: comprobar(t), hitos: comprobar(h) };
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
      let q = sb.from('solicitudes').select('*').order('created_at');
      if (juniorId) q = q.eq('junior_id', juniorId);
      return comprobar(await q);
    },

    async solicitar({ tipo, item_id, mensaje }) {
      comprobar(await sb.from('solicitudes').insert({ tipo, item_id, mensaje: mensaje || null }));
    },

    async borrarSolicitud(id) {
      comprobar(await sb.from('solicitudes').delete().eq('id', id));
    },
  };
}
