begin;

create table if not exists public.vocabulary_practice (
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null references public.vocabulary_words(word) on delete cascade,
  mode text not null check (mode in ('meaning', 'listening', 'cloze')),
  needs_retry boolean not null,
  last_answer text not null check (length(last_answer) <= 200),
  answered_at timestamptz not null,
  primary key (user_id, word)
);
create index if not exists vocabulary_practice_user_retry_idx on public.vocabulary_practice (user_id, needs_retry);
alter table public.vocabulary_practice enable row level security;
revoke all on public.vocabulary_practice from anon, authenticated;
grant select, insert, update on public.vocabulary_practice to authenticated;

drop policy if exists "Read own practice results" on public.vocabulary_practice;
create policy "Read own practice results" on public.vocabulary_practice
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insert own practice results" on public.vocabulary_practice;
create policy "Insert own practice results" on public.vocabulary_practice
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own practice results" on public.vocabulary_practice;
create policy "Update own practice results" on public.vocabulary_practice
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.save_vocabulary_practice(p_rows jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid results' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text) > 1048576 then
    raise exception 'Practice limit exceeded' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) row group by row->>'word' having count(*) > 1) then
    raise exception 'Duplicate words' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item->'word') is distinct from 'string' or jsonb_typeof(item->'mode') is distinct from 'string'
      or jsonb_typeof(item->'needs_retry') is distinct from 'boolean' or jsonb_typeof(item->'last_answer') is distinct from 'string'
      or jsonb_typeof(item->'answered_at') is distinct from 'string' then
      raise exception 'Invalid result' using errcode = '22023';
    end if;
    if (item->>'answered_at')::timestamptz < '2000-01-01'::timestamptz
      or (item->>'answered_at')::timestamptz > now() + interval '5 minutes' then
      raise exception 'Invalid answer time' using errcode = '22023';
    end if;
    -- Keep correct-answer tombstones so old offline mistakes cannot reappear after retry.
    insert into public.vocabulary_practice (user_id, word, mode, needs_retry, last_answer, answered_at)
      values (auth.uid(), item->>'word', item->>'mode', (item->>'needs_retry')::boolean, item->>'last_answer', (item->>'answered_at')::timestamptz)
      on conflict (user_id, word) do update set mode = excluded.mode, needs_retry = excluded.needs_retry,
        last_answer = excluded.last_answer, answered_at = excluded.answered_at
      where public.vocabulary_practice.answered_at < excluded.answered_at;
  end loop;
end;
$$;
revoke all on function public.save_vocabulary_practice(jsonb) from public, anon;
grant execute on function public.save_vocabulary_practice(jsonb) to authenticated;

commit;
