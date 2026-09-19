// Estado compartido de la aplicación.
export const estado = {
  store: null,        // almacén de datos (demo o Supabase)
  programa: null,     // instancia de Programa (data/programa.json)
  sesion: null,       // { userId, perfil } o null
  perfiles: [],       // todos los perfiles del equipo
  perfilPorId: new Map(),
  refrescar: async () => {}, // lo define app.js: recarga datos y vuelve a pintar la vista
};

export const soySenior = () => estado.sesion?.perfil.rol === 'senior';
export const soyYo = (id) => estado.sesion?.userId === id;
export const nombreDe = (id) => estado.perfilPorId.get(id)?.nombre ?? 'un senior';

export async function cargarPerfiles() {
  estado.perfiles = await estado.store.perfiles();
  estado.perfilPorId = new Map(estado.perfiles.map((p) => [p.id, p]));
}
