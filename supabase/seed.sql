-- ============================================================================
-- Seed data — Slice 0
-- 3 companies, 8 contacts, 12 jobs across all stages, quotes, invoices,
-- payments, appointments. Fixed UUIDs so rows can reference each other and so
-- the table editor is predictable. All phones E.164. Document numbers come
-- from next_document_number() so the counters are exercised and left correct.
--
-- won_at / lost_at are set directly here: the stage-change trigger stamps
-- them only on real stage *transitions*, and seed rows are inserted already
-- at their stage (deliberately — no fabricated history). Fixture data is the
-- one place these columns are written by hand.
--
-- Invoices' amount_paid is set to match their payments by hand for the same
-- reason: the maintaining trigger is Slice 8.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
insert into public.companies (id, name, type, phone, email, address, notes) values
  ('00000000-0000-4000-8000-000000000101', 'Harlow & Vine Interiors', 'designer',
   '+14165550142', 'studio@harlowvine.ca', '210 Ossington Ave, Toronto ON',
   'Sends 3-5 kitchen jobs a year. Maya is the principal.'),
  ('00000000-0000-4000-8000-000000000102', 'Sterling Custom Homes', 'builder',
   '+19055550177', 'office@sterlinghomes.ca', '48 Bronte Rd, Oakville ON',
   'Volume builder; wants quotes back within 48h.'),
  ('00000000-0000-4000-8000-000000000103', 'GTA Stone Supply', 'supplier',
   '+14165550199', 'sales@gtastone.ca', '95 Milvan Dr, North York ON',
   'Slab supplier, not a referrer — kept for contact records.');

-- ----------------------------------------------------------------------------
-- contacts
-- ----------------------------------------------------------------------------
insert into public.contacts (id, company_id, full_name, phone, email, address, lead_source, notes) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   'Maya Harlow', '+14165550101', 'maya@harlowvine.ca', null, 'referral', 'Principal designer at Harlow & Vine.'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102',
   'Dan Sterling', '+19055550102', 'dan@sterlinghomes.ca', null, 'referral', 'Site supervisor; call, do not email.'),
  ('00000000-0000-4000-8000-000000000203', null,
   'Priya Anand', '+14165550103', 'priya.anand@gmail.com', '14 Roxton Rd, Toronto ON', 'meta', null),
  ('00000000-0000-4000-8000-000000000204', null,
   'James O''Rourke', '+16475550104', 'jorourke@outlook.com', '77 Beech Ave, Toronto ON', 'google', null),
  ('00000000-0000-4000-8000-000000000205', null,
   'Lena Kovacs', '+14165550105', 'lena.kovacs@gmail.com', '5 Palmerston Sq, Toronto ON', 'referral', 'Referred by Maya Harlow.'),
  ('00000000-0000-4000-8000-000000000206', null,
   'Tom Whitfield', '+19055550106', 'tom.whitfield@gmail.com', '31 Rebecca St, Oakville ON', 'website', null),
  ('00000000-0000-4000-8000-000000000207', null,
   'Aisha Rahman', '+16475550107', 'aisha.r@gmail.com', '112 Marlee Ave, Toronto ON', 'referral', 'Referred by Sterling Custom Homes.'),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-000000000103',
   'Victor Cho', '+14165550108', 'victor@gtastone.ca', null, 'other', 'Slab yard contact.');

