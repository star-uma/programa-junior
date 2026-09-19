-- =====================================================================
--  Programa Junior STAR · esquema de base de datos (Supabase / Postgres)
--  Ejecutar entero en Supabase → SQL Editor → New query → Run.
--
--  Idea clave: la definición del programa (habilidades, tareas, hitos)
--  vive en data/programa.json. Aquí solo se guarda QUIÉN validó QUÉ y
--  CUÁNDO. Las políticas RLS garantizan que un junior puede ver su
--  progreso y pedir validaciones, pero nunca escribirlo él mismo.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Tablas
-- ---------------------------------------------------------------------
create table public.perfiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  nombre        text not null check (char_length(trim(nombre)) between 2 and 80),
  departamento  text,
  rol           text not null default 'junior' check (rol in ('junior', 'senior')),
  mentor_id     uuid references public.perfiles (id) on delete set null,
  fecha_ingreso date not null default current_date,
  senior_desde  date,
  created_at    timestamptz not null default now()
);

create table public.tareas_completadas (
  junior_id    uuid not null references public.perfiles (id) on delete cascade,
  tarea_id     text not null,                       -- id de data/programa.json
  fecha        date not null default current_date,
  validado_por uuid references public.perfiles (id) on delete set null default auth.uid(),
  nota         text check (char_length(nota) <= 500),
  primary key (junior_id, tarea_id)
);

create table public.hitos_otorgados (
  junior_id    uuid not null references public.perfiles (id) on delete cascade,
  hito_id      text not null,                       -- id de data/programa.json
  fecha        date not null default current_date,
  otorgado_por uuid references public.perfiles (id) on delete set null default auth.uid(),
  nota         text check (char_length(nota) <= 500),
  primary key (junior_id, hito_id)
);

-- Un junior pide que le validen una tarea o un hito; un senior la resuelve.
create table public.solicitudes (
  id         bigint generated always as identity primary key,
  junior_id  uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  tipo       text not null check (tipo in ('tarea', 'hito')),
  item_id    text not null,
  mensaje    text check (char_length(mensaje) <= 500),
  created_at timestamptz not null default now(),
  unique (junior_id, tipo, item_id)
);

-- ---------------------------------------------------------------------
--  Funciones y triggers
-- ---------------------------------------------------------------------

-- ¿El usuario que hace la petición es senior?
create or replace function public.es_senior() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'senior');
$$;

-- Al registrarse, se crea el perfil (siempre como junior).
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Opcional: aceptar solo correos de la universidad.
  -- if new.email not ilike '%@uma.es' then raise exception 'Usa tu correo de la UMA'; end if;
  insert into public.perfiles (id, nombre, departamento)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'departamento'), '')
  );
  return new;
end $$;

create trigger al_registrarse
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Un junior puede editar su nombre y departamento, pero no su rol, mentor ni fechas.
-- (Desde el SQL Editor auth.uid() es null, así que coordinación puede hacer cambios manuales.)
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.es_senior() then
    if new.rol is distinct from old.rol
       or new.senior_desde is distinct from old.senior_desde
       or new.mentor_id is distinct from old.mentor_id
       or new.fecha_ingreso is distinct from old.fecha_ingreso then
      raise exception 'Solo un senior puede cambiar el rol, el mentor o las fechas';
    end if;
  end if;
  return new;
end $$;

create trigger proteger_perfil
  before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- Al validar una tarea u otorgar un hito, se cierra la solicitud correspondiente.
create or replace function public.cerrar_solicitud() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.solicitudes
   where junior_id = new.junior_id
     and tipo = tg_argv[0]
     and item_id = to_jsonb(new) ->> (tg_argv[0] || '_id');
  return new;
end $$;

create trigger cerrar_solicitud_tarea
  after insert or update on public.tareas_completadas
  for each row execute function public.cerrar_solicitud('tarea');

create trigger cerrar_solicitud_hito
  after insert or update on public.hitos_otorgados
  for each row execute function public.cerrar_solicitud('hito');

-- ---------------------------------------------------------------------
--  Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------
alter table public.perfiles           enable row level security;
alter table public.tareas_completadas enable row level security;
alter table public.hitos_otorgados    enable row level security;
alter table public.solicitudes        enable row level security;

-- Perfiles: todo el equipo los ve. Cada uno edita el suyo (limitado por el
-- trigger anterior) y los seniors editan cualquiera. No hay política de
-- INSERT: los perfiles solo los crea el trigger de registro.
create policy "perfiles: lectura" on public.perfiles
  for select to authenticated using (true);
create policy "perfiles: edición" on public.perfiles
  for update to authenticated
  using (id = auth.uid() or public.es_senior())
  with check (id = auth.uid() or public.es_senior());

-- Progreso: lectura para el equipo; escritura SOLO para seniors, y nunca sobre sí mismos.
create policy "tareas: lectura" on public.tareas_completadas
  for select to authenticated using (true);
create policy "tareas: validar" on public.tareas_completadas
  for insert to authenticated
  with check (public.es_senior() and validado_por = auth.uid() and junior_id <> auth.uid());
create policy "tareas: corregir" on public.tareas_completadas
  for update to authenticated
  using (public.es_senior() and junior_id <> auth.uid())
  with check (public.es_senior() and validado_por = auth.uid() and junior_id <> auth.uid());
create policy "tareas: anular" on public.tareas_completadas
  for delete to authenticated using (public.es_senior() and junior_id <> auth.uid());

create policy "hitos: lectura" on public.hitos_otorgados
  for select to authenticated using (true);
create policy "hitos: otorgar" on public.hitos_otorgados
  for insert to authenticated
  with check (public.es_senior() and otorgado_por = auth.uid() and junior_id <> auth.uid());
create policy "hitos: corregir" on public.hitos_otorgados
  for update to authenticated
  using (public.es_senior() and junior_id <> auth.uid())
  with check (public.es_senior() and otorgado_por = auth.uid() and junior_id <> auth.uid());
create policy "hitos: revocar" on public.hitos_otorgados
  for delete to authenticated using (public.es_senior() and junior_id <> auth.uid());

-- Solicitudes: cada junior ve, crea y retira las suyas; los seniors ven y cierran todas.
create policy "solicitudes: lectura" on public.solicitudes
  for select to authenticated using (junior_id = auth.uid() or public.es_senior());
create policy "solicitudes: crear" on public.solicitudes
  for insert to authenticated with check (junior_id = auth.uid() and not public.es_senior());
create policy "solicitudes: borrar" on public.solicitudes
  for delete to authenticated using (junior_id = auth.uid() or public.es_senior());

-- ---------------------------------------------------------------------
--  Primer senior (ejecutar DESPUÉS de registrarte en la app):
--
--  update public.perfiles set rol = 'senior', senior_desde = current_date
--   where id = (select id from auth.users where email = 'tu-correo@uma.es');
-- ---------------------------------------------------------------------
