-- Momotime データベース定義
-- 新しい Supabase プロジェクトの「SQL Editor」に貼り付けて一度だけ実行する。
-- （何度実行してもエラーにならないように書いてある）

-- =========================================================
-- テーブル
-- =========================================================

create table if not exists public."Users" (
	id uuid primary key references auth.users (id) on delete cascade,
	name text not null,
	handle_id text not null unique,
	avatar_url text,
	created_at timestamptz not null default now()
);

-- 授業マスタ。同じ授業を取っている学生で共有する
create table if not exists public."Classes" (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	teacher text,
	room text,
	day_of_week smallint not null check (day_of_week between 0 and 6),
	period smallint not null check (period between 1 and 7),
	is_remote boolean not null default false,
	created_at timestamptz not null default now(),
	unique (name, day_of_week, period)
);

create table if not exists public."User_Classes" (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public."Users" (id) on delete cascade,
	class_id uuid not null references public."Classes" (id) on delete cascade,
	color text,
	created_at timestamptz not null default now(),
	unique (user_id, class_id)
);

create table if not exists public."Tasks" (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public."Users" (id) on delete cascade,
	class_id uuid references public."Classes" (id) on delete set null,
	title text not null,
	deadline timestamptz,
	is_completed boolean not null default false,
	created_at timestamptz not null default now()
);

create table if not exists public."Follows" (
	follower_id uuid not null references public."Users" (id) on delete cascade,
	followed_id uuid not null references public."Users" (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (follower_id, followed_id),
	check (follower_id <> followed_id)
);

create table if not exists public."Notifications" (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public."Users" (id) on delete cascade,
	type text not null,
	from_user_id uuid not null references public."Users" (id) on delete cascade,
	from_user_name text not null,
	is_read boolean not null default false,
	created_at timestamptz not null default now()
);

create index if not exists user_classes_user_id_idx on public."User_Classes" (user_id);
create index if not exists tasks_user_id_idx on public."Tasks" (user_id);
create index if not exists follows_followed_id_idx on public."Follows" (followed_id);
create index if not exists notifications_user_id_idx on public."Notifications" (user_id, created_at desc);

-- =========================================================
-- 新規登録時に Users 行を自動作成
-- （メール確認ありの場合、登録直後はセッションが無くクライアントから作れないため）
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
	desired_handle text := nullif(new.raw_user_meta_data ->> 'handle_id', '');
begin
	-- ID が既に使われていたら user_xxxxxxxx にする（プロフィールから後で変更可）
	if desired_handle is null or exists (select 1 from public."Users" where handle_id = desired_handle) then
		desired_handle := 'user_' || left(new.id::text, 8);
	end if;

	insert into public."Users" (id, name, handle_id)
	values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'User'), desired_handle)
	on conflict (id) do nothing;
	return new;
end;
$$;

-- トリガー専用。API (/rest/v1/rpc) から直接呼べないようにする
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();

-- =========================================================
-- Row Level Security
-- =========================================================

alter table public."Users" enable row level security;
alter table public."Classes" enable row level security;
alter table public."User_Classes" enable row level security;
alter table public."Tasks" enable row level security;
alter table public."Follows" enable row level security;
alter table public."Notifications" enable row level security;

-- Users: ログインユーザーは全員分を閲覧可（ユーザー検索・友達表示）。編集は本人のみ
drop policy if exists "users_select" on public."Users";
create policy "users_select" on public."Users" for select to authenticated using (true);
drop policy if exists "users_insert_self" on public."Users";
create policy "users_insert_self" on public."Users" for insert to authenticated with check (id = auth.uid());
drop policy if exists "users_update_self" on public."Users";
create policy "users_update_self" on public."Users" for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Classes: 共有マスタなのでログインユーザーは閲覧・追加・更新可（削除は不可）
drop policy if exists "classes_select" on public."Classes";
create policy "classes_select" on public."Classes" for select to authenticated using (true);
drop policy if exists "classes_insert" on public."Classes";
create policy "classes_insert" on public."Classes" for insert to authenticated with check (true);
drop policy if exists "classes_update" on public."Classes";
create policy "classes_update" on public."Classes" for update to authenticated using (true) with check (true);

-- User_Classes: 友達の時間割を表示するため閲覧はログインユーザー全員。変更は本人のみ
drop policy if exists "user_classes_select" on public."User_Classes";
create policy "user_classes_select" on public."User_Classes" for select to authenticated using (true);
drop policy if exists "user_classes_insert_own" on public."User_Classes";
create policy "user_classes_insert_own" on public."User_Classes" for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "user_classes_update_own" on public."User_Classes";
create policy "user_classes_update_own" on public."User_Classes" for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "user_classes_delete_own" on public."User_Classes";
create policy "user_classes_delete_own" on public."User_Classes" for delete to authenticated using (user_id = auth.uid());

-- Tasks: 本人のみ
drop policy if exists "tasks_own" on public."Tasks";
create policy "tasks_own" on public."Tasks" for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Follows: フォロー数表示のため閲覧は全員。フォロー/解除は本人のみ
drop policy if exists "follows_select" on public."Follows";
create policy "follows_select" on public."Follows" for select to authenticated using (true);
drop policy if exists "follows_insert_own" on public."Follows";
create policy "follows_insert_own" on public."Follows" for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "follows_delete_own" on public."Follows";
create policy "follows_delete_own" on public."Follows" for delete to authenticated using (follower_id = auth.uid());

-- Notifications: 受け取った本人が閲覧・既読化。送信は「自分から」のものだけ作成可
drop policy if exists "notifications_select_own" on public."Notifications";
create policy "notifications_select_own" on public."Notifications" for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications_update_own" on public."Notifications";
create policy "notifications_update_own" on public."Notifications" for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications_insert_from_self" on public."Notifications";
create policy "notifications_insert_from_self" on public."Notifications" for insert to authenticated with check (from_user_id = auth.uid());

-- =========================================================
-- リアルタイム（通知ベル）
-- =========================================================

do $$
begin
	if not exists (
		select 1 from pg_publication_tables
		where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'Notifications'
	) then
		alter publication supabase_realtime add table public."Notifications";
	end if;
end $$;

-- =========================================================
-- ストレージ（アバター画像）: 公開読み取り、アップロードは自分のフォルダ (<user_id>/...) のみ
-- =========================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
	with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update to authenticated
	using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete to authenticated
	using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