-- ----------------------------------------------------------------------------
-- jobs — one per stage plus an extra quoted; numbers EI-2026-0001..0012
-- ----------------------------------------------------------------------------
insert into public.jobs
  (id, contact_id, company_id, job_number, title, site_address, stage,
   value_est, value_final, lead_source, won_at, lost_at, lost_reason) values
  -- new
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000203', null,
   public.next_document_number('EI'), 'Kitchen countertops — quartz', '14 Roxton Rd, Toronto ON',
   'new', 9000.00, null, 'meta', null, null, null),
  -- contacted
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000204', null,
   public.next_document_number('EI'), 'Bathroom vanity tops ×2', '77 Beech Ave, Toronto ON',
   'contacted', 3500.00, null, 'google', null, null, null),
  -- quoted
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000205',
   '00000000-0000-4000-8000-000000000101',
   public.next_document_number('EI'), 'Kitchen countertops — Calacatta Laza quartz', '5 Palmerston Sq, Toronto ON',
   'quoted', 9500.00, null, 'referral', null, null, null),
  -- follow_up
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000206', null,
   public.next_document_number('EI'), 'Island top + waterfall edge', '31 Rebecca St, Oakville ON',
   'follow_up', 6200.00, null, 'website', null, null, null),
  -- won
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000207',
   '00000000-0000-4000-8000-000000000102',
   public.next_document_number('EI'), 'Full kitchen — quartz, waterfall island', '112 Marlee Ave, Toronto ON',
   'won', 13000.00, 13786.00, 'referral', now() - interval '12 days', null, null),
  -- templated
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000203', null,
   public.next_document_number('EI'), 'Laundry room counter', '14 Roxton Rd, Toronto ON',
   'templated', 2100.00, null, 'meta', now() - interval '9 days', null, null),
  -- fabrication
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000102',
   public.next_document_number('EI'), 'Model home kitchen — Lot 22', 'Lot 22, Kingsway Estates, Oakville ON',
   'fabrication', 11400.00, null, 'referral', now() - interval '15 days', null, null),
  -- scheduled
  ('00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000101',
   public.next_document_number('EI'), 'Client kitchen — honed granite', '88 Dovercourt Rd, Toronto ON',
   'scheduled', 10200.00, null, 'referral', now() - interval '20 days', null, null),
  -- installed
  ('00000000-0000-4000-8000-000000000309', '00000000-0000-4000-8000-000000000204', null,
   public.next_document_number('EI'), 'Kitchen countertops — granite', '77 Beech Ave, Toronto ON',
   'installed', 8000.00, 8249.00, 'google', now() - interval '30 days', null, null),
  -- closed
  ('00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000205',
   '00000000-0000-4000-8000-000000000101',
   public.next_document_number('EI'), 'Kitchen + island — quartzite', '5 Palmerston Sq, Toronto ON',
   'closed', 16000.00, 17402.00, 'referral', now() - interval '60 days', null, null),
  -- lost
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000206', null,
   public.next_document_number('EI'), 'Outdoor kitchen — porcelain', '31 Rebecca St, Oakville ON',
   'lost', 11000.00, null, 'website', null, now() - interval '5 days', 'Went with a cheaper quote'),
  -- quoted (second — stages need not be unique)
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000207', null,
   public.next_document_number('EI'), 'Basement bar top', '112 Marlee Ave, Toronto ON',
   'quoted', 5500.00, null, 'referral', null, null, null);

-- ----------------------------------------------------------------------------
-- quotes — numbers Q-2026-0001..0004; line items sum to the subtotal exactly,
-- tax at 0.1300, total = subtotal + tax.
-- ----------------------------------------------------------------------------
insert into public.quotes
  (id, job_id, quote_number, status, subtotal, tax_rate, tax_amount, total,
   valid_until, sent_at, accepted_at, body_snapshot) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000303',
   public.next_document_number('Q'), 'sent', 8400.00, 0.1300, 1092.00, 9492.00,
   (now() + interval '21 days')::date, now() - interval '4 days', null,
   '{"terms":"50% deposit to schedule. Balance on installation.","subtotal":8400.00,"tax_rate":0.13,"tax_amount":1092.00,"total":9492.00}'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000305',
   public.next_document_number('Q'), 'accepted', 12200.00, 0.1300, 1586.00, 13786.00,
   (now() + interval '30 days')::date, now() - interval '14 days', now() - interval '12 days',
   '{"terms":"50% deposit to schedule. Balance on installation.","subtotal":12200.00,"tax_rate":0.13,"tax_amount":1586.00,"total":13786.00}'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000312',
   public.next_document_number('Q'), 'draft', 5150.00, 0.1300, 669.50, 5819.50,
   null, null, null, null),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000311',
   public.next_document_number('Q'), 'declined', 9800.00, 0.1300, 1274.00, 11074.00,
   (now() - interval '2 days')::date, now() - interval '18 days', null,
   '{"terms":"50% deposit to schedule. Balance on installation.","subtotal":9800.00,"tax_rate":0.13,"tax_amount":1274.00,"total":11074.00}');

insert into public.quote_line_items (quote_id, position, description, quantity, unit, unit_price, amount) values
  ('00000000-0000-4000-8000-000000000401', 1, 'Calacatta Laza quartz — kitchen perimeter', 42.00, 'sqft', 150.00, 6300.00),
  ('00000000-0000-4000-8000-000000000401', 2, 'Waterfall edge fabrication',                 1.00, 'each', 2100.00, 2100.00),
  ('00000000-0000-4000-8000-000000000402', 1, 'Quartz — kitchen + island',                 46.00, 'sqft', 200.00, 9200.00),
  ('00000000-0000-4000-8000-000000000402', 2, 'Undermount sink cutout',                     2.00, 'each', 250.00,  500.00),
  ('00000000-0000-4000-8000-000000000402', 3, 'Demo and disposal of existing tops',         1.00, 'each', 2500.00, 2500.00),
  ('00000000-0000-4000-8000-000000000403', 1, 'Quartz — bar top',                          25.00, 'sqft', 170.00, 4250.00),
  ('00000000-0000-4000-8000-000000000403', 2, 'Matching backsplash',                       12.00, 'sqft',  75.00,  900.00),
  ('00000000-0000-4000-8000-000000000404', 1, 'Porcelain — outdoor kitchen',               49.00, 'sqft', 200.00, 9800.00);

