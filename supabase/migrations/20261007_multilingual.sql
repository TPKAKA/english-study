-- Run after the content CRUD, import, SRS and typing-practice migrations.
-- Existing English card IDs keep their old word value to preserve browser caches.
begin;

create table if not exists public.study_languages (
  code text primary key check (code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' and length(code) <= 35),
  name text not null check (length(btrim(name)) between 1 and 100),
  speech_locale text not null check (speech_locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' and length(speech_locale) <= 35),
  pronunciation_mode text not null check (pronunciation_mode in ('ipa', 'reading')),
  sort_order integer not null default 0 check (sort_order >= 0)
);
insert into public.study_languages values
  ('en', 'Tiếng Anh', 'en-GB', 'ipa', 0), ('ko', 'Tiếng Hàn', 'ko-KR', 'reading', 1)
  on conflict (code) do nothing;
alter table public.study_languages enable row level security;
revoke all on public.study_languages from anon, authenticated;
grant select on public.study_languages to anon, authenticated;
grant insert, update, delete on public.study_languages to authenticated;
drop policy if exists "Read study languages" on public.study_languages;
create policy "Read study languages" on public.study_languages for select to anon, authenticated using (true);
drop policy if exists "Editors insert languages" on public.study_languages;
create policy "Editors insert languages" on public.study_languages for insert to authenticated with check ((select public.is_content_editor()));
drop policy if exists "Editors update languages" on public.study_languages;
create policy "Editors update languages" on public.study_languages for update to authenticated using ((select public.is_content_editor())) with check ((select public.is_content_editor()));
drop policy if exists "Editors delete languages" on public.study_languages;
create policy "Editors delete languages" on public.study_languages for delete to authenticated using ((select public.is_content_editor()));

alter table public.vocabulary_groups add column if not exists language_code text not null default 'en' references public.study_languages(code) on delete restrict;
alter table public.reading_passages add column if not exists language_code text not null default 'en' references public.study_languages(code) on delete restrict;
create index if not exists vocabulary_groups_language_idx on public.vocabulary_groups(language_code, sort_order);
create index if not exists reading_passages_language_idx on public.reading_passages(language_code, sort_order);

alter table public.vocabulary_words add column if not exists id text;
update public.vocabulary_words set id = word where id is null;
alter table public.vocabulary_words alter column id set not null;
alter table public.vocabulary_words alter column id set default gen_random_uuid()::text;
alter table public.vocabulary_words add column if not exists reading text not null default '' check (length(reading) <= 500);
alter table public.vocabulary_words add column if not exists romanization text not null default '' check (length(romanization) <= 500);
alter table public.vocabulary_words add column if not exists cloze_text text not null default '';
alter table public.vocabulary_words add column if not exists cloze_answer text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vocabulary_words'::regclass and conname = 'vocabulary_words_cloze_check') then
    alter table public.vocabulary_words add constraint vocabulary_words_cloze_check check (
      length(cloze_text) <= 5000 and length(cloze_answer) <= 200 and
      ((cloze_text = '' and cloze_answer = '') or (position('_____' in cloze_text) > 0 and btrim(cloze_answer) <> '')));
    alter table public.vocabulary_words add constraint vocabulary_words_id_check check (length(id) between 1 and 200);
  end if;
end $$;

alter table public.vocabulary_srs drop constraint if exists vocabulary_srs_word_fkey;
alter table public.vocabulary_practice drop constraint if exists vocabulary_practice_word_fkey;
do $$
declare v_table text;
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.vocabulary_words'::regclass and contype = 'p' and pg_get_constraintdef(oid) = 'PRIMARY KEY (word)') then
    alter table public.vocabulary_words drop constraint vocabulary_words_pkey;
    alter table public.vocabulary_words add primary key (id);
  end if;
  foreach v_table in array array['vocabulary_progress', 'vocabulary_srs', 'vocabulary_practice'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'word') then
      execute format('alter table public.%I rename column word to card_id', v_table);
    end if;
  end loop;
end $$;
drop index if exists public.vocabulary_words_normalized_word_idx;
create unique index if not exists vocabulary_words_group_word_idx on public.vocabulary_words(group_id, lower(btrim(word)));

-- NOT VALID retains old orphan progress instead of discarding it; new writes are checked.
do $$
declare v_table text;
begin
  foreach v_table in array array['vocabulary_progress', 'vocabulary_srs', 'vocabulary_practice'] loop
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', v_table)::regclass and conname = v_table || '_card_id_fkey') then
      execute format('alter table public.%I add constraint %I foreign key (card_id) references public.vocabulary_words(id) on delete cascade not valid', v_table, v_table || '_card_id_fkey');
    end if;
  end loop;
end $$;

create or replace function public.protect_content_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'vocabulary_words' then
    if new.id is distinct from old.id then raise exception 'Card ID is immutable' using errcode = '22023'; end if;
    if new.group_id is distinct from old.group_id and
      (select language_code from public.vocabulary_groups where id = new.group_id) is distinct from
      (select language_code from public.vocabulary_groups where id = old.group_id) then
      raise exception 'Cannot move a card across languages' using errcode = '22023';
    end if;
  elsif tg_table_name = 'study_languages' then
    if new.code is distinct from old.code then raise exception 'Language code is immutable' using errcode = '22023'; end if;
  elsif new.language_code is distinct from old.language_code then
    raise exception 'Content language is immutable' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists protect_card_identity on public.vocabulary_words;
create trigger protect_card_identity before update on public.vocabulary_words for each row execute function public.protect_content_identity();
drop trigger if exists protect_group_language on public.vocabulary_groups;
create trigger protect_group_language before update on public.vocabulary_groups for each row execute function public.protect_content_identity();
drop trigger if exists protect_passage_language on public.reading_passages;
create trigger protect_passage_language before update on public.reading_passages for each row execute function public.protect_content_identity();
drop trigger if exists protect_language_code on public.study_languages;
create trigger protect_language_code before update on public.study_languages for each row execute function public.protect_content_identity();

create or replace function public.import_vocabulary_words(p_rows jsonb, p_mode text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; saved integer; total integer;
begin
  if not public.is_content_editor() then raise exception 'Editor permission required' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('skip', 'update') or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Invalid import' using errcode = '22023';
  end if;
  total := jsonb_array_length(p_rows);
  if total not between 1 and 500 or octet_length(p_rows::text) > 1048576 then raise exception 'Import limit exceeded' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r group by r->>'group_id', lower(btrim(r->>'word')) having count(*) > 1) then
    raise exception 'Duplicate cards in import' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'word') is distinct from 'string' or jsonb_typeof(item->'meaning') is distinct from 'string'
      or jsonb_typeof(item->'group_id') is distinct from 'string' or jsonb_typeof(item->'ipa') is distinct from 'string'
      or jsonb_typeof(item->'example') is distinct from 'string'
      or char_length(btrim(item->>'word')) not between 1 and 200 or char_length(btrim(item->>'meaning')) not between 1 and 2000
      or char_length(item->>'ipa') > 500 or char_length(item->>'example') > 5000
      or coalesce(item->>'sort_order', '') !~ '^[0-9]+$'
      or (item ? 'reading' and jsonb_typeof(item->'reading') is distinct from 'string')
      or (item ? 'romanization' and jsonb_typeof(item->'romanization') is distinct from 'string')
      or (item ? 'cloze_text' and jsonb_typeof(item->'cloze_text') is distinct from 'string')
      or (item ? 'cloze_answer' and jsonb_typeof(item->'cloze_answer') is distinct from 'string') then
      raise exception 'Invalid import row' using errcode = '22023';
    end if;
  end loop;
  if p_mode = 'skip' then
    insert into public.vocabulary_words(word, group_id, meaning, ipa, example, sort_order, reading, romanization, cloze_text, cloze_answer)
      select btrim(word), group_id, btrim(meaning), ipa, example, sort_order, coalesce(reading,''), coalesce(romanization,''), coalesce(cloze_text,''), coalesce(cloze_answer,'')
      from jsonb_to_recordset(p_rows) as r(word text, group_id text, meaning text, ipa text, example text, sort_order integer, reading text, romanization text, cloze_text text, cloze_answer text)
      on conflict (group_id, (lower(btrim(word)))) do nothing;
  else
    insert into public.vocabulary_words(word, group_id, meaning, ipa, example, sort_order, reading, romanization, cloze_text, cloze_answer)
      select btrim(word), group_id, btrim(meaning), ipa, example, sort_order, coalesce(reading,''), coalesce(romanization,''), coalesce(cloze_text,''), coalesce(cloze_answer,'')
      from jsonb_to_recordset(p_rows) as r(word text, group_id text, meaning text, ipa text, example text, sort_order integer, reading text, romanization text, cloze_text text, cloze_answer text)
      on conflict (group_id, (lower(btrim(word)))) do update set
        meaning = excluded.meaning, ipa = excluded.ipa, example = excluded.example, sort_order = excluded.sort_order,
        reading = excluded.reading, romanization = excluded.romanization, cloze_text = excluded.cloze_text, cloze_answer = excluded.cloze_answer;
  end if;
  get diagnostics saved = row_count;
  return jsonb_build_object('imported', saved, 'skipped', total - saved);
end $$;

create or replace function public.save_reading_content(p_id text, p_create boolean, p_passage jsonb, p_questions jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare question jsonb; question_order integer := 0; choices text[]; correct integer;
begin
  if not public.is_content_editor() then raise exception 'Editor permission required' using errcode = '42501'; end if;
  if p_id is null or char_length(p_id) not between 1 and 200 or p_create is null
    or jsonb_typeof(p_passage) is distinct from 'object' or coalesce(btrim(p_passage->>'title'), '') = ''
    or coalesce(btrim(p_passage->>'passage'), '') = '' or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Invalid reading content' using errcode = '22023';
  end if;
  if jsonb_array_length(p_questions) not between 1 and 100 then raise exception 'A reading requires 1 to 100 questions' using errcode = '22023'; end if;
  if p_create then
    insert into public.reading_passages(id, title, time_label, passage, sort_order, language_code)
      values(p_id, btrim(p_passage->>'title'), coalesce(p_passage->>'time_label',''), p_passage->>'passage', (p_passage->>'sort_order')::integer, coalesce(p_passage->>'language_code','en'));
  else
    update public.reading_passages set title = btrim(p_passage->>'title'), time_label = coalesce(p_passage->>'time_label',''), passage = p_passage->>'passage',
      sort_order = (p_passage->>'sort_order')::integer, language_code = coalesce(p_passage->>'language_code', language_code) where id = p_id;
    if not found then raise exception 'Reading not found' using errcode = 'P0002'; end if;
  end if;
  delete from public.reading_questions where reading_id = p_id;
  for question in select value from jsonb_array_elements(p_questions) loop
    if coalesce(btrim(question->>'prompt'),'') = '' or jsonb_typeof(question->'options') is distinct from 'array' then raise exception 'Invalid question' using errcode = '22023'; end if;
    select array_agg(value order by ordinality) into choices from jsonb_array_elements_text(question->'options') with ordinality;
    if exists (select 1 from unnest(choices) choice where choice is null or btrim(choice) = '') then raise exception 'Empty answer option' using errcode = '22023'; end if;
    correct := (question->>'answer_index')::integer;
    insert into public.reading_questions(reading_id, sort_order, prompt, options, answer_index, explanation)
      values(p_id, question_order, btrim(question->>'prompt'), choices, correct, coalesce(question->>'explanation',''));
    question_order := question_order + 1;
  end loop;
end $$;

-- The API's legacy "word" field now contains the immutable card ID.
create or replace function public.save_vocabulary_srs(p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid reviews' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text) > 1048576 then raise exception 'Review limit exceeded' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r group by r->>'word' having count(*) > 1) then raise exception 'Duplicate review cards' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item->'word') is distinct from 'string' or jsonb_typeof(item->'card') is distinct from 'object'
      or jsonb_typeof(item->'reviewed_at') is distinct from 'string' or jsonb_typeof(item->'rating') is distinct from 'number' then raise exception 'Invalid review' using errcode = '22023'; end if;
    if (item->>'reviewed_at')::timestamptz > now() + interval '5 minutes' or (item->>'reviewed_at')::timestamptz < '2000-01-01'::timestamptz then raise exception 'Invalid review time' using errcode = '22023'; end if;
    insert into public.vocabulary_srs(user_id, card_id, card, rating, due, reviewed_at)
      values(auth.uid(), item->>'word', item->'card', (item->>'rating')::smallint, (item->'card'->>'due')::timestamptz, (item->>'reviewed_at')::timestamptz)
      on conflict(user_id, card_id) do update set card = excluded.card, rating = excluded.rating, due = excluded.due, reviewed_at = excluded.reviewed_at
      where public.vocabulary_srs.reviewed_at < excluded.reviewed_at;
  end loop;
end $$;

create or replace function public.save_vocabulary_practice(p_rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid results' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text) > 1048576 then raise exception 'Practice limit exceeded' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r group by r->>'word' having count(*) > 1) then raise exception 'Duplicate cards' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item->'word') is distinct from 'string' or jsonb_typeof(item->'mode') is distinct from 'string' or jsonb_typeof(item->'needs_retry') is distinct from 'boolean'
      or jsonb_typeof(item->'last_answer') is distinct from 'string' or jsonb_typeof(item->'answered_at') is distinct from 'string' then raise exception 'Invalid result' using errcode = '22023'; end if;
    if (item->>'answered_at')::timestamptz < '2000-01-01'::timestamptz or (item->>'answered_at')::timestamptz > now() + interval '5 minutes' then raise exception 'Invalid answer time' using errcode = '22023'; end if;
    insert into public.vocabulary_practice(user_id, card_id, mode, needs_retry, last_answer, answered_at)
      values(auth.uid(), item->>'word', item->>'mode', (item->>'needs_retry')::boolean, item->>'last_answer', (item->>'answered_at')::timestamptz)
      on conflict(user_id, card_id) do update set mode = excluded.mode, needs_retry = excluded.needs_retry, last_answer = excluded.last_answer, answered_at = excluded.answered_at
      where public.vocabulary_practice.answered_at < excluded.answered_at;
  end loop;
end $$;

revoke all on function public.protect_content_identity() from public, anon;
grant execute on function public.protect_content_identity() to authenticated;
revoke all on function public.import_vocabulary_words(jsonb, text), public.save_reading_content(text, boolean, jsonb, jsonb), public.save_vocabulary_srs(jsonb), public.save_vocabulary_practice(jsonb) from public, anon;
grant execute on function public.import_vocabulary_words(jsonb, text), public.save_reading_content(text, boolean, jsonb, jsonb), public.save_vocabulary_srs(jsonb), public.save_vocabulary_practice(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
