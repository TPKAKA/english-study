begin;

-- Stop on pre-existing case variants instead of silently deleting lesson data.
create unique index if not exists vocabulary_words_normalized_word_idx
  on public.vocabulary_words (lower(btrim(word)));

create or replace function public.import_vocabulary_words(p_rows jsonb, p_mode text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  item jsonb;
  saved integer;
  total integer;
begin
  if not public.is_content_editor() then
    raise exception 'Editor permission required' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('skip', 'update')
    or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Invalid import' using errcode = '22023';
  end if;
  total := jsonb_array_length(p_rows);
  if total not between 1 and 500 or octet_length(p_rows::text) > 1048576 then
    raise exception 'Import limit exceeded' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) row
    group by lower(btrim(row->>'word')) having count(*) > 1) then
    raise exception 'Duplicate words in import' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'word') is distinct from 'string'
      or jsonb_typeof(item->'meaning') is distinct from 'string'
      or jsonb_typeof(item->'group_id') is distinct from 'string'
      or jsonb_typeof(item->'ipa') is distinct from 'string'
      or jsonb_typeof(item->'example') is distinct from 'string'
      or char_length(btrim(item->>'word')) not between 1 and 200
      or char_length(btrim(item->>'meaning')) not between 1 and 2000
      or char_length(item->>'ipa') > 500 or char_length(item->>'example') > 5000
      or coalesce(item->>'sort_order', '') !~ '^[0-9]+$' then
      raise exception 'Invalid import row' using errcode = '22023';
    end if;
  end loop;
  if p_mode = 'skip' then
    insert into public.vocabulary_words (word, group_id, meaning, ipa, example, sort_order)
      select btrim(word), group_id, btrim(meaning), ipa, example, sort_order
      from jsonb_to_recordset(p_rows) as r(word text, group_id text, meaning text, ipa text, example text, sort_order integer)
      on conflict ((lower(btrim(word)))) do nothing;
  else
    insert into public.vocabulary_words (word, group_id, meaning, ipa, example, sort_order)
      select btrim(word), group_id, btrim(meaning), ipa, example, sort_order
      from jsonb_to_recordset(p_rows) as r(word text, group_id text, meaning text, ipa text, example text, sort_order integer)
      on conflict ((lower(btrim(word)))) do update set
        group_id = excluded.group_id, meaning = excluded.meaning, ipa = excluded.ipa,
        example = excluded.example, sort_order = excluded.sort_order;
  end if;
  get diagnostics saved = row_count;
  return jsonb_build_object('imported', saved, 'skipped', total - saved);
end;
$$;
revoke all on function public.import_vocabulary_words(jsonb, text) from public, anon;
grant execute on function public.import_vocabulary_words(jsonb, text) to authenticated;

commit;
