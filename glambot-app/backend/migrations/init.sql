-- ────────────────────────────────────────────────────────────────────────────
-- init.sql  —  Single-file canonical schema + seed for Glambot Photo Booth
-- ────────────────────────────────────────────────────────────────────────────
-- Idempotent: aman di-jalankan berkali-kali, baik di fresh DB maupun DB
-- yang sudah berisi data (pakai IF NOT EXISTS + ON CONFLICT DO NOTHING).
--
-- PENTING: seed (packages/frames/vouchers) bersifat INSERT-ONLY (DO NOTHING).
-- File ini di-auto-run TIAP server startup, jadi DO UPDATE akan menimpa hasil
-- edit admin ke nilai default setiap restart. Seed hanya mengisi data awal pada
-- install baru; perubahan via dashboard admin yang menjadi sumber kebenaran.
--
-- File ini di-auto-run oleh backend saat startup (lihat
-- backend/database/database.go runMigrations). Bisa juga manual via:
--     psql -U postgres -d photobooth -f backend/migrations/init.sql
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS packages (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  base_price INTEGER NOT NULL CHECK (base_price >= 0),
  duration_secs INTEGER NOT NULL CHECK (duration_secs > 0),
  print_count SMALLINT NOT NULL DEFAULT 3 CHECK (print_count > 0),
  print_unit_price INTEGER NOT NULL DEFAULT 0 CHECK (print_unit_price >= 0),
  image_src TEXT,
  is_popular INTEGER NOT NULL DEFAULT 0 CHECK (is_popular IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  thumb_url TEXT NOT NULL,
  photo_slots INTEGER NOT NULL DEFAULT 3,
  canvas_width INTEGER NOT NULL DEFAULT 464,
  canvas_height INTEGER NOT NULL DEFAULT 696,
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  package_id BIGINT REFERENCES packages(id),
  package_code TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  duration_secs INTEGER NOT NULL,
  print_count INTEGER NOT NULL DEFAULT 3,
  print_unit_price INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  final_price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid', 'shooting', 'completed', 'expired')),
  frame_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  midtrans_order_id TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  qris_url TEXT,
  qris_raw_string TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vouchers (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INTEGER NOT NULL,
  min_price INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voucher_usage (
  id TEXT PRIMARY KEY,
  voucher_code TEXT NOT NULL REFERENCES vouchers(code),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('raw', 'framed')),
  selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_packages_active_sort ON packages (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_frames_active_sort ON frames (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_sessions_package_id ON sessions (package_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions (session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_photos_session_id_type ON photos (session_id, type);
CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers (is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_voucher_usage_session_id ON voucher_usage (session_id);

-- ─── Seed: Packages (2 paket: Digital + Print) ───────────────────────────────
-- UPSERT: insert kalau belum ada, update content kalau sudah ada.
-- Code 'regular' = Digital Package (id=1 di fresh install)
-- Code 'vip'     = Print Package   (id=2 di fresh install)

-- Catatan: kolom print_unit_price sengaja TIDAK disebut di seed ini. Di DB lama,
-- init.sql dijalankan sebelum ALTER ADD COLUMN (lihat applyCompatibilityMigrations),
-- jadi menyebut kolom baru di sini akan gagal. Nilai vip=15000 diisi via backfill
-- di compatibility migration. Install baru cukup pakai DEFAULT 0 dari CREATE TABLE.
INSERT INTO packages (code, name, description, base_price, duration_secs, print_count, image_src, is_popular, is_active, sort_order)
VALUES
  ('regular', 'Digital Package',
   'HD photos & slow-motion video delivered to your phone via WhatsApp',
   45000, 300, 3, '/storage/packages/digital.svg', 0, 1, 1),
  ('vip', 'Print Package',
   'Printed photos with premium frame & digital copies included',
   65000, 300, 3, '/storage/packages/print.svg', 1, 1, 2)
-- Insert-only: seed hanya mengisi default pada install baru. Pakai DO NOTHING
-- (BUKAN DO UPDATE) supaya edit admin TIDAK ditimpa kembali ke nilai seed setiap
-- kali server restart (init.sql dijalankan ulang di tiap boot).
ON CONFLICT (code) DO NOTHING;

-- ─── Seed: Frames (4 frame default dengan slot coordinates) ──────────────────

INSERT INTO frames (id, name, file_path, thumb_url, photo_slots, canvas_width, canvas_height, slots, sort_order)
VALUES
  ('frame-164', 'Frame 164', 'frames/frame-164.svg', '/storage/frames/frame-164.svg', 6, 464, 696,
   '[
      {"id":"slot-1","shape":"rect","x":13.00, "y":22.00,  "width":207.63,"height":204.12,"label":"Top Left"},
      {"id":"slot-2","shape":"rect","x":243.00,"y":22.00,  "width":207.63,"height":204.12,"label":"Top Right"},
      {"id":"slot-3","shape":"rect","x":13.00, "y":234.00, "width":204.63,"height":200.97,"label":"Middle Left"},
      {"id":"slot-4","shape":"rect","x":244.26,"y":232.09, "width":208.63,"height":200.54,"label":"Middle Right"},
      {"id":"slot-5","shape":"rect","x":14.63, "y":439.91, "width":203.26,"height":176.09,"label":"Bottom Left"},
      {"id":"slot-6","shape":"rect","x":244.63,"y":437.97, "width":208.63,"height":177.97,"label":"Bottom Right"}
   ]'::jsonb, 1),

  ('frame-165', 'Frame 165', 'frames/frame-165.svg', '/storage/frames/frame-165.svg', 6, 464, 696,
   '[
      {"id":"slot-1","shape":"rect","x":21.00, "y":86.00,  "width":190.00,"height":178.00,"label":"Top Left"},
      {"id":"slot-2","shape":"rect","x":254.00,"y":87.00,  "width":191.00,"height":175.00,"label":"Top Right"},
      {"id":"slot-3","shape":"rect","x":20.00, "y":272.00, "width":191.00,"height":173.00,"label":"Middle Left"},
      {"id":"slot-4","shape":"rect","x":252.69,"y":272.88, "width":195.69,"height":173.88,"label":"Middle Right"},
      {"id":"slot-5","shape":"rect","x":20.00, "y":457.00, "width":190.00,"height":167.00,"label":"Bottom Left"},
      {"id":"slot-6","shape":"rect","x":249.69,"y":456.88, "width":193.69,"height":165.88,"label":"Bottom Right"}
   ]'::jsonb, 2),

  ('frame-166', 'Frame 166', 'frames/frame-166.svg', '/storage/frames/frame-166.svg', 4, 464, 696,
   '[
      {"id":"slot-1","shape":"rect","x":20.00, "y":141.00, "width":194.00,"height":219.00,"label":"Top Left"},
      {"id":"slot-2","shape":"rect","x":254.00,"y":144.00, "width":188.00,"height":219.00,"label":"Top Right"},
      {"id":"slot-3","shape":"rect","x":21.00, "y":376.00, "width":190.00,"height":234.00,"label":"Middle Left"},
      {"id":"slot-4","shape":"rect","x":248.00,"y":381.00, "width":193.00,"height":221.00,"label":"Middle Right"}
   ]'::jsonb, 3),

  ('frame-167', 'Frame 167', 'frames/frame-167.svg', '/storage/frames/frame-167.svg', 6, 464, 696,
   '[
      {"id":"slot-1","shape":"ellipse","x":7.63,  "y":74.73,  "width":210.26,"height":156.45,"label":"Top Left"},
      {"id":"slot-2","shape":"ellipse","x":246.26,"y":73.45,  "width":208.26,"height":156.09,"label":"Top Right"},
      {"id":"slot-3","shape":"ellipse","x":11.63, "y":245.63, "width":205.00,"height":161.00,"label":"Middle Left"},
      {"id":"slot-4","shape":"ellipse","x":245.26,"y":247.27, "width":208.26,"height":164.27,"label":"Middle Right"},
      {"id":"slot-5","shape":"ellipse","x":11.26, "y":419.00, "width":210.63,"height":166.00,"label":"Bottom Left"},
      {"id":"slot-6","shape":"ellipse","x":242.63,"y":422.00, "width":209.00,"height":159.00,"label":"Bottom Right"}
   ]'::jsonb, 4)
-- Insert-only: lihat catatan pada seed packages. DO NOTHING agar nama/slot/canvas
-- frame default yang diedit admin tidak ke-reset ke nilai seed tiap server boot.
ON CONFLICT (id) DO NOTHING;

-- ─── Seed: Vouchers (4 voucher default) ──────────────────────────────────────

INSERT INTO vouchers (code, description, discount_type, discount_value, min_price, max_uses, used_count, is_active)
VALUES
  ('GLAMBOT10', '10% discount on your order',         'percent', 10,     50000, 100, 0, 1),
  ('FREESHIP',  'Flat Rp15.000 discount',             'fixed',   15000,  0,     50,  0, 1),
  ('GLAMSHINE', '50% off — special Glambot moment',   'percent', 50,     0,     100, 0, 1),
  ('GLAMHERO',  'Gratis 1 sesi penuh — Glambot Hero', 'percent', 100,    0,     50,  0, 1)
-- Insert-only: lihat catatan pada seed packages. DO NOTHING agar voucher default
-- yang diedit admin tidak ke-reset tiap server boot.
ON CONFLICT (code) DO NOTHING;

COMMIT;
