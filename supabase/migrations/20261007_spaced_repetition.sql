begin;

create table if not exists public.vocabulary_srs (
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null references public.vocabulary_words(word) on delete cascade,
  card jsonb not null check (jsonb_typeof(card) = 'object' and jsonb_typeof(card->'due') is not distinct from 'string'),
  rating smallint not null check (rating between 1 and 4),
  due timestamptz not null,
  reviewed_at timestamptz not null,
  primary key (user_id, word),
  check (due >= reviewed_at),
  check ((card->>'due')::timestamptz = due)
);

create index if not exists vocabulary_srs_user_due_idx on public.vocabulary_srs (user_id, due);
alter table public.vocabulary_srs enable row level security;
revoke all on public.vocabulary_srs from anon, authenticated;
grant select, insert, update on public.vocabulary_srs to authenticated;

drop policy if exists "Read own review schedule" on public.vocabulary_srs;
create policy "Read own review schedule" on public.vocabulary_srs
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insert own review schedule" on public.vocabulary_srs;
create policy "Insert own review schedule" on public.vocabulary_srs
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own review schedule" on public.vocabulary_srs;
create policy "Update own review schedule" on public.vocabulary_srs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.save_vocabulary_srs(p_rows jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid reviews' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text) > 1048576 then
    raise exception 'Review limit exceeded' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) row group by row->>'word' having count(*) > 1) then
    raise exception 'Duplicate review words' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item->'word') is distinct from 'string'
      or jsonb_typeof(item->'card') is distinct from 'object'
      or jsonb_typeof(item->'reviewed_at') is distinct from 'string'
      or jsonb_typeof(item->'rating') is distinct from 'number' then
      raise exception 'Invalid review' using errcode = '22023';
    end if;
    if (item->>'reviewed_at')::timestamptz > now() + interval '5 minutes'
      or (item->>'reviewed_at')::timestamptz < '2000-01-01'::timestamptz then
      raise exception 'Invalid review time' using errcode = '22023';
    end if;
    -- Retries and delayed offline writes cannot replace a newer review on another device.
    insert into public.vocabulary_srs (user_id, word, card, rating, due, reviewed_at)
      values (auth.uid(), item->>'word', item->'card', (item->>'rating')::smallint,
        (item->'card'->>'due')::timestamptz, (item->>'reviewed_at')::timestamptz)
      on conflict (user_id, word) do update set card = excluded.card, rating = excluded.rating,
        due = excluded.due, reviewed_at = excluded.reviewed_at
      where public.vocabulary_srs.reviewed_at < excluded.reviewed_at;
  end loop;
end;
$$;
revoke all on function public.save_vocabulary_srs(jsonb) from public, anon;
grant execute on function public.save_vocabulary_srs(jsonb) to authenticated;

commit;
