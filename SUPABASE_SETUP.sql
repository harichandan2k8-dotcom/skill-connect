create table if not exists skill_connect_store (
  id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone default now()
);

alter table skill_connect_store enable row level security;

drop policy if exists "skill connect demo read" on skill_connect_store;
drop policy if exists "skill connect demo insert" on skill_connect_store;
drop policy if exists "skill connect demo update" on skill_connect_store;
drop policy if exists "skill connect demo delete" on skill_connect_store;

create policy "skill connect demo read"
on skill_connect_store
for select
using (true);

create policy "skill connect demo insert"
on skill_connect_store
for insert
with check (true);

create policy "skill connect demo update"
on skill_connect_store
for update
using (true)
with check (true);

create policy "skill connect demo delete"
on skill_connect_store
for delete
using (true);
