-- ============================================================================
-- AudioMax26 — Multi-azienda (tenant) + Account, Licenze e Super Admin
-- ----------------------------------------------------------------------------
-- Da eseguire una sola volta nell'SQL Editor di Supabase.
-- Lo script è idempotente: può essere rieseguito senza danni.
--
-- Cosa fa:
--   1. Crea la tabella degli account (aziende + super admin) con stato licenza.
--   2. Aggiunge la colonna tenant_id a TUTTE le tabelle che iniziano con crm_.
--   3. Assegna i dati esistenti (quelli di prova) al tenant del super admin.
--   4. Registra l'account super admin indicato.
--
-- Isolamento dei dati: ogni riga appartiene a una azienda tramite tenant_id.
-- ============================================================================


-- ============================================================================
-- 1) TABELLA ACCOUNT / LICENZE
-- ============================================================================
create table if not exists public.app_accounts (
  id              uuid primary key default gen_random_uuid(),
  company_name    text        not null,
  email           text        not null,
  password_hash   text        not null,
  password_salt   text        not null,
  role            text        not null default 'azienda'
                              check (role in ('azienda', 'super-admin')),
  status          text        not null default 'attiva'
                              check (status in ('attiva', 'sospesa', 'eliminata')),
  -- Licenza a tempo: NULL significa "senza scadenza"
  license_expires_at timestamptz,
  license_notes   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_login_at   timestamptz,
  login_count     integer     not null default 0,
  suspended_at    timestamptz,
  deleted_at      timestamptz
);

-- L'email non deve mai distinguere maiuscole/minuscole
create unique index if not exists app_accounts_email_lower_key
  on public.app_accounts (lower(email));

-- Aggiorna automaticamente updated_at a ogni modifica
create or replace function public.app_accounts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_accounts_touch_updated_at on public.app_accounts;
create trigger app_accounts_touch_updated_at
  before update on public.app_accounts
  for each row execute function public.app_accounts_touch_updated_at();


-- ============================================================================
-- 2) ACCESSO ALLA TABELLA ACCOUNT (stesso stile delle altre tabelle del progetto)
-- ============================================================================
alter table public.app_accounts enable row level security;

drop policy if exists "publishable can read accounts"   on public.app_accounts;
drop policy if exists "publishable can insert accounts" on public.app_accounts;
drop policy if exists "publishable can update accounts" on public.app_accounts;
drop policy if exists "publishable can delete accounts" on public.app_accounts;

create policy "publishable can read accounts"
on public.app_accounts for select to anon using (true);

create policy "publishable can insert accounts"
on public.app_accounts for insert to anon with check (true);

create policy "publishable can update accounts"
on public.app_accounts for update to anon using (true) with check (true);

create policy "publishable can delete accounts"
on public.app_accounts for delete to anon using (true);

grant select, insert, update, delete on public.app_accounts to anon;


-- ============================================================================
-- 3) SUPER ADMIN (adotta i dati di prova già presenti)
-- ============================================================================
-- Password: Cla26091979.  (12 caratteri, punto incluso)
-- Hash PBKDF2-SHA256, 210000 iterazioni, 32 byte, salt univoco di 16 byte.
-- Per cambiarla: generare un nuovo salt e un nuovo hash con lo stesso metodo
-- e sostituire i due valori qui sotto.
insert into public.app_accounts
  (id, company_name, email, password_hash, password_salt, role, status)
values (
  '00000000-0000-0000-0000-000000000001',
  'Audiomax — Super Admin',
  'claudio.zampa@libero.it',
  '7eab037edf1b3205641a92bec199a45479616b78abd67e1e052f6c0f62145b87',
  'd15b72d195f7f9ceee0fb03699f05648',
  'super-admin',
  'attiva'
)
on conflict (id) do update set
  company_name  = excluded.company_name,
  email         = excluded.email,
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  role          = excluded.role;


-- ============================================================================
-- 4) COLONNA tenant_id SU TUTTE LE TABELLE crm_*
-- ============================================================================
-- Il ciclo è dinamico: copre automaticamente ogni tabella crm_ esistente e
-- anche quelle che verranno aggiunte in futuro.
do $$
declare
  v_tabella      text;
  v_super_admin  uuid := '00000000-0000-0000-0000-000000000001';
begin
  for v_tabella in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_type   = 'BASE TABLE'
      and starts_with(t.table_name, 'crm_')
    order by t.table_name
  loop
    -- 4a) colonna tenant_id
    execute format(
      'alter table public.%I add column if not exists tenant_id uuid',
      v_tabella
    );

    -- 4b) indice per velocizzare i filtri per azienda
    execute format(
      'create index if not exists %I on public.%I (tenant_id)',
      v_tabella || '_tenant_id_idx', v_tabella
    );

    -- 4c) vincolo verso app_accounts (elimina i dati se l'azienda viene eliminata)
    if not exists (
      select 1
      from pg_constraint
      where conname = v_tabella || '_tenant_id_fkey'
        and conrelid = ('public.' || v_tabella)::regclass
    ) then
      execute format(
        'alter table public.%I
           add constraint %I foreign key (tenant_id)
           references public.app_accounts(id) on delete cascade',
        v_tabella, v_tabella || '_tenant_id_fkey'
      );
    end if;

    -- 4d) i dati già presenti appartengono al super admin
    execute format(
      'update public.%I set tenant_id = %L where tenant_id is null',
      v_tabella, v_super_admin
    );
  end loop;
end $$;


-- ============================================================================
-- 5) VERIFICA
-- ============================================================================
-- Mostra gli account e quanti clienti ha ciascuno.
select
  a.company_name,
  a.email,
  a.role,
  a.status,
  (select count(*) from public.crm_clients c where c.tenant_id = a.id) as clienti
from public.app_accounts a
order by a.role, a.company_name;
