begin;

create table if not exists public.vocabulary_groups (
  id text primary key,
  title text not null,
  sort_order integer not null default 0
);

create table if not exists public.vocabulary_words (
  word text primary key check (char_length(word) between 1 and 200),
  group_id text not null references public.vocabulary_groups(id) on delete cascade,
  meaning text not null,
  example text not null default '',
  sort_order integer not null default 0
);

create index if not exists vocabulary_words_group_order_idx
  on public.vocabulary_words (group_id, sort_order);

create table if not exists public.reading_passages (
  id text primary key,
  title text not null,
  time_label text not null default '',
  passage text not null,
  sort_order integer not null default 0
);

create table if not exists public.reading_questions (
  reading_id text not null references public.reading_passages(id) on delete cascade,
  sort_order integer not null,
  prompt text not null,
  options text[] not null check (cardinality(options) between 2 and 10),
  answer_index integer not null check (answer_index >= 0 and answer_index < cardinality(options)),
  explanation text not null default '',
  primary key (reading_id, sort_order)
);

alter table public.vocabulary_groups enable row level security;
alter table public.vocabulary_words enable row level security;
alter table public.reading_passages enable row level security;
alter table public.reading_questions enable row level security;

revoke all on public.vocabulary_groups, public.vocabulary_words,
  public.reading_passages, public.reading_questions from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.vocabulary_groups, public.vocabulary_words,
  public.reading_passages, public.reading_questions to anon, authenticated;

drop policy if exists "Read lesson groups" on public.vocabulary_groups;
create policy "Read lesson groups" on public.vocabulary_groups for select to anon, authenticated using (true);
drop policy if exists "Read lesson vocabulary" on public.vocabulary_words;
create policy "Read lesson vocabulary" on public.vocabulary_words for select to anon, authenticated using (true);
drop policy if exists "Read lesson passages" on public.reading_passages;
create policy "Read lesson passages" on public.reading_passages for select to anon, authenticated using (true);
drop policy if exists "Read lesson questions" on public.reading_questions;
create policy "Read lesson questions" on public.reading_questions for select to anon, authenticated using (true);

create table if not exists public.vocabulary_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null check (char_length(word) between 1 and 200),
  is_known boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, word)
);

create table if not exists public.reading_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reading_id text not null check (char_length(reading_id) between 1 and 200),
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  score integer not null check (score >= 0),
  total integer not null check (total between 1 and 100 and score <= total),
  completed_at timestamptz not null default now(),
  check (jsonb_array_length(answers) = total)
);

create index if not exists reading_attempts_user_completed_idx
  on public.reading_attempts (user_id, completed_at desc);

alter table public.vocabulary_progress enable row level security;
alter table public.reading_attempts enable row level security;

revoke all on public.vocabulary_progress, public.reading_attempts from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.vocabulary_progress to authenticated;
grant select, insert on public.reading_attempts to authenticated;

drop policy if exists "Read own vocabulary progress" on public.vocabulary_progress;
create policy "Read own vocabulary progress" on public.vocabulary_progress
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Insert own vocabulary progress" on public.vocabulary_progress;
create policy "Insert own vocabulary progress" on public.vocabulary_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own vocabulary progress" on public.vocabulary_progress;
create policy "Update own vocabulary progress" on public.vocabulary_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Read own reading attempts" on public.reading_attempts;
create policy "Read own reading attempts" on public.reading_attempts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Insert own reading attempts" on public.reading_attempts;
create policy "Insert own reading attempts" on public.reading_attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);

commit;
