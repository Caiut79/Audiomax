create extension if not exists pgcrypto;

create table if not exists public.crm_clients (
  id text primary key,
  name text not null,
  phone text not null,
  email text not null default '',
  city text not null,
  address text not null default '',
  segment text not null,
  preferred_contact text not null default 'telefono' check (preferred_contact in ('telefono', 'email', 'whatsapp')),
  notes text not null default '',
  favorite_brands text not null default '',
  last_contact date not null,
  status text not null check (status in ('attivo', 'lead', 'vip')),
  privacy_profile jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_clients
  add column if not exists email text not null default '';

alter table public.crm_clients
  add column if not exists address text not null default '';

alter table public.crm_clients
  add column if not exists privacy_profile jsonb;

alter table public.crm_clients
  add column if not exists preferred_contact text not null default 'telefono';

alter table public.crm_clients
  add column if not exists notes text not null default '';

alter table public.crm_clients
  add column if not exists favorite_brands text not null default '';

create table if not exists public.crm_quotes (
  id text primary key,
  customer_name text not null,
  project_type text not null,
  value numeric(12, 2) not null,
  stage text not null check (stage in ('bozza', 'trattativa', 'confermato')),
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_appointments (
  id text primary key,
  title text not null,
  customer_name text not null,
  appointment_type text not null default 'negozio' check (
    appointment_type in ('negozio', 'uscita', 'installazione', 'assistenza', 'sopralluogo')
  ),
  location_type text not null check (location_type in ('showroom', 'domicilio', 'officina')),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60,
  technician text not null,
  linked_quote_id text,
  status text not null check (status in ('programmato', 'in-corso', 'chiuso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_appointments
  add column if not exists appointment_type text not null default 'negozio';

alter table public.crm_appointments
  add column if not exists duration_minutes integer not null default 60;

alter table public.crm_appointments
  add column if not exists linked_quote_id text;

create table if not exists public.crm_inventory_items (
  id text primary key,
  sku text not null,
  barcode text not null default '',
  name text not null,
  category text not null,
  usage_type text not null default 'rivendita' check (usage_type in ('rivendita', 'uso-negozio')),
  stock integer not null default 0,
  min_stock integer not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  sale_price numeric(12, 2) not null default 0,
  supplier text not null default '',
  location text not null default '',
  status text not null check (status in ('disponibile', 'bassa-scorta', 'esaurito')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_inventory_lots (
  id text primary key,
  inventory_item_id text not null references public.crm_inventory_items(id) on delete cascade,
  lot_code text not null,
  supplier text not null,
  received_date date not null,
  received_quantity integer not null default 0,
  available_quantity integer not null default 0,
  reserved_quantity integer not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  expiry_date date,
  shelf_code text not null,
  purchase_document_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_inventory_movements (
  id text primary key,
  inventory_item_id text not null references public.crm_inventory_items(id) on delete cascade,
  lot_id text references public.crm_inventory_lots(id) on delete set null,
  movement_type text not null check (movement_type in ('carico', 'scarico', 'rettifica+/-', 'prenotazione')),
  quantity numeric(12, 2) not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  total_cost numeric(12, 2) not null default 0,
  document_number text not null default '',
  reason text not null default '',
  operator text not null default '',
  source_module text not null check (source_module in ('magazzino', 'cassa', 'tecnico', 'inventario')),
  moved_at timestamptz not null default now()
);

create table if not exists public.crm_inventory_positions (
  id text primary key,
  code text not null unique,
  zone text not null,
  shelf text not null,
  level text not null,
  occupied_inventory_item_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_inventory_purchases (
  id text primary key,
  inventory_item_id text not null references public.crm_inventory_items(id) on delete cascade,
  lot_id text not null references public.crm_inventory_lots(id) on delete cascade,
  supplier text not null,
  document_number text not null,
  received_date date not null,
  quantity integer not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  transport_cost numeric(12, 2) not null default 0,
  customs_cost numeric(12, 2) not null default 0,
  packaging_cost numeric(12, 2) not null default 0,
  total_cost numeric(12, 2) not null default 0,
  linked_expense_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_inventory_adjustments (
  id text primary key,
  inventory_item_id text not null references public.crm_inventory_items(id) on delete cascade,
  lot_id text references public.crm_inventory_lots(id) on delete set null,
  previous_quantity integer not null default 0,
  actual_quantity integer not null default 0,
  delta_quantity integer not null default 0,
  reason text not null default '',
  operator text not null default '',
  adjusted_at timestamptz not null default now()
);

create table if not exists public.crm_inventory_audit_log (
  id text primary key,
  entity_type text not null check (entity_type in ('inventory-item', 'lot', 'movement', 'position', 'adjustment')),
  entity_id text not null,
  action text not null check (action in ('create', 'update', 'delete', 'consume-fifo', 'adjust')),
  detail text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.crm_cash_products (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(12, 2) not null default 0,
  shortcut boolean not null default true,
  pricing_mode text not null default 'fisso' check (pricing_mode in ('fisso', 'quantita', 'ora')),
  linked_inventory_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_cash_transactions (
  id text primary key,
  reference text not null,
  client_id text,
  customer_name text not null,
  payment_method text not null check (payment_method in ('contanti', 'pos', 'bonifico', 'misto')),
  status text not null check (status in ('pagato', 'sospeso')),
  created_at timestamptz not null,
  notes text not null default '',
  received_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  change_amount numeric(12, 2) not null default 0,
  lines jsonb not null default '[]'::jsonb
);

create table if not exists public.crm_cash_shifts (
  id text primary key,
  label text not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  transactions_count integer not null default 0,
  paid_total numeric(12, 2) not null default 0,
  suspended_total numeric(12, 2) not null default 0,
  by_method jsonb not null default '{"contanti":0,"pos":0,"bonifico":0,"misto":0}'::jsonb
);

create table if not exists public.crm_service_tickets (
  id text primary key,
  title text not null,
  customer_name text not null,
  service_type text not null check (service_type in ('installazione', 'assistenza', 'diagnosi')),
  location_type text not null check (location_type in ('showroom', 'domicilio', 'officina')),
  priority text not null check (priority in ('alta', 'media', 'bassa')),
  status text not null check (status in ('aperto', 'pianificato', 'in-lavorazione', 'chiuso')),
  technician text not null,
  linked_quote_id text,
  linked_appointment_id text,
  material_summary text not null default '',
  material_cost numeric(12, 2) not null default 0,
  material_lines jsonb not null default '[]'::jsonb,
  work_summary text not null default '',
  resolution_status text not null default 'da-verificare' check (
    resolution_status in ('da-verificare', 'risolto', 'parziale', 'non-risolto')
  ),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_service_tickets
  add column if not exists material_summary text not null default '';

alter table public.crm_service_tickets
  add column if not exists material_cost numeric(12, 2) not null default 0;

alter table public.crm_service_tickets
  add column if not exists material_lines jsonb not null default '[]'::jsonb;

alter table public.crm_service_tickets
  add column if not exists work_summary text not null default '';

alter table public.crm_service_tickets
  add column if not exists resolution_status text not null default 'da-verificare';

alter table public.crm_service_tickets
  add column if not exists closed_at timestamptz;

alter table public.crm_cash_products
  add column if not exists linked_inventory_item_id text;

alter table public.crm_cash_products
  add column if not exists pricing_mode text not null default 'fisso';

alter table public.crm_cash_transactions
  add column if not exists client_id text;

alter table public.crm_cash_transactions
  add column if not exists lines jsonb not null default '[]'::jsonb;

alter table public.crm_clients enable row level security;
alter table public.crm_quotes enable row level security;
alter table public.crm_appointments enable row level security;
alter table public.crm_inventory_items enable row level security;
alter table public.crm_inventory_lots enable row level security;
alter table public.crm_inventory_movements enable row level security;
alter table public.crm_inventory_positions enable row level security;
alter table public.crm_inventory_purchases enable row level security;
alter table public.crm_inventory_adjustments enable row level security;
alter table public.crm_inventory_audit_log enable row level security;
alter table public.crm_cash_products enable row level security;
alter table public.crm_cash_transactions enable row level security;
alter table public.crm_cash_shifts enable row level security;
alter table public.crm_service_tickets enable row level security;

drop policy if exists "publishable can read clients" on public.crm_clients;
drop policy if exists "publishable can insert clients" on public.crm_clients;
drop policy if exists "publishable can update clients" on public.crm_clients;
drop policy if exists "publishable can delete clients" on public.crm_clients;

create policy "publishable can read clients"
on public.crm_clients
for select
to anon
using (true);

create policy "publishable can insert clients"
on public.crm_clients
for insert
to anon
with check (true);

create policy "publishable can update clients"
on public.crm_clients
for update
to anon
using (true)
with check (true);

create policy "publishable can delete clients"
on public.crm_clients
for delete
to anon
using (true);

drop policy if exists "publishable can read quotes" on public.crm_quotes;
drop policy if exists "publishable can insert quotes" on public.crm_quotes;
drop policy if exists "publishable can update quotes" on public.crm_quotes;
drop policy if exists "publishable can delete quotes" on public.crm_quotes;

create policy "publishable can read quotes"
on public.crm_quotes
for select
to anon
using (true);

create policy "publishable can insert quotes"
on public.crm_quotes
for insert
to anon
with check (true);

create policy "publishable can update quotes"
on public.crm_quotes
for update
to anon
using (true)
with check (true);

create policy "publishable can delete quotes"
on public.crm_quotes
for delete
to anon
using (true);

drop policy if exists "publishable can read appointments" on public.crm_appointments;
drop policy if exists "publishable can insert appointments" on public.crm_appointments;
drop policy if exists "publishable can update appointments" on public.crm_appointments;
drop policy if exists "publishable can delete appointments" on public.crm_appointments;

create policy "publishable can read appointments"
on public.crm_appointments
for select
to anon
using (true);

create policy "publishable can insert appointments"
on public.crm_appointments
for insert
to anon
with check (true);

create policy "publishable can update appointments"
on public.crm_appointments
for update
to anon
using (true)
with check (true);

create policy "publishable can delete appointments"
on public.crm_appointments
for delete
to anon
using (true);

drop policy if exists "publishable can read inventory items" on public.crm_inventory_items;
drop policy if exists "publishable can insert inventory items" on public.crm_inventory_items;
drop policy if exists "publishable can update inventory items" on public.crm_inventory_items;
drop policy if exists "publishable can delete inventory items" on public.crm_inventory_items;

create policy "publishable can read inventory items"
on public.crm_inventory_items
for select
to anon
using (true);

create policy "publishable can insert inventory items"
on public.crm_inventory_items
for insert
to anon
with check (true);

create policy "publishable can update inventory items"
on public.crm_inventory_items
for update
to anon
using (true)
with check (true);

create policy "publishable can delete inventory items"
on public.crm_inventory_items
for delete
to anon
using (true);

drop policy if exists "publishable can read cash products" on public.crm_cash_products;
drop policy if exists "publishable can insert cash products" on public.crm_cash_products;
drop policy if exists "publishable can update cash products" on public.crm_cash_products;
drop policy if exists "publishable can delete cash products" on public.crm_cash_products;

create policy "publishable can read cash products"
on public.crm_cash_products
for select
to anon
using (true);

create policy "publishable can insert cash products"
on public.crm_cash_products
for insert
to anon
with check (true);

create policy "publishable can update cash products"
on public.crm_cash_products
for update
to anon
using (true)
with check (true);

create policy "publishable can delete cash products"
on public.crm_cash_products
for delete
to anon
using (true);

drop policy if exists "publishable can read cash transactions" on public.crm_cash_transactions;
drop policy if exists "publishable can insert cash transactions" on public.crm_cash_transactions;
drop policy if exists "publishable can update cash transactions" on public.crm_cash_transactions;
drop policy if exists "publishable can delete cash transactions" on public.crm_cash_transactions;

create policy "publishable can read cash transactions"
on public.crm_cash_transactions
for select
to anon
using (true);

create policy "publishable can insert cash transactions"
on public.crm_cash_transactions
for insert
to anon
with check (true);

create policy "publishable can update cash transactions"
on public.crm_cash_transactions
for update
to anon
using (true)
with check (true);

create policy "publishable can delete cash transactions"
on public.crm_cash_transactions
for delete
to anon
using (true);

drop policy if exists "publishable can read cash shifts" on public.crm_cash_shifts;
drop policy if exists "publishable can insert cash shifts" on public.crm_cash_shifts;
drop policy if exists "publishable can update cash shifts" on public.crm_cash_shifts;
drop policy if exists "publishable can delete cash shifts" on public.crm_cash_shifts;

create policy "publishable can read cash shifts"
on public.crm_cash_shifts
for select
to anon
using (true);

create policy "publishable can insert cash shifts"
on public.crm_cash_shifts
for insert
to anon
with check (true);

create policy "publishable can update cash shifts"
on public.crm_cash_shifts
for update
to anon
using (true)
with check (true);

create policy "publishable can delete cash shifts"
on public.crm_cash_shifts
for delete
to anon
using (true);

drop policy if exists "publishable can read service tickets" on public.crm_service_tickets;
drop policy if exists "publishable can insert service tickets" on public.crm_service_tickets;
drop policy if exists "publishable can update service tickets" on public.crm_service_tickets;
drop policy if exists "publishable can delete service tickets" on public.crm_service_tickets;

create policy "publishable can read service tickets"
on public.crm_service_tickets
for select
to anon
using (true);

create policy "publishable can insert service tickets"
on public.crm_service_tickets
for insert
to anon
with check (true);

create policy "publishable can update service tickets"
on public.crm_service_tickets
for update
to anon
using (true)
with check (true);

create policy "publishable can delete service tickets"
on public.crm_service_tickets
for delete
to anon
using (true);

drop policy if exists "publishable can read inventory lots" on public.crm_inventory_lots;
drop policy if exists "publishable can insert inventory lots" on public.crm_inventory_lots;
drop policy if exists "publishable can update inventory lots" on public.crm_inventory_lots;
drop policy if exists "publishable can delete inventory lots" on public.crm_inventory_lots;

create policy "publishable can read inventory lots"
on public.crm_inventory_lots
for select
to anon
using (true);

create policy "publishable can insert inventory lots"
on public.crm_inventory_lots
for insert
to anon
with check (true);

create policy "publishable can update inventory lots"
on public.crm_inventory_lots
for update
to anon
using (true)
with check (true);

create policy "publishable can delete inventory lots"
on public.crm_inventory_lots
for delete
to anon
using (true);

drop policy if exists "publishable can read inventory movements" on public.crm_inventory_movements;
drop policy if exists "publishable can insert inventory movements" on public.crm_inventory_movements;
drop policy if exists "publishable can update inventory movements" on public.crm_inventory_movements;
drop policy if exists "publishable can delete inventory movements" on public.crm_inventory_movements;

create policy "publishable can read inventory movements"
on public.crm_inventory_movements
for select
to anon
using (true);

create policy "publishable can insert inventory movements"
on public.crm_inventory_movements
for insert
to anon
with check (true);

create policy "publishable can update inventory movements"
on public.crm_inventory_movements
for update
to anon
using (true)
with check (true);

create policy "publishable can delete inventory movements"
on public.crm_inventory_movements
for delete
to anon
using (true);

drop policy if exists "publishable can read inventory positions" on public.crm_inventory_positions;
drop policy if exists "publishable can insert inventory positions" on public.crm_inventory_positions;
drop policy if exists "publishable can update inventory positions" on public.crm_inventory_positions;
drop policy if exists "publishable can delete inventory positions" on public.crm_inventory_positions;

create policy "publishable can read inventory positions"
on public.crm_inventory_positions
for select
to anon
using (true);

create policy "publishable can insert inventory positions"
on public.crm_inventory_positions
for insert
to anon
with check (true);

create policy "publishable can update inventory positions"
on public.crm_inventory_positions
for update
to anon
using (true)
with check (true);

create policy "publishable can delete inventory positions"
on public.crm_inventory_positions
for delete
to anon
using (true);

drop policy if exists "publishable can read inventory purchases" on public.crm_inventory_purchases;
drop policy if exists "publishable can insert inventory purchases" on public.crm_inventory_purchases;
drop policy if exists "publishable can update inventory purchases" on public.crm_inventory_purchases;
drop policy if exists "publishable can delete inventory purchases" on public.crm_inventory_purchases;

create policy "publishable can read inventory purchases"
on public.crm_inventory_purchases
for select
to anon
using (true);

create policy "publishable can insert inventory purchases"
on public.crm_inventory_purchases
for insert
to anon
with check (true);

create policy "publishable can update inventory purchases"
on public.crm_inventory_purchases
for update
to anon
using (true)
with check (true);

create policy "publishable can delete inventory purchases"
on public.crm_inventory_purchases
for delete
to anon
using (true);

drop policy if exists "publishable can read inventory adjustments" on public.crm_inventory_adjustments;
drop policy if exists "publishable can insert inventory adjustments" on public.crm_inventory_adjustments;
drop policy if exists "publishable can update inventory adjustments" on public.crm_inventory_adjustments;
drop policy if exists "publishable can delete inventory adjustments" on public.crm_inventory_adjustments;

create policy "publishable can read inventory adjustments"
on public.crm_inventory_adjustments
for select
to anon
using (true);

create policy "publishable can insert inventory adjustments"
on public.crm_inventory_adjustments
for insert
to anon
with check (true);

create policy "publishable can update inventory adjustments"
on public.crm_inventory_adjustments
for update
to anon
using (true)
with check (true);

create policy "publishable can delete inventory adjustments"
on public.crm_inventory_adjustments
for delete
to anon
using (true);

drop policy if exists "publishable can read inventory audit log" on public.crm_inventory_audit_log;
drop policy if exists "publishable can insert inventory audit log" on public.crm_inventory_audit_log;
drop policy if exists "publishable can update inventory audit log" on public.crm_inventory_audit_log;
drop policy if exists "publishable can delete inventory audit log" on public.crm_inventory_audit_log;

create policy "publishable can read inventory audit log"
on public.crm_inventory_audit_log
for select
to anon
using (true);

create policy "publishable can insert inventory audit log"
on public.crm_inventory_audit_log
for insert
to anon
with check (true);

create policy "publishable can update inventory audit log"
on public.crm_inventory_audit_log
for update
to anon
using (true)
with check (true);

create policy "publishable can delete inventory audit log"
on public.crm_inventory_audit_log
for delete
to anon
using (true);

create table if not exists public.categorie_spese (
  id text primary key,
  codice text not null unique,
  nome text not null,
  categoria_padre text not null check (categoria_padre in ('amministrative', 'utenze', 'operative', 'magazzino')),
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fornitori (
  id text primary key,
  ragione_sociale text not null,
  partita_iva text not null,
  indirizzo text not null default '',
  contatto text not null default '',
  email text not null default '',
  telefono text not null default '',
  tipo_fornitura text not null default '',
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.metodi_pagamento (
  id text primary key,
  nome text not null check (nome in ('bonifico', 'rid', 'carta-credito', 'paypal', 'contanti')),
  provider text not null default '',
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registro_spese (
  id text primary key,
  descrizione text not null,
  importo_lordo numeric(12, 2) not null default 0,
  aliquota_iva numeric(5, 2) not null default 22,
  imponibile numeric(12, 2) not null default 0,
  imposta_iva numeric(12, 2) not null default 0,
  data_spesa date not null,
  data_scadenza date not null,
  categoria_id text not null references public.categorie_spese(id) on delete restrict,
  fornitore_id text references public.fornitori(id) on delete set null,
  fornitore_generico text,
  metodo_pagamento_id text not null references public.metodi_pagamento(id) on delete restrict,
  tipo_pagamento text not null check (tipo_pagamento in ('singolo', 'rateale', 'ricorrente')),
  frequenza_ricorrente text check (frequenza_ricorrente in ('mensile', 'trimestrale', 'annuale')),
  stato text not null check (stato in ('prevista', 'pagata', 'parziale', 'annullata')),
  note text not null default '',
  allegato_nome text,
  codice_progetto text,
  centro_costo text,
  source_type text not null default 'manuale' check (source_type in ('manuale', 'magazzino')),
  source_reference_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spese_rateali (
  id text primary key,
  spesa_id text not null references public.registro_spese(id) on delete cascade,
  numero_rata integer not null default 1,
  data_scadenza date not null,
  importo numeric(12, 2) not null default 0,
  stato text not null check (stato in ('prevista', 'pagata', 'scaduta')),
  giorni_preavviso_notifica integer not null default 7 check (giorni_preavviso_notifica between 1 and 30),
  pagata_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifiche (
  id text primary key,
  spesa_id text not null references public.registro_spese(id) on delete cascade,
  rata_id text references public.spese_rateali(id) on delete set null,
  canale text not null check (canale in ('push', 'email')),
  giorni_prima integer not null check (giorni_prima in (7, 3, 1)),
  inviato_il timestamptz not null default now(),
  letto_il timestamptz,
  created_at timestamptz not null default now()
);

alter table public.categorie_spese enable row level security;
alter table public.fornitori enable row level security;
alter table public.metodi_pagamento enable row level security;
alter table public.registro_spese enable row level security;
alter table public.spese_rateali enable row level security;
alter table public.notifiche enable row level security;

drop policy if exists "publishable can read categorie spese" on public.categorie_spese;
drop policy if exists "publishable can insert categorie spese" on public.categorie_spese;
drop policy if exists "publishable can update categorie spese" on public.categorie_spese;
drop policy if exists "publishable can delete categorie spese" on public.categorie_spese;

create policy "publishable can read categorie spese" on public.categorie_spese for select to anon using (true);
create policy "publishable can insert categorie spese" on public.categorie_spese for insert to anon with check (true);
create policy "publishable can update categorie spese" on public.categorie_spese for update to anon using (true) with check (true);
create policy "publishable can delete categorie spese" on public.categorie_spese for delete to anon using (true);

drop policy if exists "publishable can read fornitori spese" on public.fornitori;
drop policy if exists "publishable can insert fornitori spese" on public.fornitori;
drop policy if exists "publishable can update fornitori spese" on public.fornitori;
drop policy if exists "publishable can delete fornitori spese" on public.fornitori;

create policy "publishable can read fornitori spese" on public.fornitori for select to anon using (true);
create policy "publishable can insert fornitori spese" on public.fornitori for insert to anon with check (true);
create policy "publishable can update fornitori spese" on public.fornitori for update to anon using (true) with check (true);
create policy "publishable can delete fornitori spese" on public.fornitori for delete to anon using (true);

drop policy if exists "publishable can read metodi pagamento spese" on public.metodi_pagamento;
drop policy if exists "publishable can insert metodi pagamento spese" on public.metodi_pagamento;
drop policy if exists "publishable can update metodi pagamento spese" on public.metodi_pagamento;
drop policy if exists "publishable can delete metodi pagamento spese" on public.metodi_pagamento;

create policy "publishable can read metodi pagamento spese" on public.metodi_pagamento for select to anon using (true);
create policy "publishable can insert metodi pagamento spese" on public.metodi_pagamento for insert to anon with check (true);
create policy "publishable can update metodi pagamento spese" on public.metodi_pagamento for update to anon using (true) with check (true);
create policy "publishable can delete metodi pagamento spese" on public.metodi_pagamento for delete to anon using (true);

drop policy if exists "publishable can read registro spese" on public.registro_spese;
drop policy if exists "publishable can insert registro spese" on public.registro_spese;
drop policy if exists "publishable can update registro spese" on public.registro_spese;
drop policy if exists "publishable can delete registro spese" on public.registro_spese;

create policy "publishable can read registro spese" on public.registro_spese for select to anon using (true);
create policy "publishable can insert registro spese" on public.registro_spese for insert to anon with check (true);
create policy "publishable can update registro spese" on public.registro_spese for update to anon using (true) with check (true);
create policy "publishable can delete registro spese" on public.registro_spese for delete to anon using (true);

drop policy if exists "publishable can read spese rateali" on public.spese_rateali;
drop policy if exists "publishable can insert spese rateali" on public.spese_rateali;
drop policy if exists "publishable can update spese rateali" on public.spese_rateali;
drop policy if exists "publishable can delete spese rateali" on public.spese_rateali;

create policy "publishable can read spese rateali" on public.spese_rateali for select to anon using (true);
create policy "publishable can insert spese rateali" on public.spese_rateali for insert to anon with check (true);
create policy "publishable can update spese rateali" on public.spese_rateali for update to anon using (true) with check (true);
create policy "publishable can delete spese rateali" on public.spese_rateali for delete to anon using (true);

drop policy if exists "publishable can read notifiche spese" on public.notifiche;
drop policy if exists "publishable can insert notifiche spese" on public.notifiche;
drop policy if exists "publishable can update notifiche spese" on public.notifiche;
drop policy if exists "publishable can delete notifiche spese" on public.notifiche;

create policy "publishable can read notifiche spese" on public.notifiche for select to anon using (true);
create policy "publishable can insert notifiche spese" on public.notifiche for insert to anon with check (true);
create policy "publishable can update notifiche spese" on public.notifiche for update to anon using (true) with check (true);
create policy "publishable can delete notifiche spese" on public.notifiche for delete to anon using (true);
