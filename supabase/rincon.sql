-- =====================================================================
--  "Siempre tuyo": vales, planes, cápsulas, día a día y preguntas
--  Pega este archivo en Supabase → SQL Editor → Run (una sola vez).
--  Requiere haber corrido antes schema.sql.
-- =====================================================================

create table if not exists public.rincon (
  id         uuid primary key default gen_random_uuid(),
  pareja_id  uuid not null default public.mi_pareja() references public.parejas(id) on delete cascade,
  jugador    smallint not null default public.mi_jugador() check (jugador in (1, 2)),
  tipo       text not null check (tipo in ('vale', 'plan', 'deseo', 'capsula', 'dia', 'trivia')),
  clave      text not null check (char_length(clave) <= 80),
  titulo     text check (char_length(titulo) <= 80),
  datos      jsonb not null default '{}'::jsonb check (pg_column_size(datos) < 8000),
  abre_en    timestamptz,
  creada_en  timestamptz not null default now(),
  unique (pareja_id, jugador, tipo, clave)
);
alter table public.rincon enable row level security;

-- Leer: todo lo de tu pareja, menos el contenido de las cápsulas del otro que aún no se abren
drop policy if exists "rincon leer" on public.rincon;
create policy "rincon leer" on public.rincon for select to authenticated
  using (pareja_id = public.mi_pareja()
         and (tipo <> 'capsula' or jugador = public.mi_jugador() or abre_en <= now()));

-- Crear: solo a tu nombre y en tu pareja
drop policy if exists "rincon crear" on public.rincon;
create policy "rincon crear" on public.rincon for insert to authenticated
  with check (pareja_id = public.mi_pareja() and jugador = public.mi_jugador());

-- Editar: tus registros del día y tus respuestas
drop policy if exists "rincon editar" on public.rincon;
create policy "rincon editar" on public.rincon for update to authenticated
  using (pareja_id = public.mi_pareja() and jugador = public.mi_jugador() and tipo in ('dia', 'trivia'))
  with check (pareja_id = public.mi_pareja() and jugador = public.mi_jugador());

-- Borrar: vales y planes los puede desmarcar cualquiera de los dos; deseos y cápsulas solo quien los creó
drop policy if exists "rincon borrar" on public.rincon;
create policy "rincon borrar" on public.rincon for delete to authenticated
  using (pareja_id = public.mi_pareja()
         and (tipo in ('vale', 'plan') or (jugador = public.mi_jugador() and tipo in ('deseo', 'capsula'))));

-- Lista de cápsulas (sin el mensaje) para mostrar las cerradas con su candado
create or replace function public.capsulas()
returns table (id uuid, jugador smallint, titulo text, abre_en timestamptz, creada_en timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.jugador, r.titulo, r.abre_en, r.creada_en from rincon r
  where r.pareja_id = public.mi_pareja() and r.tipo = 'capsula'
  order by r.abre_en
$$;

grant select, insert, update, delete on public.rincon to authenticated;
