-- =====================================================================
--  Nosotros · quiz para parejas
--  Pega TODO este archivo en Supabase → SQL Editor → Run (una sola vez).
--  Antes: Authentication → Sign In / Providers → activa "Allow anonymous sign-ins".
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Tablas ----------
create table if not exists public.parejas (
  id         uuid primary key default gen_random_uuid(),
  codigo     text unique not null,
  creada_en  timestamptz not null default now()
);

create table if not exists public.miembros (
  pareja_id        uuid not null references public.parejas(id) on delete cascade,
  jugador          smallint not null check (jugador in (1, 2)),
  user_id          uuid not null unique,
  nombre           text not null check (char_length(nombre) between 1 and 30),
  pin_hash         text not null,
  intentos_fallidos smallint not null default 0,
  bloqueado_hasta  timestamptz,
  primary key (pareja_id, jugador)
);

create table if not exists public.respuestas (
  pareja_id   uuid not null references public.parejas(id) on delete cascade,
  jugador     smallint not null check (jugador in (1, 2)),
  paquete_id  text not null check (char_length(paquete_id) <= 80),
  respuestas  jsonb not null check (jsonb_typeof(respuestas) = 'array' and pg_column_size(respuestas) < 20000),
  creada_en   timestamptz not null default now(),
  primary key (pareja_id, jugador, paquete_id)
);

alter table public.parejas    enable row level security;
alter table public.miembros   enable row level security;  -- sin políticas: solo se toca por funciones
alter table public.respuestas enable row level security;

-- ---------- Funciones de ayuda ----------
create or replace function public.mi_pareja() returns uuid
language sql stable security definer set search_path = public as $$
  select pareja_id from miembros where user_id = auth.uid()
$$;

create or replace function public.mi_jugador() returns smallint
language sql stable security definer set search_path = public as $$
  select jugador from miembros where user_id = auth.uid()
$$;

create or replace function public.ya_respondi(p_paquete text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from respuestas
    where pareja_id = mi_pareja() and jugador = mi_jugador() and paquete_id = p_paquete
  )
$$;

-- ---------- Políticas (RLS) ----------
drop policy if exists "ver mi pareja" on public.parejas;
create policy "ver mi pareja" on public.parejas
  for select to authenticated using (id = public.mi_pareja());

-- Guardar: solo tus propias respuestas, en tu pareja
drop policy if exists "guardar mis respuestas" on public.respuestas;
create policy "guardar mis respuestas" on public.respuestas
  for insert to authenticated
  with check (pareja_id = public.mi_pareja() and jugador = public.mi_jugador());

-- Leer: las tuyas siempre; las de tu pareja SOLO si ya respondiste ese paquete (respuesta a ciegas)
drop policy if exists "leer respuestas a ciegas" on public.respuestas;
create policy "leer respuestas a ciegas" on public.respuestas
  for select to authenticated
  using (
    pareja_id = public.mi_pareja()
    and (jugador = public.mi_jugador() or public.ya_respondi(paquete_id))
  );
-- No hay políticas de update/delete: las respuestas no se pueden cambiar.

-- ---------- Funciones que usa la página ----------
create or replace function public.mi_info() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id,
    'codigo', p.codigo,
    'jugador', public.mi_jugador(),
    'miembros', (select json_agg(json_build_object('jugador', m.jugador, 'nombre', m.nombre) order by m.jugador)
                 from miembros m where m.pareja_id = p.id)
  )
  from parejas p where p.id = public.mi_pareja()
$$;

-- Quién respondió qué (sin mostrar las respuestas): para los ✓ y "Tu turno"
create or replace function public.estado_paquetes()
returns table (paquete_id text, jugador smallint)
language sql stable security definer set search_path = public as $$
  select r.paquete_id, r.jugador from respuestas r where r.pareja_id = public.mi_pareja()
$$;

create or replace function public.crear_pareja(p_nombre text, p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_codigo text; v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then return json_build_object('error', 'Sesión no válida'); end if;
  if exists (select 1 from miembros where user_id = auth.uid()) then
    return json_build_object('error', 'Este celular ya está en una pareja'); end if;
  if coalesce(p_pin, '') !~ '^\d{4}$' then return json_build_object('error', 'El PIN debe tener 4 números'); end if;
  if char_length(trim(coalesce(p_nombre, ''))) not between 1 and 30 then
    return json_build_object('error', 'Escribe tu nombre'); end if;
  loop
    v_codigo := '';
    for i in 1..6 loop
      v_codigo := v_codigo || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from parejas where codigo = v_codigo);
  end loop;
  insert into parejas (codigo) values (v_codigo) returning id into v_id;
  insert into miembros (pareja_id, jugador, user_id, nombre, pin_hash)
  values (v_id, 1, auth.uid(), trim(p_nombre), extensions.crypt(p_pin, extensions.gen_salt('bf')));
  return public.mi_info();
end $$;

create or replace function public.unirse_pareja(p_codigo text, p_nombre text, p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then return json_build_object('error', 'Sesión no válida'); end if;
  if exists (select 1 from miembros where user_id = auth.uid()) then
    return json_build_object('error', 'Este celular ya está en una pareja'); end if;
  if coalesce(p_pin, '') !~ '^\d{4}$' then return json_build_object('error', 'El PIN debe tener 4 números'); end if;
  if char_length(trim(coalesce(p_nombre, ''))) not between 1 and 30 then
    return json_build_object('error', 'Escribe tu nombre'); end if;
  select id into v_id from parejas where codigo = upper(trim(p_codigo));
  if v_id is null then return json_build_object('error', 'No encontramos ese código'); end if;
  if exists (select 1 from miembros where pareja_id = v_id and jugador = 2) then
    return json_build_object('error', 'Esa pareja ya está completa'); end if;
  insert into miembros (pareja_id, jugador, user_id, nombre, pin_hash)
  values (v_id, 2, auth.uid(), trim(p_nombre), extensions.crypt(p_pin, extensions.gen_salt('bf')));
  return public.mi_info();
end $$;

-- Volver a entrar desde otro celular (código + nombre + PIN). 5 intentos y bloquea 15 min.
create or replace function public.recuperar_lugar(p_codigo text, p_nombre text, p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare m miembros%rowtype;
begin
  if auth.uid() is null then return json_build_object('error', 'Sesión no válida'); end if;
  if exists (select 1 from miembros where user_id = auth.uid()) then
    return json_build_object('error', 'Este celular ya está en una pareja'); end if;
  select mi.* into m from miembros mi join parejas p on p.id = mi.pareja_id
   where p.codigo = upper(trim(p_codigo)) and lower(mi.nombre) = lower(trim(p_nombre));
  if m.user_id is null then return json_build_object('error', 'Código, nombre o PIN incorrectos'); end if;
  if m.bloqueado_hasta is not null and m.bloqueado_hasta > now() then
    return json_build_object('error', 'Demasiados intentos. Espera 15 minutos'); end if;
  if m.pin_hash <> extensions.crypt(coalesce(p_pin, ''), m.pin_hash) then
    update miembros set
        intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end,
        bloqueado_hasta   = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' else bloqueado_hasta end
     where pareja_id = m.pareja_id and jugador = m.jugador;
    return json_build_object('error', 'Código, nombre o PIN incorrectos');
  end if;
  update miembros set user_id = auth.uid(), intentos_fallidos = 0, bloqueado_hasta = null
   where pareja_id = m.pareja_id and jugador = m.jugador;
  return public.mi_info();
end $$;