-- ----------------------------------------------------------------------------
-- invoices — numbers INV-2026-0001..0003. amount_paid matches payments below.
-- ----------------------------------------------------------------------------
insert into public.invoices
  (id, job_id, quote_id, invoice_number, status, issue_date, due_date,
   subtotal, tax_rate, tax_amount, total, amount_paid, sent_at, paid_at) values
  -- installed job, standalone invoice, fully paid
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000309', null,
   public.next_document_number('INV'), 'paid',
   (now() - interval '28 days')::date, (now() - interval '14 days')::date,
   7300.00, 0.1300, 949.00, 8249.00, 8249.00,
   now() - interval '28 days', now() - interval '10 days'),
  -- won job, converted from Q-2026-0002, deposit received
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000305',
   '00000000-0000-4000-8000-000000000402',
   public.next_document_number('INV'), 'partial',
   (now() - interval '11 days')::date, (now() + interval '19 days')::date,
   12200.00, 0.1300, 1586.00, 13786.00, 6893.00,
   now() - interval '11 days', null),
  -- closed job, fully paid
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000310', null,
   public.next_document_number('INV'), 'paid',
   (now() - interval '55 days')::date, (now() - interval '41 days')::date,
   15400.00, 0.1300, 2002.00, 17402.00, 17402.00,
   now() - interval '55 days', now() - interval '38 days');

insert into public.invoice_line_items (invoice_id, position, description, quantity, unit, unit_price, amount) values
  ('00000000-0000-4000-8000-000000000501', 1, 'Granite — kitchen countertops', 36.50, 'sqft', 180.00, 6570.00),
  ('00000000-0000-4000-8000-000000000501', 2, 'Undermount sink cutout',         1.00, 'each', 250.00,  250.00),
  ('00000000-0000-4000-8000-000000000501', 3, 'Sealing',                        1.00, 'each', 480.00,  480.00),
  ('00000000-0000-4000-8000-000000000502', 1, 'Quartz — kitchen + island',     46.00, 'sqft', 200.00, 9200.00),
  ('00000000-0000-4000-8000-000000000502', 2, 'Undermount sink cutout',         2.00, 'each', 250.00,  500.00),
  ('00000000-0000-4000-8000-000000000502', 3, 'Demo and disposal',              1.00, 'each', 2500.00, 2500.00),
  ('00000000-0000-4000-8000-000000000503', 1, 'Quartzite — kitchen + island',  55.00, 'sqft', 240.00, 13200.00),
  ('00000000-0000-4000-8000-000000000503', 2, 'Full-height backsplash',        20.00, 'sqft',  90.00,  1800.00),
  ('00000000-0000-4000-8000-000000000503', 3, 'Sink and faucet cutouts',        2.00, 'each', 200.00,   400.00);

-- ----------------------------------------------------------------------------
-- payments — mostly e-transfer and cheque; sums match invoices' amount_paid.
-- ----------------------------------------------------------------------------
insert into public.payments (job_id, invoice_id, kind, method, amount, received_at, reference) values
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000502',
   'deposit', 'etransfer', 6893.00, (now() - interval '10 days')::date, 'ETRF-88214'),
  ('00000000-0000-4000-8000-000000000309', '00000000-0000-4000-8000-000000000501',
   'deposit', 'etransfer', 4000.00, (now() - interval '26 days')::date, 'ETRF-71053'),
  ('00000000-0000-4000-8000-000000000309', '00000000-0000-4000-8000-000000000501',
   'final',   'cheque',    4249.00, (now() - interval '10 days')::date, 'CHQ 1187'),
  ('00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000503',
   'deposit', 'etransfer', 8701.00, (now() - interval '52 days')::date, 'ETRF-65920'),
  ('00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000503',
   'final',   'card',      8701.00, (now() - interval '38 days')::date, null);

-- ----------------------------------------------------------------------------
-- appointments — spread across kinds, past and upcoming. assigned_to left
-- null everywhere: profiles require real auth.users, which arrive in Slice 1.
-- ----------------------------------------------------------------------------
insert into public.appointments (job_id, kind, starts_at, ends_at, notes) values
  ('00000000-0000-4000-8000-000000000302', 'consultation',
   now() + interval '2 days',  now() + interval '2 days 1 hour',  'Measure both vanities while there.'),
  ('00000000-0000-4000-8000-000000000306', 'template',
   now() - interval '3 days',  now() - interval '3 days' + interval '90 minutes', null),
  ('00000000-0000-4000-8000-000000000305', 'template',
   now() + interval '3 days',  now() + interval '3 days 2 hours', 'Confirm island overhang with client.'),
  ('00000000-0000-4000-8000-000000000308', 'install',
   now() + interval '7 days',  now() + interval '7 days 6 hours', 'Day 1 — perimeter.'),
  ('00000000-0000-4000-8000-000000000308', 'install',
   now() + interval '8 days',  now() + interval '8 days 4 hours', 'Day 2 — island + backsplash.'),
  ('00000000-0000-4000-8000-000000000309', 'service',
   now() + interval '5 days',  now() + interval '5 days 1 hour',  'Re-seal seam near cooktop.');
