-- Fees, payments and the payment ledger.
--
-- Money rules
--   * Currency is INR only. Every amount is a bigint number of paise
--     (1 rupee = 100 paise). No floating point is used for money anywhere.
--   * Percentage discounts are converted to paise in application code using
--     round-half-up to the nearest paisa (src/lib/domain/money.ts) and stored
--     as an absolute discount_paise, so historical records never change when
--     a policy changes.
--   * Net payable for a fee line = amount_paise - discount_paise.
--   * Outstanding = net payable - sum of allocations from CAPTURED payments.
--   * Payments are immutable ledger entries. Mistakes are corrected by voiding
--     (with a reason) and recording a new payment, never by editing.

create table public.fee_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, name)
);
create trigger fee_categories_updated_at before update on public.fee_categories
  for each row execute function app.set_updated_at();

-- What a class pays for a category in a year, split into installments.
create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  class_id uuid not null,
  fee_category_id uuid not null,
  total_amount_paise bigint not null check (total_amount_paise > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (academic_year_id, class_id, fee_category_id),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete restrict,
  foreign key (school_id, class_id) references public.classes (school_id, id) on delete restrict,
  foreign key (school_id, fee_category_id) references public.fee_categories (school_id, id) on delete restrict
);
create trigger fee_structures_updated_at before update on public.fee_structures
  for each row execute function app.set_updated_at();

create table public.fee_installments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  fee_structure_id uuid not null,
  installment_no smallint not null check (installment_no between 1 and 12),
  label text not null,
  due_date date not null,
  amount_paise bigint not null check (amount_paise > 0),
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (fee_structure_id, installment_no),
  foreign key (school_id, fee_structure_id) references public.fee_structures (school_id, id) on delete cascade
);

-- Installments must add up to the structure total (checked at commit).
create or replace function app.check_installments_total()
returns trigger
language plpgsql
as $$
declare
  v_structure uuid;
  v_total bigint;
  v_sum bigint;
begin
  -- Record fields must be referenced in separate branches: PL/pgSQL resolves
  -- every field in an expression even when a CASE branch is not taken.
  if tg_table_name = 'fee_structures' then
    v_structure := new.id;
  elsif tg_op = 'DELETE' then
    v_structure := old.fee_structure_id;
  else
    v_structure := new.fee_structure_id;
  end if;
  select total_amount_paise into v_total from public.fee_structures where id = v_structure;
  if v_total is null then
    return null; -- structure deleted
  end if;
  select coalesce(sum(amount_paise), 0) into v_sum from public.fee_installments where fee_structure_id = v_structure;
  if v_sum <> v_total then
    raise exception 'Installments (% paise) must add up to the fee total (% paise)', v_sum, v_total
      using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger fee_structures_installments_total
  after insert or update on public.fee_structures
  deferrable initially deferred
  for each row execute function app.check_installments_total();
create constraint trigger fee_installments_total
  after insert or update or delete on public.fee_installments
  deferrable initially deferred
  for each row execute function app.check_installments_total();

-- One payable line per student (normally one per installment).
create table public.student_fee_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid not null,
  fee_category_id uuid not null,
  fee_installment_id uuid,
  description text not null check (char_length(description) between 2 and 200),
  due_date date not null,
  amount_paise bigint not null check (amount_paise > 0),
  discount_paise bigint not null default 0,
  discount_type text check (discount_type is null or discount_type in ('sibling', 'merit', 'staff_ward', 'scholarship', 'financial_aid', 'other')),
  discount_reason text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (student_id, fee_installment_id),
  check (discount_paise >= 0 and discount_paise <= amount_paise),
  check ((discount_paise = 0) or (discount_type is not null and discount_reason is not null)),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete restrict,
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete restrict,
  foreign key (school_id, fee_category_id) references public.fee_categories (school_id, id) on delete restrict,
  foreign key (school_id, fee_installment_id) references public.fee_installments (school_id, id) on delete restrict
);
create index student_fee_assignments_student_idx on public.student_fee_assignments (student_id, due_date);
create trigger student_fee_assignments_updated_at before update on public.student_fee_assignments
  for each row execute function app.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid not null,
  receipt_no text not null,
  amount_paise bigint not null check (amount_paise > 0),
  method text not null check (method in ('cash', 'upi', 'card', 'netbanking', 'cheque', 'bank_transfer', 'gateway')),
  -- offline: recorded by school staff; gateway: verified with the provider;
  -- sandbox: simulated checkout in demo schools. Sandbox rows are never real money.
  mode text not null check (mode in ('offline', 'gateway', 'sandbox')),
  status text not null default 'captured' check (status in ('captured', 'voided', 'refunded')),
  provider text check (provider is null or provider in ('razorpay', 'sandbox')),
  provider_order_id text,
  provider_payment_id text,
  reference_no text,
  paid_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  idempotency_key text not null,
  notes text,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, receipt_no),
  unique (school_id, idempotency_key),
  check ((mode = 'offline') = (provider is null)),
  check ((status = 'voided') = (voided_at is not null and void_reason is not null)),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete restrict,
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete restrict
);
create unique index payments_provider_payment_key on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;
create index payments_school_paid_idx on public.payments (school_id, paid_at desc);
create index payments_student_idx on public.payments (student_id);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  payment_id uuid not null,
  student_fee_assignment_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0),
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (payment_id, student_fee_assignment_id),
  foreign key (school_id, payment_id) references public.payments (school_id, id) on delete restrict,
  foreign key (school_id, student_fee_assignment_id) references public.student_fee_assignments (school_id, id) on delete restrict
);
create index payment_allocations_assignment_idx on public.payment_allocations (student_fee_assignment_id);

