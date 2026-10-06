-- Run after schema.sql. Additive upgrade for the existing project; no lesson reset.
begin;

alter table public.vocabulary_words add column if not exists ipa text not null default '';

-- A group may only be deleted after its words have been moved or removed.
alter table public.vocabulary_words drop constraint if exists vocabulary_words_group_id_fkey;
alter table public.vocabulary_words add constraint vocabulary_words_group_id_fkey
  foreign key (group_id) references public.vocabulary_groups(id) on delete restrict;

create table if not exists public.content_editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.content_editors enable row level security;
revoke all on public.content_editors from anon, authenticated;
grant select on public.content_editors to authenticated;
drop policy if exists "Read own editor permission" on public.content_editors;
create policy "Read own editor permission" on public.content_editors
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.is_content_editor()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (select 1 from public.content_editors where user_id = (select auth.uid()));
$$;
revoke all on function public.is_content_editor() from public, anon;
grant execute on function public.is_content_editor() to authenticated;

grant insert, update, delete on public.vocabulary_groups, public.vocabulary_words,
  public.reading_passages, public.reading_questions to authenticated;

drop policy if exists "Editors insert groups" on public.vocabulary_groups;
create policy "Editors insert groups" on public.vocabulary_groups for insert to authenticated
  with check ((select public.is_content_editor()));
drop policy if exists "Editors update groups" on public.vocabulary_groups;
create policy "Editors update groups" on public.vocabulary_groups for update to authenticated
  using ((select public.is_content_editor())) with check ((select public.is_content_editor()));
drop policy if exists "Editors delete groups" on public.vocabulary_groups;
create policy "Editors delete groups" on public.vocabulary_groups for delete to authenticated
  using ((select public.is_content_editor()));

drop policy if exists "Editors insert words" on public.vocabulary_words;
create policy "Editors insert words" on public.vocabulary_words for insert to authenticated
  with check ((select public.is_content_editor()));
drop policy if exists "Editors update words" on public.vocabulary_words;
create policy "Editors update words" on public.vocabulary_words for update to authenticated
  using ((select public.is_content_editor())) with check ((select public.is_content_editor()));
drop policy if exists "Editors delete words" on public.vocabulary_words;
create policy "Editors delete words" on public.vocabulary_words for delete to authenticated
  using ((select public.is_content_editor()));

drop policy if exists "Editors insert passages" on public.reading_passages;
create policy "Editors insert passages" on public.reading_passages for insert to authenticated
  with check ((select public.is_content_editor()));
drop policy if exists "Editors update passages" on public.reading_passages;
create policy "Editors update passages" on public.reading_passages for update to authenticated
  using ((select public.is_content_editor())) with check ((select public.is_content_editor()));
drop policy if exists "Editors delete passages" on public.reading_passages;
create policy "Editors delete passages" on public.reading_passages for delete to authenticated
  using ((select public.is_content_editor()));

drop policy if exists "Editors insert questions" on public.reading_questions;
create policy "Editors insert questions" on public.reading_questions for insert to authenticated
  with check ((select public.is_content_editor()));
drop policy if exists "Editors update questions" on public.reading_questions;
create policy "Editors update questions" on public.reading_questions for update to authenticated
  using ((select public.is_content_editor())) with check ((select public.is_content_editor()));
drop policy if exists "Editors delete questions" on public.reading_questions;
create policy "Editors delete questions" on public.reading_questions for delete to authenticated
  using ((select public.is_content_editor()));

-- One transaction for a passage and all its questions, with the caller's RLS.
create or replace function public.save_reading_content(
  p_id text, p_create boolean, p_passage jsonb, p_questions jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  question jsonb;
  question_order integer := 0;
  choices text[];
  correct integer;
begin
  if not public.is_content_editor() then
    raise exception 'Editor permission required' using errcode = '42501';
  end if;
  if p_id is null or char_length(p_id) not between 1 and 200
    or p_create is null or jsonb_typeof(p_passage) is distinct from 'object'
    or coalesce(btrim(p_passage->>'title'), '') = ''
    or coalesce(btrim(p_passage->>'passage'), '') = ''
    or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Invalid reading content' using errcode = '22023';
  end if;
  if jsonb_array_length(p_questions) not between 1 and 100 then
    raise exception 'A reading requires 1 to 100 questions' using errcode = '22023';
  end if;
  if p_create then
    insert into public.reading_passages (id, title, time_label, passage, sort_order)
    values (p_id, btrim(p_passage->>'title'), coalesce(p_passage->>'time_label', ''),
      p_passage->>'passage', (p_passage->>'sort_order')::integer);
  else
    update public.reading_passages set title = btrim(p_passage->>'title'),
      time_label = coalesce(p_passage->>'time_label', ''), passage = p_passage->>'passage',
      sort_order = (p_passage->>'sort_order')::integer where id = p_id;
    if not found then
      raise exception 'Reading not found' using errcode = 'P0002';
    end if;
  end if;
  delete from public.reading_questions where reading_id = p_id;
  for question in select value from jsonb_array_elements(p_questions) loop
    if coalesce(btrim(question->>'prompt'), '') = ''
      or jsonb_typeof(question->'options') is distinct from 'array' then
      raise exception 'Invalid question' using errcode = '22023';
    end if;
    select array_agg(value order by ordinality) into choices
      from jsonb_array_elements_text(question->'options') with ordinality;
    if exists (select 1 from unnest(choices) choice where choice is null or btrim(choice) = '') then
      raise exception 'Empty answer option' using errcode = '22023';
    end if;
    correct := (question->>'answer_index')::integer;
    insert into public.reading_questions (reading_id, sort_order, prompt, options, answer_index, explanation)
    values (p_id, question_order, btrim(question->>'prompt'), choices, correct, coalesce(question->>'explanation', ''));
    question_order := question_order + 1;
  end loop;
end;
$$;
revoke all on function public.save_reading_content(text, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.save_reading_content(text, boolean, jsonb, jsonb) to authenticated;

commit;
