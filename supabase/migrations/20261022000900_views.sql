-- Read models. Views use security_invoker so the caller's RLS policies apply
-- to the underlying tables (a parent sees only their children's balances).

create view public.student_fee_balances
with (security_invoker = true) as
select
  f.id,
  f.school_id,
  f.student_id,
  f.academic_year_id,
  f.fee_category_id,
  f.fee_installment_id,
  f.description,
  f.due_date,
  f.amount_paise,
  f.discount_paise,
  f.discount_type,
  f.discount_reason,
  (f.amount_paise - f.discount_paise)::bigint as net_paise,
  coalesce(sum(a.amount_paise) filter (where p.status = 'captured'), 0)::bigint as paid_paise,
  (f.amount_paise - f.discount_paise - coalesce(sum(a.amount_paise) filter (where p.status = 'captured'), 0))::bigint as balance_paise
from public.student_fee_assignments f
left join public.payment_allocations a on a.student_fee_assignment_id = f.id
left join public.payments p on p.id = a.payment_id
where f.status = 'active'
group by f.id;

comment on view public.student_fee_balances is
  'Net payable, paid (captured payments only) and outstanding balance per fee line.';

grant select on public.student_fee_balances to authenticated, service_role;
revoke all on public.student_fee_balances from anon;