-- Ledger immutability: only the void/refund transition is allowed on payments,
-- and allocations can never change.
create or replace function app.payments_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments cannot be deleted; void them instead' using errcode = '42501';
  end if;
  if (new.school_id, new.student_id, new.academic_year_id, new.receipt_no, new.amount_paise, new.method,
      new.mode, new.provider, new.provider_order_id, new.provider_payment_id, new.paid_at,
      new.idempotency_key, new.created_at)
     is distinct from
     (old.school_id, old.student_id, old.academic_year_id, old.receipt_no, old.amount_paise, old.method,
      old.mode, old.provider, old.provider_order_id, old.provider_payment_id, old.paid_at,
      old.idempotency_key, old.created_at) then
    raise exception 'Payment ledger entries are immutable' using errcode = '42501';
  end if;
  if old.status <> 'captured' and new.status <> old.status then
    raise exception 'Only captured payments can change status' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger payments_guard before update or delete on public.payments
  for each row execute function app.payments_guard();

create or replace function app.allocations_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Payment allocations are immutable' using errcode = '42501';
end;
$$;
create trigger payment_allocations_guard before update or delete on public.payment_allocations
  for each row execute function app.allocations_guard();

-- At commit: a captured payment is fully allocated, and no fee line is paid
-- beyond its net payable amount.
create or replace function app.check_payment_balances()
returns trigger
language plpgsql
as $$
declare
  v_payment uuid;
  v_amount bigint;
  v_status text;
  v_allocated bigint;
  v_line record;
begin
  if tg_table_name = 'payments' then
    v_payment := new.id;
  elsif tg_table_name = 'payment_allocations' then
    v_payment := new.payment_id;
  end if;

  if v_payment is not null then
    select amount_paise, status into v_amount, v_status from public.payments where id = v_payment;
    select coalesce(sum(amount_paise), 0) into v_allocated from public.payment_allocations where payment_id = v_payment;
    if v_status = 'captured' and v_allocated <> v_amount then
      raise exception 'Payment % allocates % paise but its amount is % paise', v_payment, v_allocated, v_amount
        using errcode = '23514';
    end if;
  end if;

  for v_line in
    select f.id, f.amount_paise - f.discount_paise as net,
           coalesce(sum(a.amount_paise) filter (where p.status = 'captured'), 0) as paid
    from public.student_fee_assignments f
    left join public.payment_allocations a on a.student_fee_assignment_id = f.id
    left join public.payments p on p.id = a.payment_id
    where f.id in (
      select pa.student_fee_assignment_id from public.payment_allocations pa
      where tg_table_name <> 'student_fee_assignments' and pa.payment_id = v_payment
      union all
      select new.id where tg_table_name = 'student_fee_assignments'
    )
    group by f.id
  loop
    if v_line.paid > v_line.net then
      raise exception 'Fee line % would be overpaid (paid % paise, payable % paise)', v_line.id, v_line.paid, v_line.net
        using errcode = '23514';
    end if;
  end loop;
  return null;
end;
$$;
create constraint trigger payments_balance_check
  after insert or update on public.payments
  deferrable initially deferred
  for each row execute function app.check_payment_balances();
create constraint trigger payment_allocations_balance_check
  after insert on public.payment_allocations
  deferrable initially deferred
  for each row execute function app.check_payment_balances();
create constraint trigger student_fee_assignments_balance_check
  after update on public.student_fee_assignments
  deferrable initially deferred
  for each row execute function app.check_payment_balances();

-- Sequential receipt numbers per school and academic year.
create table public.receipt_counters (
  school_id uuid not null,
  academic_year_id uuid not null,
  last_no integer not null default 0,
  primary key (school_id, academic_year_id),
  foreign key (school_id, academic_year_id) references public.academic_years (school_id, id) on delete cascade
);

-- Gateway checkout intents. A payment row is only created after the provider
-- confirms capture (signature or webhook), never from a browser callback alone.
create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  provider text not null check (provider in ('razorpay', 'sandbox')),
  provider_order_id text not null,
  amount_paise bigint not null check (amount_paise > 0),
  -- [{ "studentFeeAssignmentId": "...", "amountPaise": 12345 }]
  allocations jsonb not null check (jsonb_typeof(allocations) = 'array'),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'expired')),
  payment_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (provider, provider_order_id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete restrict,
  foreign key (school_id, payment_id) references public.payments (school_id, id) on delete restrict
);
create trigger payment_orders_updated_at before update on public.payment_orders
  for each row execute function app.set_updated_at();

-- Raw provider webhooks, stored before processing. (provider, event_id) makes
-- redelivery idempotent.
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  school_id uuid references public.schools (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, event_id)
);
