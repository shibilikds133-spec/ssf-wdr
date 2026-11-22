-- ============================================================
-- SSF WANDOOR DIVISION PAYASAM CHALLENGE - COMPLETE SCHEMA
-- ============================================================

-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABLES
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_internal_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sectors (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  login_code TEXT UNIQUE NOT NULL, -- WDR101, WDR102, ...
  username TEXT,
  password_hash TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  contact_phone TEXT NOT NULL DEFAULT '',
  seen_doc_pages TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  sector_id INT NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  login_code TEXT UNIQUE NOT NULL, -- WDR1 to WDR99
  username TEXT,
  password_hash TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  contact_phone TEXT NOT NULL DEFAULT '',
  seen_doc_pages TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column additions for existing databases
ALTER TABLE sectors
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seen_doc_pages TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seen_doc_pages TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  unit_id INT REFERENCES units(id) ON DELETE CASCADE,
  contributor_name TEXT NOT NULL,
  mobile_number VARCHAR(15) NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit_rate_applied NUMERIC(10, 2) NOT NULL CHECK (unit_rate_applied > 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'PAID',
  payment_mode TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Idempotent Phase 3B-2 upgrades on entries
ALTER TABLE entries ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'PAID';
ALTER TABLE entries ALTER COLUMN payment_mode DROP NOT NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'entries'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%payment_mode%'
        OR pg_get_constraintdef(oid) ILIKE '%payment_status%'
        OR pg_get_constraintdef(oid) ILIKE '%quantity%'
        OR pg_get_constraintdef(oid) ILIKE '%total_amount%'
        OR pg_get_constraintdef(oid) ILIKE '%unit_rate_applied%'
      )
  LOOP
    EXECUTE format('ALTER TABLE entries DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE entries
  ADD CONSTRAINT entries_quantity_positive_chk CHECK (quantity > 0),
  ADD CONSTRAINT entries_rate_positive_chk CHECK (unit_rate_applied > 0),
  ADD CONSTRAINT entries_total_non_negative_chk CHECK (total_amount >= 0),
  ADD CONSTRAINT entries_payment_integrity_chk CHECK (
    (payment_status = 'UNPAID' AND payment_mode IS NULL)
    OR
    (payment_status = 'PAID' AND payment_mode IN ('CASH', 'UPI'))
  );

CREATE TABLE IF NOT EXISTS auth_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SECTOR', 'UNIT')),
  entity_id INT,
  login_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days')
);

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE auth_sessions
  ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '14 days');

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id SERIAL PRIMARY KEY,
  account_type TEXT NOT NULL CHECK (account_type IN ('SECTOR', 'UNIT')),
  account_id INT NOT NULL,
  account_name TEXT NOT NULL,
  username TEXT NOT NULL,
  login_code TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'DISMISSED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Versioned Knowledge Base store (single active row id = 1)
CREATE TABLE IF NOT EXISTS help_kb_store (
  id INT PRIMARY KEY CHECK (id = 1),
  version INT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. DEFAULT SETTINGS, INTERNAL SECRET & DUMMY SEED DATA (IDEMPOTENT)
INSERT INTO app_settings (key, value) VALUES
  ('admin_code', 'WDR100'),
  ('admin_username', 'SSF Wandoor'),
  ('unit_rate', '250'),
  ('division_target', '10000'),
  ('challenge_title', 'SSF Wandoor Division Payasam Challenge'),
  ('is_challenge_open', 'true'),
  ('admin_seen_doc_pages', '[]'),
  ('admin_whatsapp_phone', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_internal_secrets (key, value)
VALUES ('jwt_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

UPDATE app_settings
SET value = 'SSF Wandoor Division Payasam Challenge', updated_at = now()
WHERE key = 'challenge_title'
  AND value = 'SSF Wandoor Division Passage Challenge';

-- Note: Production & Dedicated Test Accounts (WDR1-WDR92, WDR101-WDR108, WDR200-WDR205)
-- are seeded idempotently via supabase/seed_production.sql (npm run db:seed).

-- Safe Idempotent Backfill for username (Zero Duplicate-Key Crashes)
DO $$
DECLARE
  v_admin_user TEXT;
  v_sec RECORD;
  v_unit RECORD;
  v_candidate TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(value), ''), 'SSF Wandoor')
  INTO v_admin_user
  FROM app_settings
  WHERE key = 'admin_username';

  v_admin_user := COALESCE(v_admin_user, 'SSF Wandoor');

  FOR v_sec IN
    SELECT id, name, login_code
    FROM sectors
    WHERE username IS NULL OR TRIM(username) = ''
    ORDER BY id ASC
  LOOP
    v_candidate := TRIM(v_sec.name);
    IF LOWER(v_candidate) = LOWER(v_admin_user)
       OR LOWER(v_candidate) = 'ssf wandoor'
       OR EXISTS (
         SELECT 1 FROM sectors s2
         WHERE s2.id <> v_sec.id AND LOWER(TRIM(COALESCE(s2.username, ''))) = LOWER(v_candidate)
       )
       OR EXISTS (
         SELECT 1 FROM units u2
         WHERE LOWER(TRIM(COALESCE(u2.username, ''))) = LOWER(v_candidate)
       ) THEN
      v_candidate := TRIM(v_sec.name) || ' (' || v_sec.login_code || ')';
    END IF;

    UPDATE sectors SET username = v_candidate WHERE id = v_sec.id;
  END LOOP;

  FOR v_unit IN
    SELECT id, name, login_code
    FROM units
    WHERE username IS NULL OR TRIM(username) = ''
    ORDER BY id ASC
  LOOP
    v_candidate := TRIM(v_unit.name);
    IF LOWER(v_candidate) = LOWER(v_admin_user)
       OR LOWER(v_candidate) = 'ssf wandoor'
       OR EXISTS (
         SELECT 1 FROM sectors s2
         WHERE LOWER(TRIM(COALESCE(s2.username, ''))) = LOWER(v_candidate)
       )
       OR EXISTS (
         SELECT 1 FROM units u2
         WHERE u2.id <> v_unit.id AND LOWER(TRIM(COALESCE(u2.username, ''))) = LOWER(v_candidate)
       ) THEN
      v_candidate := TRIM(v_unit.name) || ' (' || v_unit.login_code || ')';
    END IF;

    UPDATE units SET username = v_candidate WHERE id = v_unit.id;
  END LOOP;
END $$;

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_units_sector_id ON units(sector_id);
CREATE INDEX IF NOT EXISTS idx_entries_unit_id ON entries(unit_id);
CREATE INDEX IF NOT EXISTS idx_entries_active_created ON entries(is_deleted, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_username_lower ON sectors (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_username_lower ON units (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_auth_sessions_role_entity ON auth_sessions (role, entity_id);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_status ON password_reset_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_status_mode ON entries (is_deleted, payment_status, payment_mode, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_units_sector_code ON units (sector_id, login_code);

-- 4. LOCK DOWN DIRECT TABLE ACCESS (RPC-ONLY ACCESS)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_internal_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_kb_store ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  app_settings,
  app_internal_secrets,
  sectors,
  units,
  entries,
  auth_sessions,
  password_reset_requests,
  help_kb_store
FROM anon, authenticated;

-- ============================================================
-- 5. INTERNAL JWT, AUTH & USERNAME HELPERS (NOT PUBLICLY EXECUTABLE)
-- ============================================================

CREATE OR REPLACE FUNCTION base64url_encode(p_data BYTEA)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(rtrim(replace(encode(p_data, 'base64'), E'\n', ''), '='), '+', '-'), '/', '_');
$$;

CREATE OR REPLACE FUNCTION base64url_decode(p_input TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_b64 TEXT := replace(replace(COALESCE(p_input, ''), '-', '+'), '_', '/');
  v_pad INT := (4 - (length(v_b64) % 4)) % 4;
BEGIN
  IF v_pad > 0 THEN
    v_b64 := v_b64 || repeat('=', v_pad);
  END IF;
  RETURN decode(v_b64, 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION sign_session_jwt(
  p_session_id UUID,
  p_role TEXT,
  p_entity_id INT,
  p_username TEXT,
  p_exp BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret TEXT;
  v_header TEXT;
  v_payload TEXT;
  v_sig TEXT;
BEGIN
  SELECT value INTO v_secret FROM app_internal_secrets WHERE key = 'jwt_secret';
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'JWT secret is not configured';
  END IF;

  v_header := base64url_encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'));
  v_payload := base64url_encode(convert_to(
    jsonb_build_object(
      'jti', p_session_id::TEXT,
      'role', p_role,
      'sub', COALESCE(p_entity_id, 0),
      'usr', p_username,
      'iat', FLOOR(EXTRACT(EPOCH FROM now()))::BIGINT,
      'exp', p_exp
    )::TEXT,
    'UTF8'
  ));
  v_sig := base64url_encode(hmac(convert_to(v_header || '.' || v_payload, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'));
  RETURN v_header || '.' || v_payload || '.' || v_sig;
END;
$$;

CREATE OR REPLACE FUNCTION verify_and_slide_session(
  p_auth TEXT,
  p_expected_role TEXT
)
RETURNS TABLE(session_id UUID, entity_id INT, login_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean TEXT := TRIM(COALESCE(p_auth, ''));
  v_parts TEXT[];
  v_secret TEXT;
  v_expected_sig TEXT;
  v_payload_json JSONB;
  v_session_uuid UUID;
  v_sess auth_sessions%ROWTYPE;
BEGIN
  IF v_clean = '' THEN
    RETURN;
  END IF;

  v_parts := string_to_array(v_clean, '.');
  IF array_length(v_parts, 1) = 3 THEN
    SELECT value INTO v_secret FROM app_internal_secrets WHERE key = 'jwt_secret';
    IF v_secret IS NULL OR v_secret = '' THEN
      RETURN;
    END IF;

    v_expected_sig := base64url_encode(
      hmac(
        convert_to(v_parts[1] || '.' || v_parts[2], 'UTF8'),
        convert_to(v_secret, 'UTF8'),
        'sha256'
      )
    );

    IF v_parts[3] <> v_expected_sig THEN
      RETURN;
    END IF;

    BEGIN
      v_payload_json := convert_from(base64url_decode(v_parts[2]), 'UTF8')::JSONB;
      IF COALESCE(v_payload_json->>'role', '') <> p_expected_role THEN
        RETURN;
      END IF;
      v_session_uuid := (v_payload_json->>'jti')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RETURN;
    END;
  ELSIF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_session_uuid := v_clean::UUID;
  ELSE
    RETURN;
  END IF;

  SELECT * INTO v_sess
  FROM auth_sessions a
  WHERE a.token = v_session_uuid
    AND a.role = p_expected_role;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_sess.expires_at <= now() THEN
    DELETE FROM auth_sessions WHERE token = v_session_uuid;
    RAISE EXCEPTION 'SESSION_EXPIRED: Your session expired after 14 days of inactivity. Please sign in again.';
  END IF;

  UPDATE auth_sessions
  SET expires_at = now() + INTERVAL '14 days',
      last_active_at = now()
  WHERE token = v_session_uuid;

  RETURN QUERY SELECT v_sess.token, v_sess.entity_id, v_sess.login_code;
END;
$$;

CREATE OR REPLACE FUNCTION is_valid_admin_auth(p_auth TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean TEXT := TRIM(COALESCE(p_auth, ''));
  v_admin_code TEXT;
BEGIN
  IF v_clean = '' THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM verify_and_slide_session(v_clean, 'ADMIN')) THEN
    RETURN true;
  END IF;

  SELECT UPPER(TRIM(value)) INTO v_admin_code
  FROM app_settings
  WHERE key = 'admin_code';

  IF v_admin_code IS NOT NULL AND UPPER(v_clean) = v_admin_code THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_sector_by_auth(p_auth TEXT)
RETURNS sectors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean TEXT := TRIM(COALESCE(p_auth, ''));
  v_sess RECORD;
  v_sector sectors%ROWTYPE;
BEGIN
  IF v_clean = '' THEN
    RAISE EXCEPTION 'Unauthorized sector access';
  END IF;

  SELECT * INTO v_sess FROM verify_and_slide_session(v_clean, 'SECTOR') LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_sector FROM sectors WHERE id = v_sess.entity_id;
    IF FOUND THEN
      RETURN v_sector;
    END IF;
  END IF;

  SELECT * INTO v_sector
  FROM sectors
  WHERE UPPER(TRIM(login_code)) = UPPER(v_clean)
    AND password_hash IS NULL;

  IF FOUND THEN
    RETURN v_sector;
  END IF;

  RAISE EXCEPTION 'SESSION_EXPIRED: Unauthorized sector session. Please sign in again.';
END;
$$;

CREATE OR REPLACE FUNCTION resolve_unit_by_auth(p_auth TEXT)
RETURNS units
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean TEXT := TRIM(COALESCE(p_auth, ''));
  v_sess RECORD;
  v_unit units%ROWTYPE;
BEGIN
  IF v_clean = '' THEN
    RAISE EXCEPTION 'Unauthorized unit access';
  END IF;

  SELECT * INTO v_sess FROM verify_and_slide_session(v_clean, 'UNIT') LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_unit FROM units WHERE id = v_sess.entity_id;
    IF FOUND THEN
      RETURN v_unit;
    END IF;
  END IF;

  SELECT * INTO v_unit
  FROM units
  WHERE UPPER(TRIM(login_code)) = UPPER(v_clean)
    AND password_hash IS NULL;

  IF FOUND THEN
    RETURN v_unit;
  END IF;

  RAISE EXCEPTION 'SESSION_EXPIRED: Unauthorized unit session. Please sign in again.';
END;
$$;

CREATE OR REPLACE FUNCTION resolve_unique_username(
  p_desired TEXT,
  p_login_code TEXT,
  p_exclude_type TEXT DEFAULT NULL,
  p_exclude_id INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_user TEXT;
  v_base TEXT := TRIM(COALESCE(p_desired, ''));
  v_candidate TEXT;
BEGIN
  IF v_base = '' THEN
    v_base := UPPER(TRIM(COALESCE(p_login_code, '')));
  END IF;

  SELECT COALESCE(NULLIF(TRIM(value), ''), 'SSF Wandoor')
  INTO v_admin_user
  FROM app_settings
  WHERE key = 'admin_username';

  v_admin_user := COALESCE(v_admin_user, 'SSF Wandoor');
  v_candidate := v_base;

  IF LOWER(v_candidate) = LOWER(v_admin_user)
     OR LOWER(v_candidate) = 'ssf wandoor'
     OR EXISTS (
       SELECT 1 FROM sectors s
       WHERE LOWER(TRIM(COALESCE(s.username, ''))) = LOWER(v_candidate)
         AND NOT (p_exclude_type = 'SECTOR' AND p_exclude_id IS NOT NULL AND s.id = p_exclude_id)
     )
     OR EXISTS (
       SELECT 1 FROM units u
       WHERE LOWER(TRIM(COALESCE(u.username, ''))) = LOWER(v_candidate)
         AND NOT (p_exclude_type = 'UNIT' AND p_exclude_id IS NOT NULL AND u.id = p_exclude_id)
     ) THEN
    v_candidate := v_base || ' (' || UPPER(TRIM(p_login_code)) || ')';
  END IF;

  IF LOWER(v_candidate) = LOWER(v_admin_user)
     OR LOWER(v_candidate) = 'ssf wandoor'
     OR EXISTS (
       SELECT 1 FROM sectors s
       WHERE LOWER(TRIM(COALESCE(s.username, ''))) = LOWER(v_candidate)
         AND NOT (p_exclude_type = 'SECTOR' AND p_exclude_id IS NOT NULL AND s.id = p_exclude_id)
     )
     OR EXISTS (
       SELECT 1 FROM units u
       WHERE LOWER(TRIM(COALESCE(u.username, ''))) = LOWER(v_candidate)
         AND NOT (p_exclude_type = 'UNIT' AND p_exclude_id IS NOT NULL AND u.id = p_exclude_id)
     ) THEN
    v_candidate := UPPER(TRIM(p_login_code)) || '-' || substr(md5(random()::text), 1, 4);
  END IF;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION
  base64url_encode(BYTEA),
  base64url_decode(TEXT),
  sign_session_jwt(UUID, TEXT, INT, TEXT, BIGINT),
  verify_and_slide_session(TEXT, TEXT),
  is_valid_admin_auth(TEXT),
  resolve_sector_by_auth(TEXT),
  resolve_unit_by_auth(TEXT),
  resolve_unique_username(TEXT, TEXT, TEXT, INT)
FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6. PUBLIC & AUTHENTICATED RPC FUNCTIONS (SECURITY DEFINER)
-- ============================================================

-- 6.1 LEGACY CODE VERIFICATION (BACKWARD COMPATIBILITY)
CREATE OR REPLACE FUNCTION verify_login_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean TEXT := UPPER(TRIM(COALESCE(p_code, '')));
  v_admin_code TEXT;
  v_unit RECORD;
  v_sector RECORD;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid code. Please try again.');
  END IF;

  SELECT UPPER(TRIM(value)) INTO v_admin_code FROM app_settings WHERE key = 'admin_code';
  IF v_clean = v_admin_code THEN
    RETURN jsonb_build_object(
      'valid', true,
      'role', 'ADMIN',
      'id', 0,
      'name', 'Division Admin',
      'code', v_clean
    );
  END IF;

  SELECT u.id, u.name, u.sector_id, s.name AS sector_name, u.login_code
  INTO v_unit
  FROM units u
  JOIN sectors s ON s.id = u.sector_id
  WHERE UPPER(TRIM(u.login_code)) = v_clean;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'valid', true,
      'role', 'UNIT',
      'id', v_unit.id,
      'name', v_unit.name,
      'sector_id', v_unit.sector_id,
      'sector_name', v_unit.sector_name,
      'code', v_unit.login_code
    );
  END IF;

  SELECT id, name, login_code INTO v_sector
  FROM sectors
  WHERE UPPER(TRIM(login_code)) = v_clean;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'valid', true,
      'role', 'SECTOR',
      'id', v_sector.id,
      'name', v_sector.name,
      'code', v_sector.login_code
    );
  END IF;

  RETURN jsonb_build_object('valid', false, 'error', 'Invalid code. Please try again.');
END;
$$;

-- 6.2 LOGIN DIRECTORY (BACKEND PRIVACY-SAFE HELPER)
CREATE OR REPLACE FUNCTION get_login_directory()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_user TEXT;
  v_items JSONB := '[]'::jsonb;
  v_sectors JSONB;
  v_units JSONB;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(value), ''), 'SSF Wandoor')
  INTO v_admin_user
  FROM app_settings
  WHERE key = 'admin_username';

  v_admin_user := COALESCE(v_admin_user, 'SSF Wandoor');

  v_items := jsonb_build_array(
    jsonb_build_object(
      'username', v_admin_user,
      'display_name', v_admin_user,
      'role', 'ADMIN',
      'subtitle', 'Division Portal'
    )
  );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'username', s.username,
        'display_name', s.name,
        'role', 'SECTOR',
        'subtitle', 'Sector Portal'
      )
      ORDER BY LOWER(s.username) ASC, s.username ASC
    ),
    '[]'::jsonb
  )
  INTO v_sectors
  FROM sectors s
  WHERE COALESCE(TRIM(s.username), '') <> '';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'username', u.username,
        'display_name', u.name,
        'role', 'UNIT',
        'subtitle', 'Unit • ' || s.name
      )
      ORDER BY LOWER(s.name) ASC, LOWER(u.username) ASC, u.username ASC
    ),
    '[]'::jsonb
  )
  INTO v_units
  FROM units u
  JOIN sectors s ON s.id = u.sector_id
  WHERE COALESCE(TRIM(u.username), '') <> '';

  RETURN v_items || v_sectors || v_units;
END;
$$;

-- 6.3 PROFESSIONAL LOGIN WITH 14-DAY SLIDING HS256 JWT
CREATE OR REPLACE FUNCTION auth_login(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user TEXT := TRIM(COALESCE(p_username, ''));
  v_pass TEXT := TRIM(COALESCE(p_password, ''));
  v_admin_user TEXT;
  v_admin_code TEXT;
  v_sector RECORD;
  v_unit RECORD;
  v_token UUID;
  v_expires TIMESTAMPTZ := now() + INTERVAL '14 days';
  v_exp_epoch BIGINT := FLOOR(EXTRACT(EPOCH FROM v_expires))::BIGINT;
  v_jwt TEXT;
  v_ok BOOLEAN;
  v_seen_jsonb JSONB := '[]'::jsonb;
BEGIN
  IF v_user = '' OR v_pass = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'User ID and password are required');
  END IF;

  -- 1. Check Admin
  SELECT COALESCE(NULLIF(TRIM(value), ''), 'SSF Wandoor')
  INTO v_admin_user
  FROM app_settings
  WHERE key = 'admin_username';
  v_admin_user := COALESCE(v_admin_user, 'SSF Wandoor');

  SELECT UPPER(TRIM(value)) INTO v_admin_code
  FROM app_settings
  WHERE key = 'admin_code';

  IF LOWER(v_user) = LOWER(v_admin_user) OR LOWER(v_user) = 'ssf wandoor' THEN
    IF v_admin_code IS NULL OR UPPER(v_pass) <> v_admin_code THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Invalid password');
    END IF;

    SELECT COALESCE(NULLIF(TRIM(value), ''), '[]')::JSONB
    INTO v_seen_jsonb
    FROM app_settings
    WHERE key = 'admin_seen_doc_pages';
    v_seen_jsonb := COALESCE(v_seen_jsonb, '[]'::jsonb);

    INSERT INTO auth_sessions (role, entity_id, login_code, last_active_at, expires_at)
    VALUES ('ADMIN', NULL, v_admin_code, now(), v_expires)
    RETURNING token INTO v_token;

    v_jwt := sign_session_jwt(v_token, 'ADMIN', 0, v_admin_user, v_exp_epoch);

    RETURN jsonb_build_object(
      'valid', true,
      'role', 'ADMIN',
      'code', v_jwt,
      'token', v_jwt,
      'login_code', v_admin_code,
      'username', v_admin_user,
      'name', 'Division Admin',
      'must_change_password', false,
      'seen_doc_pages', v_seen_jsonb,
      'help_kb_version', COALESCE((SELECT version FROM help_kb_store WHERE id = 1), 0),
      'admin_whatsapp_phone', COALESCE((SELECT value FROM app_settings WHERE key = 'admin_whatsapp_phone'), ''),
      'expires_at', v_expires
    );
  END IF;

  -- 2. Check Sector
  SELECT * INTO v_sector
  FROM sectors
  WHERE LOWER(username) = LOWER(v_user);

  IF FOUND THEN
    IF v_sector.password_hash IS NOT NULL THEN
      v_ok := (crypt(v_pass, v_sector.password_hash) = v_sector.password_hash);
    ELSE
      v_ok := (UPPER(v_pass) = UPPER(v_sector.login_code));
    END IF;

    IF NOT COALESCE(v_ok, false) THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Invalid password');
    END IF;

    INSERT INTO auth_sessions (role, entity_id, login_code, last_active_at, expires_at)
    VALUES ('SECTOR', v_sector.id, v_sector.login_code, now(), v_expires)
    RETURNING token INTO v_token;

    v_jwt := sign_session_jwt(v_token, 'SECTOR', v_sector.id, v_sector.username, v_exp_epoch);

    RETURN jsonb_build_object(
      'valid', true,
      'role', 'SECTOR',
      'code', v_jwt,
      'token', v_jwt,
      'login_code', v_sector.login_code,
      'username', v_sector.username,
      'name', v_sector.name,
      'entity_id', v_sector.id,
      'must_change_password', v_sector.must_change_password,
      'seen_doc_pages', to_jsonb(COALESCE(v_sector.seen_doc_pages, '{}'::TEXT[])),
      'help_kb_version', COALESCE((SELECT version FROM help_kb_store WHERE id = 1), 0),
      'admin_whatsapp_phone', COALESCE((SELECT value FROM app_settings WHERE key = 'admin_whatsapp_phone'), ''),
      'expires_at', v_expires
    );
  END IF;

  -- 3. Check Unit
  SELECT u.*, s.name AS sector_name INTO v_unit
  FROM units u
  JOIN sectors s ON s.id = u.sector_id
  WHERE LOWER(u.username) = LOWER(v_user);

  IF FOUND THEN
    IF v_unit.password_hash IS NOT NULL THEN
      v_ok := (crypt(v_pass, v_unit.password_hash) = v_unit.password_hash);
    ELSE
      v_ok := (UPPER(v_pass) = UPPER(v_unit.login_code));
    END IF;

    IF NOT COALESCE(v_ok, false) THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Invalid password');
    END IF;

    INSERT INTO auth_sessions (role, entity_id, login_code, last_active_at, expires_at)
    VALUES ('UNIT', v_unit.id, v_unit.login_code, now(), v_expires)
    RETURNING token INTO v_token;

    v_jwt := sign_session_jwt(v_token, 'UNIT', v_unit.id, v_unit.username, v_exp_epoch);

    RETURN jsonb_build_object(
      'valid', true,
      'role', 'UNIT',
      'code', v_jwt,
      'token', v_jwt,
      'login_code', v_unit.login_code,
      'username', v_unit.username,
      'name', v_unit.name,
      'sector_name', v_unit.sector_name,
      'entity_id', v_unit.id,
      'must_change_password', v_unit.must_change_password,
      'seen_doc_pages', to_jsonb(COALESCE(v_unit.seen_doc_pages, '{}'::TEXT[])),
      'help_kb_version', COALESCE((SELECT version FROM help_kb_store WHERE id = 1), 0),
      'admin_whatsapp_phone', COALESCE((SELECT value FROM app_settings WHERE key = 'admin_whatsapp_phone'), ''),
      'expires_at', v_expires
    );
  END IF;

  RETURN jsonb_build_object('valid', false, 'error', 'User ID not found');
END;
$$;

-- 6.4 SLIDING SESSION REFRESH (VALIDATES JWT SIGNATURE + RE-SIGNS +14 DAYS)
CREATE OR REPLACE FUNCTION auth_refresh_session(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean TEXT := TRIM(COALESCE(p_token, ''));
  v_parts TEXT[];
  v_secret TEXT;
  v_expected_sig TEXT;
  v_payload_json JSONB;
  v_session_uuid UUID;
  v_sess auth_sessions%ROWTYPE;
  v_new_expires TIMESTAMPTZ := now() + INTERVAL '14 days';
  v_exp_epoch BIGINT := FLOOR(EXTRACT(EPOCH FROM v_new_expires))::BIGINT;
  v_admin_user TEXT;
  v_admin_code TEXT;
  v_sector RECORD;
  v_unit RECORD;
  v_username TEXT;
  v_name TEXT;
  v_login_code TEXT;
  v_sector_name TEXT;
  v_must_change BOOLEAN := false;
  v_seen_doc_pages JSONB := '[]'::jsonb;
  v_new_jwt TEXT;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('valid', false, 'expired', true);
  END IF;

  v_parts := string_to_array(v_clean, '.');
  IF array_length(v_parts, 1) = 3 THEN
    SELECT value INTO v_secret FROM app_internal_secrets WHERE key = 'jwt_secret';
    IF v_secret IS NULL OR v_secret = '' THEN
      RETURN jsonb_build_object('valid', false, 'expired', false);
    END IF;

    v_expected_sig := base64url_encode(
      hmac(
        convert_to(v_parts[1] || '.' || v_parts[2], 'UTF8'),
        convert_to(v_secret, 'UTF8'),
        'sha256'
      )
    );

    IF v_parts[3] <> v_expected_sig THEN
      RETURN jsonb_build_object('valid', false, 'expired', false);
    END IF;

    BEGIN
      v_payload_json := convert_from(base64url_decode(v_parts[2]), 'UTF8')::JSONB;
      v_session_uuid := (v_payload_json->>'jti')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('valid', false, 'expired', false);
    END;
  ELSIF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_session_uuid := v_clean::UUID;
  ELSE
    RETURN jsonb_build_object('valid', false, 'expired', false);
  END IF;

  SELECT * INTO v_sess FROM auth_sessions WHERE token = v_session_uuid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'expired', true);
  END IF;

  IF v_sess.expires_at <= now() THEN
    DELETE FROM auth_sessions WHERE token = v_session_uuid;
    RETURN jsonb_build_object('valid', false, 'expired', true);
  END IF;

  IF v_sess.role = 'ADMIN' THEN
    SELECT COALESCE(NULLIF(TRIM(value), ''), 'SSF Wandoor')
    INTO v_admin_user FROM app_settings WHERE key = 'admin_username';
    SELECT UPPER(TRIM(value)) INTO v_admin_code FROM app_settings WHERE key = 'admin_code';
    SELECT COALESCE(NULLIF(TRIM(value), ''), '[]')::JSONB
    INTO v_seen_doc_pages
    FROM app_settings
    WHERE key = 'admin_seen_doc_pages';
    v_seen_doc_pages := COALESCE(v_seen_doc_pages, '[]'::jsonb);
    v_username := COALESCE(v_admin_user, 'SSF Wandoor');
    v_name := 'Division Admin';
    v_login_code := COALESCE(v_admin_code, v_sess.login_code);
    v_must_change := false;
  ELSIF v_sess.role = 'SECTOR' THEN
    SELECT * INTO v_sector FROM sectors WHERE id = v_sess.entity_id;
    IF NOT FOUND THEN
      DELETE FROM auth_sessions WHERE token = v_session_uuid;
      RETURN jsonb_build_object('valid', false, 'expired', true);
    END IF;
    v_username := v_sector.username;
    v_name := v_sector.name;
    v_login_code := v_sector.login_code;
    v_must_change := v_sector.must_change_password;
    v_seen_doc_pages := to_jsonb(COALESCE(v_sector.seen_doc_pages, '{}'::TEXT[]));
  ELSIF v_sess.role = 'UNIT' THEN
    SELECT u.*, s.name AS s_name INTO v_unit
    FROM units u JOIN sectors s ON s.id = u.sector_id
    WHERE u.id = v_sess.entity_id;
    IF NOT FOUND THEN
      DELETE FROM auth_sessions WHERE token = v_session_uuid;
      RETURN jsonb_build_object('valid', false, 'expired', true);
    END IF;
    v_username := v_unit.username;
    v_name := v_unit.name;
    v_login_code := v_unit.login_code;
    v_sector_name := v_unit.s_name;
    v_must_change := v_unit.must_change_password;
    v_seen_doc_pages := to_jsonb(COALESCE(v_unit.seen_doc_pages, '{}'::TEXT[]));
  ELSE
    RETURN jsonb_build_object('valid', false, 'expired', true);
  END IF;

  UPDATE auth_sessions
  SET expires_at = v_new_expires,
      last_active_at = now()
  WHERE token = v_session_uuid;

  v_new_jwt := sign_session_jwt(v_sess.token, v_sess.role, v_sess.entity_id, v_username, v_exp_epoch);

  RETURN jsonb_build_object(
    'valid', true,
    'token', v_new_jwt,
    'code', v_new_jwt,
    'role', v_sess.role,
    'username', v_username,
    'name', v_name,
    'login_code', v_login_code,
    'must_change_password', v_must_change,
    'seen_doc_pages', v_seen_doc_pages,
    'help_kb_version', COALESCE((SELECT version FROM help_kb_store WHERE id = 1), 0),
    'admin_whatsapp_phone', COALESCE((SELECT value FROM app_settings WHERE key = 'admin_whatsapp_phone'), ''),
    'entity_id', v_sess.entity_id,
    'sector_name', v_sector_name,
    'expires_at', v_new_expires
  );
END;
$$;

-- 6.5 MANDATORY FIRST-LOGIN PASSWORD CHANGE
CREATE OR REPLACE FUNCTION auth_complete_first_login(
  p_token TEXT,
  p_new_password TEXT,
  p_new_username TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_token TEXT := TRIM(COALESCE(p_token, ''));
  v_new_pass TEXT := TRIM(COALESCE(p_new_password, ''));
  v_new_user TEXT := TRIM(COALESCE(p_new_username, ''));
  v_admin_user TEXT;
  v_sess_rec RECORD;
  v_sess_role TEXT;
  v_final_username TEXT;
  v_new_token UUID;
  v_expires TIMESTAMPTZ := now() + INTERVAL '14 days';
  v_exp_epoch BIGINT := FLOOR(EXTRACT(EPOCH FROM v_expires))::BIGINT;
  v_jwt TEXT;
BEGIN
  SELECT * INTO v_sess_rec FROM verify_and_slide_session(v_clean_token, 'SECTOR') LIMIT 1;
  IF FOUND THEN
    v_sess_role := 'SECTOR';
  ELSE
    SELECT * INTO v_sess_rec FROM verify_and_slide_session(v_clean_token, 'UNIT') LIMIT 1;
    IF FOUND THEN
      v_sess_role := 'UNIT';
    END IF;
  END IF;

  IF v_sess_role IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  IF LENGTH(v_new_pass) < 6 THEN
    RAISE EXCEPTION 'New password must be at least 6 characters';
  END IF;

  IF UPPER(v_new_pass) = UPPER(v_sess_rec.login_code) THEN
    RAISE EXCEPTION 'New password cannot be the same as your default code';
  END IF;

  IF v_new_user <> '' THEN
    SELECT COALESCE(NULLIF(TRIM(value), ''), 'SSF Wandoor')
    INTO v_admin_user
    FROM app_settings
    WHERE key = 'admin_username';

    IF LOWER(v_new_user) = LOWER(COALESCE(v_admin_user, 'SSF Wandoor'))
       OR LOWER(v_new_user) = 'ssf wandoor' THEN
      RAISE EXCEPTION 'This User ID is already taken';
    END IF;

    IF EXISTS (
      SELECT 1 FROM sectors s
      WHERE LOWER(s.username) = LOWER(v_new_user)
        AND NOT (v_sess_role = 'SECTOR' AND s.id = v_sess_rec.entity_id)
    ) OR EXISTS (
      SELECT 1 FROM units u
      WHERE LOWER(u.username) = LOWER(v_new_user)
        AND NOT (v_sess_role = 'UNIT' AND u.id = v_sess_rec.entity_id)
    ) THEN
      RAISE EXCEPTION 'This User ID is already taken';
    END IF;
  END IF;

  IF v_sess_role = 'SECTOR' THEN
    UPDATE sectors
    SET
      password_hash = crypt(v_new_pass, gen_salt('bf')),
      must_change_password = false,
      username = CASE WHEN v_new_user <> '' THEN v_new_user ELSE username END
    WHERE id = v_sess_rec.entity_id
    RETURNING username INTO v_final_username;
  ELSE
    UPDATE units
    SET
      password_hash = crypt(v_new_pass, gen_salt('bf')),
      must_change_password = false,
      username = CASE WHEN v_new_user <> '' THEN v_new_user ELSE username END
    WHERE id = v_sess_rec.entity_id
    RETURNING username INTO v_final_username;
  END IF;

  IF v_final_username IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  UPDATE password_reset_requests
  SET status = 'RESOLVED', resolved_at = now()
  WHERE account_type = v_sess_role
    AND account_id = v_sess_rec.entity_id
    AND status = 'PENDING';

  -- Revoke temporary first-login / pre-setup sessions and issue a fresh 14-day sliding JWT
  DELETE FROM auth_sessions
  WHERE role = v_sess_role
    AND entity_id = v_sess_rec.entity_id;

  INSERT INTO auth_sessions (role, entity_id, login_code, last_active_at, expires_at)
  VALUES (v_sess_role, v_sess_rec.entity_id, v_sess_rec.login_code, now(), v_expires)
  RETURNING token INTO v_new_token;

  v_jwt := sign_session_jwt(v_new_token, v_sess_role, v_sess_rec.entity_id, v_final_username, v_exp_epoch);

  RETURN jsonb_build_object(
    'success', true,
    'username', v_final_username,
    'must_change_password', false,
    'code', v_jwt,
    'token', v_jwt,
    'expires_at', v_expires
  );
END;
$$;

-- 6.6 LOGOUT (REVOKE SESSION TOKEN BY JWT OR UUID)
CREATE OR REPLACE FUNCTION auth_logout(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean TEXT := TRIM(COALESCE(p_token, ''));
  v_parts TEXT[];
  v_secret TEXT;
  v_expected_sig TEXT;
  v_payload_json JSONB;
  v_session_uuid UUID;
BEGIN
  IF v_clean = '' THEN
    RETURN true;
  END IF;

  v_parts := string_to_array(v_clean, '.');
  IF array_length(v_parts, 1) = 3 THEN
    SELECT value INTO v_secret FROM app_internal_secrets WHERE key = 'jwt_secret';
    IF v_secret IS NOT NULL AND v_secret <> '' THEN
      v_expected_sig := base64url_encode(
        hmac(
          convert_to(v_parts[1] || '.' || v_parts[2], 'UTF8'),
          convert_to(v_secret, 'UTF8'),
          'sha256'
        )
      );
      IF v_parts[3] = v_expected_sig THEN
        BEGIN
          v_payload_json := convert_from(base64url_decode(v_parts[2]), 'UTF8')::JSONB;
          v_session_uuid := (v_payload_json->>'jti')::UUID;
          DELETE FROM auth_sessions WHERE token = v_session_uuid;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END IF;
  ELSIF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    DELETE FROM auth_sessions WHERE token = v_clean::UUID;
  END IF;

  RETURN true;
END;
$$;

-- 6.6b PERSIST SEEN MALAYALAM DOC PAGE KEYS PER ACCOUNT
CREATE OR REPLACE FUNCTION auth_mark_doc_page_seen(
  p_code TEXT,
  p_page_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key TEXT := LOWER(TRIM(COALESCE(p_page_key, '')));
  v_sess RECORD;
  v_arr TEXT[];
BEGIN
  IF v_key = '' OR LENGTH(v_key) > 64 THEN
    RAISE EXCEPTION 'Invalid doc page key';
  END IF;

  -- 1. Check ADMIN
  IF is_valid_admin_auth(p_code) THEN
    SELECT ARRAY(
      SELECT DISTINCT elem
      FROM jsonb_array_elements_text(
        COALESCE(
          NULLIF(TRIM((SELECT value FROM app_settings WHERE key = 'admin_seen_doc_pages')), ''),
          '[]'
        )::JSONB
      ) AS elem
    ) INTO v_arr;

    IF NOT (v_key = ANY(COALESCE(v_arr, '{}'::TEXT[]))) THEN
      v_arr := array_append(COALESCE(v_arr, '{}'::TEXT[]), v_key);
      INSERT INTO app_settings (key, value)
      VALUES ('admin_seen_doc_pages', to_jsonb(v_arr)::TEXT)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'seen_doc_pages', to_jsonb(COALESCE(v_arr, '{}'::TEXT[]))
    );
  END IF;

  -- 2. Check SECTOR session
  SELECT * INTO v_sess FROM verify_and_slide_session(p_code, 'SECTOR') LIMIT 1;
  IF FOUND AND v_sess.entity_id IS NOT NULL THEN
    UPDATE sectors
    SET seen_doc_pages = CASE
      WHEN v_key = ANY(seen_doc_pages) THEN seen_doc_pages
      ELSE array_append(seen_doc_pages, v_key)
    END
    WHERE id = v_sess.entity_id
    RETURNING seen_doc_pages INTO v_arr;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'seen_doc_pages', to_jsonb(COALESCE(v_arr, '{}'::TEXT[]))
      );
    END IF;
  END IF;

  -- 3. Check UNIT session
  SELECT * INTO v_sess FROM verify_and_slide_session(p_code, 'UNIT') LIMIT 1;
  IF FOUND AND v_sess.entity_id IS NOT NULL THEN
    UPDATE units
    SET seen_doc_pages = CASE
      WHEN v_key = ANY(seen_doc_pages) THEN seen_doc_pages
      ELSE array_append(seen_doc_pages, v_key)
    END
    WHERE id = v_sess.entity_id
    RETURNING seen_doc_pages INTO v_arr;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'seen_doc_pages', to_jsonb(COALESCE(v_arr, '{}'::TEXT[]))
      );
    END IF;
  END IF;

  RAISE EXCEPTION 'SESSION_EXPIRED: Unauthorized session.';
END;
$$;

-- 6.7 REQUEST PASSWORD RESET (FROM LOGIN PAGE)
CREATE OR REPLACE FUNCTION request_password_reset(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user TEXT := TRIM(COALESCE(p_username, ''));
  v_admin_user TEXT;
  v_account_type TEXT;
  v_account_id INT;
  v_account_name TEXT;
  v_username TEXT;
  v_login_code TEXT;
  v_contact_phone TEXT;
  v_sector RECORD;
  v_unit RECORD;
BEGIN
  IF v_user = '' THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(value), ''), 'SSF Wandoor')
  INTO v_admin_user
  FROM app_settings
  WHERE key = 'admin_username';

  IF LOWER(v_user) = LOWER(COALESCE(v_admin_user, 'SSF Wandoor'))
     OR LOWER(v_user) = 'ssf wandoor' THEN
    RAISE EXCEPTION 'Division Admin password cannot be reset here';
  END IF;

  SELECT id, name, username, login_code, contact_phone INTO v_sector
  FROM sectors
  WHERE LOWER(username) = LOWER(v_user);

  IF FOUND THEN
    v_account_type := 'SECTOR';
    v_account_id := v_sector.id;
    v_account_name := v_sector.name;
    v_username := v_sector.username;
    v_login_code := v_sector.login_code;
    v_contact_phone := v_sector.contact_phone;
  ELSE
    SELECT id, name, username, login_code, contact_phone INTO v_unit
    FROM units
    WHERE LOWER(username) = LOWER(v_user);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found';
    END IF;

    v_account_type := 'UNIT';
    v_account_id := v_unit.id;
    v_account_name := v_unit.name;
    v_username := v_unit.username;
    v_login_code := v_unit.login_code;
    v_contact_phone := v_unit.contact_phone;
  END IF;

  IF EXISTS (
    SELECT 1 FROM password_reset_requests
    WHERE account_type = v_account_type
      AND account_id = v_account_id
      AND status = 'PENDING'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_pending', true,
      'message', 'A reset request is already pending with Division Admin.'
    );
  END IF;

  INSERT INTO password_reset_requests (
    account_type, account_id, account_name, username, login_code, contact_phone, status
  ) VALUES (
    v_account_type, v_account_id, v_account_name, v_username, v_login_code, COALESCE(v_contact_phone, ''), 'PENDING'
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_pending', false,
    'message', 'Password reset request sent to Division Admin.'
  );
END;
$$;

-- 6.8 ADMIN: RESET SECTOR OR UNIT PASSWORD & REVOKE ACTIVE SESSIONS
CREATE OR REPLACE FUNCTION admin_reset_account_password(
  p_code TEXT,
  p_account_type TEXT,
  p_account_id INT,
  p_temp_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_type TEXT := UPPER(TRIM(COALESCE(p_account_type, '')));
  v_temp TEXT := TRIM(COALESCE(p_temp_password, ''));
  v_return_pwd TEXT;
  v_username TEXT;
  v_login_code TEXT;
  v_contact_phone TEXT;
  v_sector RECORD;
  v_unit RECORD;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  IF v_type NOT IN ('SECTOR', 'UNIT') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;

  IF v_temp <> '' AND LENGTH(v_temp) < 4 THEN
    RAISE EXCEPTION 'Temporary password must be at least 4 characters';
  END IF;

  IF v_type = 'SECTOR' THEN
    SELECT id, username, login_code, contact_phone INTO v_sector
    FROM sectors WHERE id = p_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found';
    END IF;

    v_username := v_sector.username;
    v_login_code := v_sector.login_code;
    v_contact_phone := COALESCE(v_sector.contact_phone, '');

    IF v_temp = '' THEN
      UPDATE sectors
      SET password_hash = NULL, must_change_password = true
      WHERE id = p_account_id;
      v_return_pwd := v_login_code;
    ELSE
      UPDATE sectors
      SET password_hash = crypt(v_temp, gen_salt('bf')), must_change_password = true
      WHERE id = p_account_id;
      v_return_pwd := v_temp;
    END IF;
  ELSE
    SELECT id, username, login_code, contact_phone INTO v_unit
    FROM units WHERE id = p_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found';
    END IF;

    v_username := v_unit.username;
    v_login_code := v_unit.login_code;
    v_contact_phone := COALESCE(v_unit.contact_phone, '');

    IF v_temp = '' THEN
      UPDATE units
      SET password_hash = NULL, must_change_password = true
      WHERE id = p_account_id;
      v_return_pwd := v_login_code;
    ELSE
      UPDATE units
      SET password_hash = crypt(v_temp, gen_salt('bf')), must_change_password = true
      WHERE id = p_account_id;
      v_return_pwd := v_temp;
    END IF;
  END IF;

  DELETE FROM auth_sessions
  WHERE role = v_type AND entity_id = p_account_id;

  UPDATE password_reset_requests
  SET status = 'RESOLVED', resolved_at = now()
  WHERE account_type = v_type
    AND account_id = p_account_id
    AND status = 'PENDING';

  RETURN jsonb_build_object(
    'success', true,
    'username', v_username,
    'temp_password', v_return_pwd,
    'login_code', v_login_code,
    'contact_phone', v_contact_phone
  );
END;
$$;

-- 6.9 ADMIN: DISMISS PENDING RESET REQUEST
CREATE OR REPLACE FUNCTION admin_dismiss_reset_request(p_code TEXT, p_request_id INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  UPDATE password_reset_requests
  SET status = 'DISMISSED', resolved_at = now()
  WHERE id = p_request_id AND status = 'PENDING';

  RETURN true;
END;
$$;

-- 6.10 ADMIN: UPDATE CONTACT PHONE FOR SECTOR OR UNIT
CREATE OR REPLACE FUNCTION admin_update_account_contact(
  p_code TEXT,
  p_account_type TEXT,
  p_account_id INT,
  p_contact_phone TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_type TEXT := UPPER(TRIM(COALESCE(p_account_type, '')));
  v_raw TEXT := TRIM(COALESCE(p_contact_phone, ''));
  v_digits TEXT;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  IF v_type NOT IN ('SECTOR', 'UNIT') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;

  IF v_raw <> '' THEN
    v_digits := REGEXP_REPLACE(v_raw, '\D', '', 'g');
    IF LENGTH(v_digits) < 10 THEN
      RAISE EXCEPTION 'Contact phone must be blank or at least 10 digits';
    END IF;
  END IF;

  IF v_type = 'SECTOR' THEN
    UPDATE sectors SET contact_phone = v_raw WHERE id = p_account_id;
  ELSE
    UPDATE units SET contact_phone = v_raw WHERE id = p_account_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  RETURN true;
END;
$$;

-- 6.11 PUBLIC STATS & LEADERBOARD (ZERO PII; DIVISION TOTAL INCLUDES DIVISION DIRECT)
CREATE OR REPLACE FUNCTION get_public_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH settings_map AS (
    SELECT
      COALESCE(MAX(CASE WHEN key = 'unit_rate' THEN value END), '250')::NUMERIC AS unit_rate,
      COALESCE(MAX(CASE WHEN key = 'division_target' THEN value END), '10000')::NUMERIC AS division_target,
      COALESCE(MAX(CASE WHEN key = 'challenge_title' THEN value END), 'SSF Wandoor Division Payasam Challenge') AS challenge_title,
      COALESCE(MAX(CASE WHEN key = 'is_challenge_open' THEN value END), 'true') = 'true' AS is_challenge_open
    FROM app_settings
  ),
  unit_agg AS (
    SELECT
      u.id,
      u.name,
      u.sector_id,
      s.name AS sector_name,
      COUNT(e.id)::INT AS total_entries,
      COALESCE(SUM(e.quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(e.total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM units u
    JOIN sectors s ON s.id = u.sector_id
    LEFT JOIN entries e ON e.unit_id = u.id AND e.is_deleted = false
    GROUP BY u.id, u.name, u.sector_id, s.name
  ),
  sector_agg AS (
    SELECT
      s.id,
      s.name,
      COUNT(ua.id)::INT AS total_units,
      COUNT(CASE WHEN ua.total_entries > 0 THEN 1 END)::INT AS active_units,
      COALESCE(SUM(ua.total_entries), 0)::INT AS total_entries,
      COALESCE(SUM(ua.total_quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(ua.total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM sectors s
    LEFT JOIN unit_agg ua ON ua.sector_id = s.id
    GROUP BY s.id, s.name
  ),
  all_entries_agg AS (
    SELECT
      COUNT(*)::INT AS total_entries,
      COALESCE(SUM(quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM entries
    WHERE is_deleted = false
  )
  SELECT jsonb_build_object(
    'settings', (SELECT row_to_json(settings_map)::jsonb FROM settings_map),
    'division', (
      SELECT jsonb_build_object(
        'total_entries', a.total_entries,
        'total_quantity', a.total_quantity,
        'total_amount', a.total_amount,
        'total_units', (SELECT COUNT(*) FROM unit_agg),
        'active_units', (SELECT COUNT(CASE WHEN total_entries > 0 THEN 1 END) FROM unit_agg)
      )
      FROM all_entries_agg a
    ),
    'sectors', COALESCE(
      (SELECT jsonb_agg(row_to_json(sa)::jsonb ORDER BY sa.total_quantity DESC, sa.name ASC) FROM sector_agg sa),
      '[]'::jsonb
    ),
    'units', COALESCE(
      (SELECT jsonb_agg(row_to_json(ua)::jsonb ORDER BY ua.total_quantity DESC, ua.name ASC) FROM unit_agg ua),
      '[]'::jsonb
    ),
    'fetched_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 6.12 PUBLIC: ADD ORDER (REQUIRES UNIT ORDER CODE + CUT-OFF + PAYMENT INTEGRITY)
DROP FUNCTION IF EXISTS public_add_order(TEXT, TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public_add_order(
  p_unit_code TEXT,
  p_contributor_name TEXT,
  p_mobile_number TEXT,
  p_quantity NUMERIC,
  p_payment_mode TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'PAID'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_code TEXT := UPPER(TRIM(COALESCE(p_unit_code, '')));
  v_clean_name TEXT := TRIM(COALESCE(p_contributor_name, ''));
  v_clean_mobile TEXT := TRIM(COALESCE(p_mobile_number, ''));
  v_clean_digits TEXT;
  v_status TEXT := UPPER(TRIM(COALESCE(p_payment_status, '')));
  v_mode TEXT := NULLIF(UPPER(TRIM(COALESCE(p_payment_mode, ''))), '');
  v_is_open BOOLEAN;
  v_unit RECORD;
  v_unit_rate NUMERIC(10, 2);
  v_total NUMERIC(12, 2);
  v_inserted RECORD;
BEGIN
  SELECT COALESCE(LOWER(TRIM(value)) = 'true', true) INTO v_is_open
  FROM app_settings
  WHERE key = 'is_challenge_open';

  IF NOT COALESCE(v_is_open, false) THEN
    RAISE EXCEPTION 'Public orders are currently closed';
  END IF;

  IF v_clean_code = '' THEN
    RAISE EXCEPTION 'Invalid Unit Order Code. Please check the code and try again.';
  END IF;

  SELECT u.id, u.name, u.login_code, s.name AS sector_name
  INTO v_unit
  FROM units u
  JOIN sectors s ON s.id = u.sector_id
  WHERE UPPER(TRIM(u.login_code)) = v_clean_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid Unit Order Code. Please check the code and try again.';
  END IF;

  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'Ordered by name is required';
  END IF;

  v_clean_digits := REGEXP_REPLACE(v_clean_mobile, '\D', '', 'g');
  IF LENGTH(v_clean_digits) < 10 THEN
    RAISE EXCEPTION 'Valid 10-digit mobile number is required';
  END IF;

  p_quantity := ROUND(p_quantity, 2);
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF p_quantity > 100000 THEN
    RAISE EXCEPTION 'Quantity cannot exceed 100000 L per order';
  END IF;

  IF v_status NOT IN ('PAID', 'UNPAID') THEN
    RAISE EXCEPTION 'Please select Paid or Unpaid status';
  END IF;

  IF v_status = 'PAID' AND (v_mode IS NULL OR v_mode NOT IN ('CASH', 'UPI')) THEN
    RAISE EXCEPTION 'Please select Cash Handover or UPI for Paid orders';
  END IF;

  IF v_status = 'UNPAID' AND v_mode IS NOT NULL THEN
    RAISE EXCEPTION 'Unpaid orders cannot have a payment method';
  END IF;

  SELECT COALESCE(value::NUMERIC, 250) INTO v_unit_rate
  FROM app_settings
  WHERE key = 'unit_rate';

  v_total := ROUND(p_quantity * v_unit_rate, 2);

  INSERT INTO entries (
    unit_id, contributor_name, mobile_number, quantity, unit_rate_applied, total_amount, payment_status, payment_mode
  ) VALUES (
    v_unit.id, v_clean_name, v_clean_mobile, p_quantity, v_unit_rate, v_total, v_status, v_mode
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'unit_id', v_inserted.unit_id,
    'unit_name', v_unit.name,
    'unit_code', v_unit.login_code,
    'sector_name', v_unit.sector_name,
    'contributor_name', v_inserted.contributor_name,
    'mobile_number', v_inserted.mobile_number,
    'quantity', v_inserted.quantity,
    'unit_rate_applied', v_inserted.unit_rate_applied,
    'total_amount', v_inserted.total_amount,
    'payment_status', v_inserted.payment_status,
    'payment_mode', v_inserted.payment_mode,
    'created_at', v_inserted.created_at
  );
END;
$$;

-- 6.13 UNIT: ADD ENTRY DIRECTLY (ENFORCES GLOBAL DIVISION LOCK + ZERO-MINUS + PAYMENT INTEGRITY)
DROP FUNCTION IF EXISTS unit_add_entry(TEXT, TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION unit_add_entry(
  p_code TEXT,
  p_contributor_name TEXT,
  p_mobile_number TEXT,
  p_quantity NUMERIC,
  p_payment_mode TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'PAID'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_unit units%ROWTYPE;
  v_sector_name TEXT;
  v_open TEXT;
  v_clean_name TEXT := TRIM(COALESCE(p_contributor_name, ''));
  v_clean_mobile TEXT := TRIM(COALESCE(p_mobile_number, ''));
  v_clean_digits TEXT;
  v_status TEXT := UPPER(TRIM(COALESCE(p_payment_status, '')));
  v_mode TEXT := NULLIF(UPPER(TRIM(COALESCE(p_payment_mode, ''))), '');
  v_unit_rate NUMERIC(10, 2);
  v_total NUMERIC(12, 2);
  v_inserted RECORD;
BEGIN
  v_unit := resolve_unit_by_auth(p_code);

  SELECT value INTO v_open FROM app_settings WHERE key = 'is_challenge_open';
  IF LOWER(COALESCE(v_open, 'true')) <> 'true' THEN
    RAISE EXCEPTION 'Orders are currently closed by Division Admin';
  END IF;

  SELECT name INTO v_sector_name FROM sectors WHERE id = v_unit.sector_id;

  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'Ordered by name is required';
  END IF;

  v_clean_digits := REGEXP_REPLACE(v_clean_mobile, '\D', '', 'g');
  IF LENGTH(v_clean_digits) < 10 THEN
    RAISE EXCEPTION 'Valid 10-digit mobile number is required';
  END IF;

  p_quantity := ROUND(p_quantity, 2);
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF v_status NOT IN ('PAID', 'UNPAID') THEN
    RAISE EXCEPTION 'Please select Paid or Unpaid status';
  END IF;

  IF v_status = 'PAID' AND (v_mode IS NULL OR v_mode NOT IN ('CASH', 'UPI')) THEN
    RAISE EXCEPTION 'Please select Cash Handover or UPI for Paid orders';
  END IF;

  IF v_status = 'UNPAID' AND v_mode IS NOT NULL THEN
    RAISE EXCEPTION 'Unpaid orders cannot have a payment method';
  END IF;

  SELECT COALESCE(value::NUMERIC, 250) INTO v_unit_rate FROM app_settings WHERE key = 'unit_rate';
  v_total := ROUND(p_quantity * v_unit_rate, 2);

  INSERT INTO entries (
    unit_id, contributor_name, mobile_number, quantity, unit_rate_applied, total_amount, payment_status, payment_mode
  ) VALUES (
    v_unit.id, v_clean_name, v_clean_mobile, p_quantity, v_unit_rate, v_total, v_status, v_mode
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'unit_id', v_inserted.unit_id,
    'unit_name', v_unit.name,
    'unit_code', v_unit.login_code,
    'sector_name', COALESCE(v_sector_name, ''),
    'contributor_name', v_inserted.contributor_name,
    'mobile_number', v_inserted.mobile_number,
    'quantity', v_inserted.quantity,
    'unit_rate_applied', v_inserted.unit_rate_applied,
    'total_amount', v_inserted.total_amount,
    'payment_status', v_inserted.payment_status,
    'payment_mode', v_inserted.payment_mode,
    'created_at', v_inserted.created_at
  );
END;
$$;

-- 6.14 ADMIN: ADD ORDER DIRECTLY OR ON BEHALF OF ANY UNIT (BYPASSES GLOBAL LOCK)
CREATE OR REPLACE FUNCTION admin_add_entry(
  p_code TEXT,
  p_unit_id INT,
  p_contributor_name TEXT,
  p_mobile_number TEXT,
  p_quantity NUMERIC,
  p_payment_status TEXT,
  p_payment_mode TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_unit RECORD;
  v_unit_name TEXT := 'Division Direct';
  v_unit_code TEXT := 'DIVISION';
  v_sector_name TEXT := 'Division';
  v_clean_name TEXT := TRIM(COALESCE(p_contributor_name, ''));
  v_clean_mobile TEXT := TRIM(COALESCE(p_mobile_number, ''));
  v_clean_digits TEXT;
  v_status TEXT := UPPER(TRIM(COALESCE(p_payment_status, '')));
  v_mode TEXT := NULLIF(UPPER(TRIM(COALESCE(p_payment_mode, ''))), '');
  v_unit_rate NUMERIC(10, 2);
  v_total NUMERIC(12, 2);
  v_inserted RECORD;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  IF p_unit_id IS NOT NULL THEN
    SELECT u.id, u.name, u.login_code, s.name AS sector_name
    INTO v_unit
    FROM units u
    JOIN sectors s ON s.id = u.sector_id
    WHERE u.id = p_unit_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected unit not found';
    END IF;

    v_unit_name := v_unit.name;
    v_unit_code := v_unit.login_code;
    v_sector_name := v_unit.sector_name;
  END IF;

  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'Ordered by name is required';
  END IF;

  v_clean_digits := REGEXP_REPLACE(v_clean_mobile, '\D', '', 'g');
  IF LENGTH(v_clean_digits) < 10 THEN
    RAISE EXCEPTION 'Valid 10-digit mobile number is required';
  END IF;

  p_quantity := ROUND(p_quantity, 2);
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF v_status NOT IN ('PAID', 'UNPAID') THEN
    RAISE EXCEPTION 'Please select Paid or Unpaid status';
  END IF;

  IF v_status = 'PAID' AND (v_mode IS NULL OR v_mode NOT IN ('CASH', 'UPI')) THEN
    RAISE EXCEPTION 'Please select Cash Handover or UPI for Paid orders';
  END IF;

  IF v_status = 'UNPAID' AND v_mode IS NOT NULL THEN
    RAISE EXCEPTION 'Unpaid orders cannot have a payment method';
  END IF;

  SELECT COALESCE(value::NUMERIC, 250) INTO v_unit_rate FROM app_settings WHERE key = 'unit_rate';
  v_total := ROUND(p_quantity * v_unit_rate, 2);

  INSERT INTO entries (
    unit_id, contributor_name, mobile_number, quantity, unit_rate_applied, total_amount, payment_status, payment_mode
  ) VALUES (
    p_unit_id, v_clean_name, v_clean_mobile, p_quantity, v_unit_rate, v_total, v_status, v_mode
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'unit_id', v_inserted.unit_id,
    'unit_name', v_unit_name,
    'unit_code', v_unit_code,
    'sector_name', v_sector_name,
    'is_division_direct', (p_unit_id IS NULL),
    'contributor_name', v_inserted.contributor_name,
    'mobile_number', v_inserted.mobile_number,
    'quantity', v_inserted.quantity,
    'unit_rate_applied', v_inserted.unit_rate_applied,
    'total_amount', v_inserted.total_amount,
    'payment_status', v_inserted.payment_status,
    'payment_mode', v_inserted.payment_mode,
    'created_at', v_inserted.created_at
  );
END;
$$;

-- 6.15 MARK AS PAID RPCS (UNIT, SECTOR, ADMIN)
CREATE OR REPLACE FUNCTION unit_mark_entry_paid(
  p_code TEXT,
  p_entry_id INT,
  p_payment_mode TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_unit units%ROWTYPE;
  v_mode TEXT := UPPER(TRIM(COALESCE(p_payment_mode, '')));
BEGIN
  v_unit := resolve_unit_by_auth(p_code);

  IF v_mode NOT IN ('CASH', 'UPI') THEN
    RAISE EXCEPTION 'Please select Cash Handover or UPI for Paid orders';
  END IF;

  UPDATE entries
  SET payment_status = 'PAID',
      payment_mode = v_mode
  WHERE id = p_entry_id
    AND unit_id = v_unit.id
    AND is_deleted = false
    AND payment_status = 'UNPAID';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unpaid order not found in your unit';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION sector_mark_entry_paid(
  p_code TEXT,
  p_entry_id INT,
  p_payment_mode TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_mode TEXT := UPPER(TRIM(COALESCE(p_payment_mode, '')));
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  IF v_mode NOT IN ('CASH', 'UPI') THEN
    RAISE EXCEPTION 'Please select Cash Handover or UPI for Paid orders';
  END IF;

  UPDATE entries e
  SET payment_status = 'PAID',
      payment_mode = v_mode
  WHERE e.id = p_entry_id
    AND e.is_deleted = false
    AND e.payment_status = 'UNPAID'
    AND EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = e.unit_id AND u.sector_id = v_sector.id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unpaid order not found in your sector';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION admin_mark_entry_paid(
  p_code TEXT,
  p_entry_id INT,
  p_payment_mode TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_mode TEXT := UPPER(TRIM(COALESCE(p_payment_mode, '')));
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  IF v_mode NOT IN ('CASH', 'UPI') THEN
    RAISE EXCEPTION 'Please select Cash Handover or UPI for Paid orders';
  END IF;

  UPDATE entries
  SET payment_status = 'PAID',
      payment_mode = v_mode
  WHERE id = p_entry_id
    AND is_deleted = false
    AND payment_status = 'UNPAID';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unpaid order not found';
  END IF;

  RETURN true;
END;
$$;

-- 6.16 UNIT: GET OWN DASHBOARD (TOKEN-AUTHENTICATED, INCLUDES UNPAID AGGREGATES)
CREATE OR REPLACE FUNCTION unit_get_dashboard(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_unit units%ROWTYPE;
  v_sector_name TEXT;
  v_unit_rate NUMERIC;
  v_division_target NUMERIC;
  v_is_open BOOLEAN;
  v_title TEXT;
  v_result JSONB;
BEGIN
  v_unit := resolve_unit_by_auth(p_code);

  SELECT name INTO v_sector_name FROM sectors WHERE id = v_unit.sector_id;
  SELECT COALESCE(value::NUMERIC, 250) INTO v_unit_rate FROM app_settings WHERE key = 'unit_rate';
  SELECT COALESCE(value::NUMERIC, 10000) INTO v_division_target FROM app_settings WHERE key = 'division_target';
  SELECT COALESCE(LOWER(TRIM(value)) = 'true', true) INTO v_is_open FROM app_settings WHERE key = 'is_challenge_open';
  SELECT COALESCE(value, 'SSF Wandoor Division Payasam Challenge') INTO v_title FROM app_settings WHERE key = 'challenge_title';

  SELECT jsonb_build_object(
    'unit', jsonb_build_object(
      'id', v_unit.id,
      'name', v_unit.name,
      'username', v_unit.username,
      'login_code', v_unit.login_code,
      'contact_phone', COALESCE(v_unit.contact_phone, ''),
      'sector_id', v_unit.sector_id,
      'sector_name', COALESCE(v_sector_name, '')
    ),
    'settings', jsonb_build_object(
      'unit_rate', v_unit_rate,
      'division_target', v_division_target,
      'challenge_title', v_title,
      'is_challenge_open', v_is_open
    ),
    'summary', (
      SELECT jsonb_build_object(
        'total_entries', COUNT(*)::INT,
        'total_quantity', COALESCE(SUM(quantity), 0)::NUMERIC(10, 2),
        'cash_amount', COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND payment_mode = 'CASH' THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2),
        'upi_amount', COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND payment_mode = 'UPI' THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2),
        'paid_amount', COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2),
        'unpaid_amount', COALESCE(SUM(CASE WHEN payment_status = 'UNPAID' THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2),
        'unpaid_entries', COALESCE(COUNT(*) FILTER (WHERE payment_status = 'UNPAID'), 0)::INT,
        'total_amount', COALESCE(SUM(total_amount), 0)::NUMERIC(12, 2)
      )
      FROM entries WHERE unit_id = v_unit.id AND is_deleted = false
    ),
    'entries', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'unit_id', v_unit.id,
            'unit_name', v_unit.name,
            'sector_id', v_unit.sector_id,
            'sector_name', COALESCE(v_sector_name, ''),
            'is_division_direct', false,
            'contributor_name', e.contributor_name,
            'mobile_number', e.mobile_number,
            'quantity', e.quantity,
            'unit_rate_applied', e.unit_rate_applied,
            'total_amount', e.total_amount,
            'payment_status', e.payment_status,
            'payment_mode', e.payment_mode,
            'created_at', e.created_at
          ) ORDER BY e.created_at DESC, e.id DESC
        )
        FROM entries e WHERE e.unit_id = v_unit.id AND e.is_deleted = false
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 6.17 SECTOR: FULL DASHBOARD DATA (SCOPED TO LOGGED-IN SECTOR, EXCLUDES DIVISION DIRECT)
CREATE OR REPLACE FUNCTION sector_get_dashboard(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_unit_rate NUMERIC;
  v_division_target NUMERIC;
  v_title TEXT;
  v_is_open BOOLEAN;
  v_result JSONB;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  SELECT COALESCE(value::NUMERIC, 250) INTO v_unit_rate FROM app_settings WHERE key = 'unit_rate';
  SELECT COALESCE(value::NUMERIC, 1000) INTO v_division_target FROM app_settings WHERE key = 'division_target';
  SELECT COALESCE(LOWER(TRIM(value)) = 'true', true) INTO v_is_open FROM app_settings WHERE key = 'is_challenge_open';
  SELECT COALESCE(value, 'SSF Wandoor Division Payasam Challenge') INTO v_title FROM app_settings WHERE key = 'challenge_title';

  WITH unit_agg AS (
    SELECT
      u.id,
      u.name,
      u.login_code,
      u.username,
      u.contact_phone,
      u.must_change_password,
      (u.password_hash IS NOT NULL) AS has_custom_password,
      v_sector.id AS sector_id,
      v_sector.name AS sector_name,
      v_sector.login_code AS sector_code,
      COUNT(e.id)::INT AS total_entries,
      COALESCE(SUM(e.quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'CASH' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS cash_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'UPI' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS upi_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS paid_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'UNPAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS unpaid_amount,
      COALESCE(COUNT(*) FILTER (WHERE e.payment_status = 'UNPAID'), 0)::INT AS unpaid_entries,
      COALESCE(SUM(e.total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM units u
    LEFT JOIN entries e ON e.unit_id = u.id AND e.is_deleted = false
    WHERE u.sector_id = v_sector.id
    GROUP BY u.id, u.name, u.login_code, u.username, u.contact_phone, u.must_change_password, u.password_hash
  )
  SELECT jsonb_build_object(
    'sector', jsonb_build_object('id', v_sector.id, 'name', v_sector.name, 'login_code', v_sector.login_code),
    'settings', jsonb_build_object(
      'unit_rate', v_unit_rate,
      'division_target', v_division_target,
      'challenge_title', v_title,
      'is_challenge_open', v_is_open
    ),
    'summary', (
      SELECT jsonb_build_object(
        'total_units', COUNT(*)::INT,
        'total_entries', COALESCE(SUM(total_entries), 0)::INT,
        'total_quantity', COALESCE(SUM(total_quantity), 0)::NUMERIC(10, 2),
        'cash_amount', COALESCE(SUM(cash_amount), 0)::NUMERIC(12, 2),
        'upi_amount', COALESCE(SUM(upi_amount), 0)::NUMERIC(12, 2),
        'paid_amount', COALESCE(SUM(paid_amount), 0)::NUMERIC(12, 2),
        'unpaid_amount', COALESCE(SUM(unpaid_amount), 0)::NUMERIC(12, 2),
        'unpaid_entries', COALESCE(SUM(unpaid_entries), 0)::INT,
        'total_amount', COALESCE(SUM(total_amount), 0)::NUMERIC(12, 2)
      )
      FROM unit_agg
    ),
    'units', COALESCE(
      (SELECT jsonb_agg(row_to_json(ua)::jsonb ORDER BY ua.total_quantity DESC, ua.name ASC) FROM unit_agg ua),
      '[]'::jsonb
    ),
    'entries', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'unit_id', u.id,
            'unit_name', u.name,
            'sector_name', v_sector.name,
            'is_division_direct', false,
            'contributor_name', e.contributor_name,
            'mobile_number', e.mobile_number,
            'quantity', e.quantity,
            'unit_rate_applied', e.unit_rate_applied,
            'total_amount', e.total_amount,
            'payment_status', e.payment_status,
            'payment_mode', e.payment_mode,
            'created_at', e.created_at
          ) ORDER BY e.created_at DESC, e.id DESC
        )
        FROM entries e
        JOIN units u ON u.id = e.unit_id
        WHERE u.sector_id = v_sector.id AND e.is_deleted = false
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 6.18 ADMIN: FULL DASHBOARD DATA (INCLUDES DIVISION DIRECT + UNPAID + CREDENTIALS)
CREATE OR REPLACE FUNCTION admin_get_dashboard(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  WITH settings_map AS (
    SELECT
      COALESCE(MAX(CASE WHEN key = 'unit_rate' THEN value END), '250')::NUMERIC AS unit_rate,
      COALESCE(MAX(CASE WHEN key = 'division_target' THEN value END), '10000')::NUMERIC AS division_target,
      COALESCE(MAX(CASE WHEN key = 'challenge_title' THEN value END), 'SSF Wandoor Division Payasam Challenge') AS challenge_title,
      COALESCE(MAX(CASE WHEN key = 'is_challenge_open' THEN value END), 'true') = 'true' AS is_challenge_open,
      COALESCE(MAX(CASE WHEN key = 'admin_whatsapp_phone' THEN value END), '') AS admin_whatsapp_phone
    FROM app_settings
  ),
  unit_agg AS (
    SELECT
      u.id,
      u.name,
      u.login_code,
      u.username,
      COALESCE(u.contact_phone, '') AS contact_phone,
      u.must_change_password,
      (u.password_hash IS NOT NULL) AS has_custom_password,
      u.sector_id,
      s.name AS sector_name,
      s.login_code AS sector_code,
      COUNT(e.id)::INT AS total_entries,
      COALESCE(SUM(e.quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'CASH' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS cash_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'UPI' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS upi_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS paid_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'UNPAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS unpaid_amount,
      COALESCE(COUNT(*) FILTER (WHERE e.payment_status = 'UNPAID'), 0)::INT AS unpaid_entries,
      COALESCE(SUM(e.total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM units u
    JOIN sectors s ON s.id = u.sector_id
    LEFT JOIN entries e ON e.unit_id = u.id AND e.is_deleted = false
    GROUP BY
      u.id, u.name, u.login_code, u.username, u.contact_phone, u.must_change_password, u.password_hash,
      u.sector_id, s.name, s.login_code
  ),
  all_entries_agg AS (
    SELECT
      COUNT(*)::INT AS total_entries,
      COALESCE(SUM(quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND payment_mode = 'CASH' THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS cash_amount,
      COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND payment_mode = 'UPI' THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS upi_amount,
      COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS paid_amount,
      COALESCE(SUM(CASE WHEN payment_status = 'UNPAID' THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS unpaid_amount,
      COALESCE(COUNT(*) FILTER (WHERE payment_status = 'UNPAID'), 0)::INT AS unpaid_entries,
      COALESCE(SUM(total_amount), 0)::NUMERIC(12, 2) AS total_amount,
      COALESCE(COUNT(*) FILTER (WHERE unit_id IS NULL), 0)::INT AS division_direct_entries,
      COALESCE(SUM(CASE WHEN unit_id IS NULL THEN quantity ELSE 0 END), 0)::NUMERIC(10, 2) AS division_direct_quantity,
      COALESCE(SUM(CASE WHEN unit_id IS NULL THEN total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS division_direct_amount
    FROM entries
    WHERE is_deleted = false
  )
  SELECT jsonb_build_object(
    'settings', (SELECT row_to_json(settings_map)::jsonb FROM settings_map),
    'summary', (
      SELECT jsonb_build_object(
        'total_units', (SELECT COUNT(*)::INT FROM unit_agg),
        'total_entries', a.total_entries,
        'total_quantity', a.total_quantity,
        'cash_amount', a.cash_amount,
        'upi_amount', a.upi_amount,
        'paid_amount', a.paid_amount,
        'unpaid_amount', a.unpaid_amount,
        'unpaid_entries', a.unpaid_entries,
        'total_amount', a.total_amount,
        'division_direct_entries', a.division_direct_entries,
        'division_direct_quantity', a.division_direct_quantity,
        'division_direct_amount', a.division_direct_amount
      )
      FROM all_entries_agg a
    ),
    'sectors', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', id,
            'name', name,
            'login_code', login_code,
            'username', username,
            'contact_phone', COALESCE(contact_phone, ''),
            'must_change_password', must_change_password,
            'has_custom_password', (password_hash IS NOT NULL)
          ) ORDER BY name ASC
        )
        FROM sectors
      ),
      '[]'::jsonb
    ),
    'unit_summaries', COALESCE(
      (SELECT jsonb_agg(row_to_json(ua)::jsonb ORDER BY ua.total_quantity DESC, ua.name ASC) FROM unit_agg ua),
      '[]'::jsonb
    ),
    'entries', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'unit_id', e.unit_id,
            'unit_name', COALESCE(u.name, 'Division Direct'),
            'sector_id', s.id,
            'sector_name', COALESCE(s.name, 'Division'),
            'is_division_direct', (e.unit_id IS NULL),
            'contributor_name', e.contributor_name,
            'mobile_number', e.mobile_number,
            'quantity', e.quantity,
            'unit_rate_applied', e.unit_rate_applied,
            'total_amount', e.total_amount,
            'payment_status', e.payment_status,
            'payment_mode', e.payment_mode,
            'created_at', e.created_at
          ) ORDER BY e.created_at DESC, e.id DESC
        )
        FROM entries e
        LEFT JOIN units u ON u.id = e.unit_id
        LEFT JOIN sectors s ON s.id = u.sector_id
        WHERE e.is_deleted = false
      ),
      '[]'::jsonb
    ),
    'pending_reset_requests', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pr.id,
            'account_type', pr.account_type,
            'account_id', pr.account_id,
            'account_name', pr.account_name,
            'username', pr.username,
            'login_code', pr.login_code,
            'contact_phone', COALESCE(pr.contact_phone, ''),
            'status', pr.status,
            'requested_at', pr.requested_at
          ) ORDER BY pr.requested_at DESC
        )
        FROM password_reset_requests pr
        WHERE pr.status = 'PENDING'
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 6.19 ADMIN: UPDATE ENTRY (WITH PAYMENT STATUS & ZERO-MINUS GUARD)
DROP FUNCTION IF EXISTS admin_update_entry(TEXT, INT, TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION admin_update_entry(
  p_code TEXT,
  p_entry_id INT,
  p_contributor_name TEXT,
  p_mobile_number TEXT,
  p_quantity NUMERIC,
  p_payment_mode TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'PAID'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_status TEXT := UPPER(TRIM(COALESCE(p_payment_status, '')));
  v_mode TEXT := NULLIF(UPPER(TRIM(COALESCE(p_payment_mode, ''))), '');
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  IF TRIM(COALESCE(p_contributor_name, '')) = '' THEN
    RAISE EXCEPTION 'Ordered by name is required';
  END IF;

  IF LENGTH(REGEXP_REPLACE(COALESCE(p_mobile_number, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'Valid 10-digit mobile number is required';
  END IF;

  p_quantity := ROUND(p_quantity, 2);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF p_quantity > 100000 THEN
    RAISE EXCEPTION 'Quantity cannot exceed 100000 L per order';
  END IF;

  IF v_status NOT IN ('PAID', 'UNPAID') THEN
    RAISE EXCEPTION 'Please select Paid or Unpaid status';
  END IF;

  IF v_status = 'PAID' AND (v_mode IS NULL OR v_mode NOT IN ('CASH', 'UPI')) THEN
    RAISE EXCEPTION 'Please select Cash Handover or UPI for Paid orders';
  END IF;

  IF v_status = 'UNPAID' AND v_mode IS NOT NULL THEN
    RAISE EXCEPTION 'Unpaid orders cannot have a payment method';
  END IF;

  UPDATE entries
  SET
    contributor_name = TRIM(p_contributor_name),
    mobile_number = TRIM(p_mobile_number),
    quantity = p_quantity,
    total_amount = ROUND(p_quantity * unit_rate_applied, 2),
    payment_status = v_status,
    payment_mode = v_mode
  WHERE id = p_entry_id AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found or already deleted';
  END IF;

  RETURN true;
END;
$$;

-- 6.20 ADMIN: SOFT DELETE ENTRY
CREATE OR REPLACE FUNCTION admin_delete_entry(p_code TEXT, p_entry_id INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  UPDATE entries SET is_deleted = true WHERE id = p_entry_id;
  RETURN FOUND;
END;
$$;

-- 6.21 ADMIN: UPDATE SETTINGS (WITH ZERO-MINUS GUARD)
DROP FUNCTION IF EXISTS admin_update_settings(TEXT, NUMERIC, NUMERIC, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION admin_update_settings(
  p_code TEXT,
  p_unit_rate NUMERIC,
  p_division_target NUMERIC,
  p_challenge_title TEXT,
  p_is_challenge_open BOOLEAN,
  p_admin_whatsapp_phone TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_phone TEXT;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  IF p_unit_rate IS NULL OR p_unit_rate <= 0 THEN
    RAISE EXCEPTION 'Unit rate must be greater than zero';
  END IF;

  IF p_unit_rate > 100000 THEN
    RAISE EXCEPTION 'Unit rate cannot exceed 100000 per liter';
  END IF;

  IF p_division_target IS NULL OR p_division_target < 0 THEN
    RAISE EXCEPTION 'Division limit cannot be negative';
  END IF;

  IF p_division_target = 0 THEN
    RAISE EXCEPTION 'Division limit must be greater than zero';
  END IF;

  IF TRIM(COALESCE(p_challenge_title, '')) = '' THEN
    RAISE EXCEPTION 'Challenge title is required';
  END IF;

  IF p_admin_whatsapp_phone IS NOT NULL THEN
    v_clean_phone := regexp_replace(TRIM(COALESCE(p_admin_whatsapp_phone, '')), '[^0-9]', '', 'g');
    IF v_clean_phone <> '' AND (length(v_clean_phone) < 10 OR length(v_clean_phone) > 15) THEN
      RAISE EXCEPTION 'Admin WhatsApp number must be 10 to 15 digits';
    END IF;
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('admin_whatsapp_phone', v_clean_phone, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  INSERT INTO app_settings (key, value, updated_at) VALUES
    ('unit_rate', p_unit_rate::TEXT, now()),
    ('division_target', p_division_target::TEXT, now()),
    ('challenge_title', TRIM(p_challenge_title), now()),
    ('is_challenge_open', CASE WHEN COALESCE(p_is_challenge_open, false) THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN true;
END;
$$;

-- 6.22 ADMIN: BULK UPSERT SECTORS & UNITS (SUPPORTS OPTIONAL PHONES)
CREATE OR REPLACE FUNCTION admin_bulk_upsert_units(p_code TEXT, p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_code TEXT;
  v_row JSONB;
  v_sector_name TEXT;
  v_sector_code TEXT;
  v_sector_phone TEXT;
  v_unit_name TEXT;
  v_unit_code TEXT;
  v_unit_phone TEXT;
  v_sector_id INT;
  v_unit_id INT;
  v_sector_username TEXT;
  v_unit_username TEXT;
  v_processed INT := 0;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  SELECT UPPER(TRIM(value)) INTO v_admin_code FROM app_settings WHERE key = 'admin_code';

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'No rows provided for import';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_sector_name := TRIM(COALESCE(v_row->>'sector_name', ''));
    v_sector_code := UPPER(TRIM(COALESCE(v_row->>'sector_code', '')));
    v_sector_phone := TRIM(COALESCE(v_row->>'sector_phone', ''));
    v_unit_name := TRIM(COALESCE(v_row->>'unit_name', ''));
    v_unit_code := UPPER(TRIM(COALESCE(v_row->>'unit_code', '')));
    v_unit_phone := TRIM(COALESCE(v_row->>'unit_phone', ''));

    IF v_sector_name = '' OR v_sector_code = '' OR v_unit_name = '' OR v_unit_code = '' THEN
      RAISE EXCEPTION 'Each row must include sector_name, sector_code, unit_name, and unit_code';
    END IF;

    IF v_unit_code = v_admin_code OR v_sector_code = v_admin_code THEN
      RAISE EXCEPTION 'Unit code cannot match Admin code';
    END IF;

    IF v_unit_code = v_sector_code THEN
      RAISE EXCEPTION 'Unit code and Sector code cannot be identical';
    END IF;

    SELECT id INTO v_sector_id
    FROM sectors
    WHERE UPPER(TRIM(login_code)) = v_sector_code;

    IF FOUND THEN
      IF EXISTS (
        SELECT 1 FROM sectors
        WHERE LOWER(TRIM(name)) = LOWER(v_sector_name) AND id <> v_sector_id
      ) THEN
        RAISE EXCEPTION 'Sector name "%" is already used by another sector', v_sector_name;
      END IF;

      UPDATE sectors
      SET
        name = v_sector_name,
        login_code = v_sector_code,
        username = CASE
          WHEN COALESCE(TRIM(username), '') = '' THEN resolve_unique_username(v_sector_name, v_sector_code, 'SECTOR', v_sector_id)
          ELSE username
        END,
        contact_phone = CASE WHEN v_sector_phone <> '' THEN v_sector_phone ELSE contact_phone END
      WHERE id = v_sector_id;
    ELSE
      IF EXISTS (
        SELECT 1 FROM units WHERE UPPER(TRIM(login_code)) = v_sector_code
      ) THEN
        RAISE EXCEPTION 'Sector code "%" is already assigned to a unit', v_sector_code;
      END IF;

      SELECT id INTO v_sector_id
      FROM sectors
      WHERE LOWER(TRIM(name)) = LOWER(v_sector_name);

      IF FOUND THEN
        UPDATE sectors
        SET
          name = v_sector_name,
          login_code = v_sector_code,
          username = CASE
            WHEN COALESCE(TRIM(username), '') = '' THEN resolve_unique_username(v_sector_name, v_sector_code, 'SECTOR', v_sector_id)
            ELSE username
          END,
          contact_phone = CASE WHEN v_sector_phone <> '' THEN v_sector_phone ELSE contact_phone END
        WHERE id = v_sector_id;
      ELSE
        v_sector_username := resolve_unique_username(v_sector_name, v_sector_code, 'SECTOR', NULL);
        INSERT INTO sectors (name, login_code, username, contact_phone)
        VALUES (v_sector_name, v_sector_code, v_sector_username, v_sector_phone)
        RETURNING id INTO v_sector_id;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM sectors WHERE UPPER(TRIM(login_code)) = v_unit_code
    ) THEN
      RAISE EXCEPTION 'Unit code "%" is already assigned to a sector', v_unit_code;
    END IF;

    SELECT id INTO v_unit_id
    FROM units
    WHERE UPPER(TRIM(login_code)) = v_unit_code;

    IF FOUND THEN
      UPDATE units
      SET
        name = v_unit_name,
        sector_id = v_sector_id,
        username = CASE
          WHEN COALESCE(TRIM(username), '') = '' THEN resolve_unique_username(v_unit_name, v_unit_code, 'UNIT', v_unit_id)
          ELSE username
        END,
        contact_phone = CASE WHEN v_unit_phone <> '' THEN v_unit_phone ELSE contact_phone END
      WHERE id = v_unit_id;
    ELSE
      v_unit_username := resolve_unique_username(v_unit_name, v_unit_code, 'UNIT', NULL);
      INSERT INTO units (sector_id, name, login_code, username, contact_phone)
      VALUES (v_sector_id, v_unit_name, v_unit_code, v_unit_username, v_unit_phone);
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', v_processed);
END;
$$;

-- 6.23 ADMIN: DELETE UNIT (ONLY IF NO ACTIVE ENTRIES)
CREATE OR REPLACE FUNCTION admin_delete_unit(p_code TEXT, p_unit_id INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_active_count INT;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  SELECT COUNT(*)::INT INTO v_active_count
  FROM entries
  WHERE unit_id = p_unit_id AND is_deleted = false;

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete unit with active entries. Delete its entries first.';
  END IF;

  DELETE FROM units WHERE id = p_unit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  DELETE FROM auth_sessions WHERE role = 'UNIT' AND entity_id = p_unit_id;
  DELETE FROM password_reset_requests WHERE account_type = 'UNIT' AND account_id = p_unit_id;

  RETURN true;
END;
$$;

-- 6.24 ADMIN: DELETE SECTOR (ONLY IF NO UNITS ASSIGNED)
CREATE OR REPLACE FUNCTION admin_delete_sector(p_code TEXT, p_sector_id INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_unit_count INT;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  SELECT COUNT(*)::INT INTO v_unit_count
  FROM units
  WHERE sector_id = p_sector_id;

  IF v_unit_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete sector while units are assigned to it. Remove or reassign its units first.';
  END IF;

  DELETE FROM sectors WHERE id = p_sector_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sector not found';
  END IF;

  DELETE FROM auth_sessions WHERE role = 'SECTOR' AND entity_id = p_sector_id;
  DELETE FROM password_reset_requests WHERE account_type = 'SECTOR' AND account_id = p_sector_id;

  RETURN true;
END;
$$;

-- 6.25 SECTOR: UPSERT UNIT
DROP FUNCTION IF EXISTS sector_upsert_unit(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION sector_upsert_unit(
  p_code TEXT,
  p_unit_name TEXT,
  p_unit_code TEXT,
  p_contact_phone TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_unit_name TEXT := TRIM(COALESCE(p_unit_name, ''));
  v_unit_code TEXT := UPPER(TRIM(COALESCE(p_unit_code, '')));
  v_contact_phone TEXT := TRIM(COALESCE(p_contact_phone, ''));
  v_admin_code TEXT;
  v_existing RECORD;
  v_username TEXT;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  IF v_unit_name = '' THEN
    RAISE EXCEPTION 'Unit name is required';
  END IF;

  IF v_unit_code = '' THEN
    RAISE EXCEPTION 'Unit login code is required';
  END IF;

  SELECT UPPER(TRIM(value)) INTO v_admin_code FROM app_settings WHERE key = 'admin_code';
  IF v_unit_code = v_admin_code THEN
    RAISE EXCEPTION 'Login code cannot match Admin code';
  END IF;

  IF EXISTS (SELECT 1 FROM sectors WHERE UPPER(TRIM(login_code)) = v_unit_code) THEN
    RAISE EXCEPTION 'Login code is already used by a sector';
  END IF;

  SELECT id, sector_id, username INTO v_existing FROM units WHERE UPPER(TRIM(login_code)) = v_unit_code;
  IF FOUND THEN
    IF v_existing.sector_id <> v_sector.id THEN
      RAISE EXCEPTION 'Login code belongs to a unit in another sector';
    END IF;
    UPDATE units
    SET
      name = v_unit_name,
      username = CASE
        WHEN COALESCE(TRIM(username), '') = '' THEN resolve_unique_username(v_unit_name, v_unit_code, 'UNIT', v_existing.id)
        ELSE username
      END,
      contact_phone = CASE WHEN v_contact_phone <> '' THEN v_contact_phone ELSE contact_phone END
    WHERE id = v_existing.id;
  ELSE
    v_username := resolve_unique_username(v_unit_name, v_unit_code, 'UNIT', NULL);
    INSERT INTO units (sector_id, name, login_code, username, contact_phone)
    VALUES (v_sector.id, v_unit_name, v_unit_code, v_username, v_contact_phone);
  END IF;

  RETURN jsonb_build_object('success', true, 'unit_code', v_unit_code);
END;
$$;

-- 6.26 SECTOR: BULK UPSERT UNITS (THIS SECTOR ONLY)
CREATE OR REPLACE FUNCTION sector_bulk_upsert_units(
  p_code TEXT,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_admin_code TEXT;
  v_row JSONB;
  v_unit_name TEXT;
  v_unit_code TEXT;
  v_unit_phone TEXT;
  v_existing RECORD;
  v_username TEXT;
  v_processed INT := 0;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'No rows provided for import';
  END IF;

  SELECT UPPER(TRIM(value)) INTO v_admin_code FROM app_settings WHERE key = 'admin_code';

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_unit_name := TRIM(COALESCE(v_row->>'unit_name', ''));
    v_unit_code := UPPER(TRIM(COALESCE(v_row->>'unit_code', '')));
    v_unit_phone := TRIM(COALESCE(v_row->>'unit_phone', ''));

    IF v_unit_name = '' THEN
      RAISE EXCEPTION 'Unit name is required';
    END IF;

    IF v_unit_code = '' THEN
      RAISE EXCEPTION 'Unit login code is required';
    END IF;

    IF v_unit_code = v_admin_code THEN
      RAISE EXCEPTION 'Login code cannot match Admin code';
    END IF;

    IF EXISTS (SELECT 1 FROM sectors WHERE UPPER(TRIM(login_code)) = v_unit_code) THEN
      RAISE EXCEPTION 'Login code is already used by a sector';
    END IF;

    SELECT id, sector_id, username INTO v_existing FROM units WHERE UPPER(TRIM(login_code)) = v_unit_code;
    IF FOUND THEN
      IF v_existing.sector_id <> v_sector.id THEN
        RAISE EXCEPTION 'Login code belongs to a unit in another sector';
      END IF;
      UPDATE units
      SET
        name = v_unit_name,
        username = CASE
          WHEN COALESCE(TRIM(username), '') = '' THEN resolve_unique_username(v_unit_name, v_unit_code, 'UNIT', v_existing.id)
          ELSE username
        END,
        contact_phone = CASE WHEN v_unit_phone <> '' THEN v_unit_phone ELSE contact_phone END
      WHERE id = v_existing.id;
    ELSE
      v_username := resolve_unique_username(v_unit_name, v_unit_code, 'UNIT', NULL);
      INSERT INTO units (sector_id, name, login_code, username, contact_phone)
      VALUES (v_sector.id, v_unit_name, v_unit_code, v_username, v_unit_phone);
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', v_processed);
END;
$$;

-- 6.27 SECTOR: DELETE UNIT (IF OWNED AND NO ACTIVE ORDERS)
CREATE OR REPLACE FUNCTION sector_delete_unit(
  p_code TEXT,
  p_unit_id INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  PERFORM 1 FROM units WHERE id = p_unit_id AND sector_id = v_sector.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found in your sector';
  END IF;

  IF EXISTS (SELECT 1 FROM entries WHERE unit_id = p_unit_id AND is_deleted = false) THEN
    RAISE EXCEPTION 'Cannot delete unit with active orders. Delete its orders first.';
  END IF;

  DELETE FROM units WHERE id = p_unit_id AND sector_id = v_sector.id;
  DELETE FROM auth_sessions WHERE role = 'UNIT' AND entity_id = p_unit_id;
  DELETE FROM password_reset_requests WHERE account_type = 'UNIT' AND account_id = p_unit_id;
  RETURN true;
END;
$$;

-- 6.28 SECTOR: UPDATE ENTRY (OWN SECTOR ONLY, WITH PAYMENT STATUS & ZERO-MINUS GUARD)
DROP FUNCTION IF EXISTS sector_update_entry(TEXT, INT, TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION sector_update_entry(
  p_code TEXT,
  p_entry_id INT,
  p_contributor_name TEXT,
  p_mobile_number TEXT,
  p_quantity NUMERIC,
  p_payment_mode TEXT DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'PAID'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_clean_mobile TEXT;
  v_status TEXT := UPPER(TRIM(COALESCE(p_payment_status, '')));
  v_mode TEXT := NULLIF(UPPER(TRIM(COALESCE(p_payment_mode, ''))), '');
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  IF TRIM(COALESCE(p_contributor_name, '')) = '' THEN
    RAISE EXCEPTION 'Ordered by name is required';
  END IF;

  v_clean_mobile := REGEXP_REPLACE(COALESCE(p_mobile_number, ''), '\D', '', 'g');
  IF LENGTH(v_clean_mobile) < 10 THEN
    RAISE EXCEPTION 'Valid 10-digit mobile number is required';
  END IF;

  p_quantity := ROUND(p_quantity, 2);
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF p_quantity > 100000 THEN
    RAISE EXCEPTION 'Quantity cannot exceed 100000 L per order';
  END IF;

  IF v_status NOT IN ('PAID', 'UNPAID') THEN
    RAISE EXCEPTION 'Please select Paid or Unpaid status';
  END IF;

  IF v_status = 'PAID' AND (v_mode IS NULL OR v_mode NOT IN ('CASH', 'UPI')) THEN
    RAISE EXCEPTION 'Please select Cash Handover or UPI for Paid orders';
  END IF;

  IF v_status = 'UNPAID' AND v_mode IS NOT NULL THEN
    RAISE EXCEPTION 'Unpaid orders cannot have a payment method';
  END IF;

  UPDATE entries e
  SET contributor_name = TRIM(p_contributor_name),
      mobile_number = TRIM(p_mobile_number),
      quantity = p_quantity,
      total_amount = ROUND(p_quantity * e.unit_rate_applied, 2),
      payment_status = v_status,
      payment_mode = v_mode
  WHERE e.id = p_entry_id
    AND e.is_deleted = false
    AND EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = e.unit_id AND u.sector_id = v_sector.id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found in your sector or already deleted';
  END IF;

  RETURN true;
END;
$$;

-- 6.29 SECTOR: SOFT DELETE ENTRY (OWN SECTOR ONLY)
CREATE OR REPLACE FUNCTION sector_delete_entry(
  p_code TEXT,
  p_entry_id INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  UPDATE entries e
  SET is_deleted = true
  WHERE e.id = p_entry_id
    AND e.is_deleted = false
    AND EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = e.unit_id AND u.sector_id = v_sector.id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found in your sector or already deleted';
  END IF;

  RETURN true;
END;
$$;

-- 6.30 ADMIN: PAGINATED & FILTERED CREDENTIALS DIRECTORY
CREATE OR REPLACE FUNCTION admin_list_credentials(
  p_code TEXT,
  p_role_filter TEXT DEFAULT 'ALL',
  p_sector_id INT DEFAULT NULL,
  p_search TEXT DEFAULT '',
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role TEXT := UPPER(TRIM(COALESCE(p_role_filter, 'ALL')));
  v_search TEXT := TRIM(COALESCE(p_search, ''));
  v_req_page INT := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INT := LEAST(GREATEST(COALESCE(p_page_size, 15), 1), 10000);
  v_total INT := 0;
  v_total_pages INT := 1;
  v_page INT := 1;
  v_offset INT := 0;
  v_items JSONB := '[]'::jsonb;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  SELECT COUNT(*)::INT INTO v_total
  FROM (
    SELECT
      'SECTOR'::TEXT AS account_type,
      s.id AS account_id,
      s.id AS sector_id,
      s.name AS sector_name,
      s.name AS name,
      'Sector Portal'::TEXT AS subtitle,
      COALESCE(s.username, s.name) AS username,
      s.login_code,
      COALESCE(s.contact_phone, '') AS contact_phone,
      EXISTS (
        SELECT 1 FROM password_reset_requests pr
        WHERE pr.status = 'PENDING'
          AND pr.account_type = 'SECTOR'
          AND pr.account_id = s.id
      ) AS is_reset_pending
    FROM sectors s
    UNION ALL
    SELECT
      'UNIT'::TEXT AS account_type,
      u.id AS account_id,
      u.sector_id,
      s.name AS sector_name,
      u.name AS name,
      s.name AS subtitle,
      COALESCE(u.username, u.name) AS username,
      u.login_code,
      COALESCE(u.contact_phone, '') AS contact_phone,
      EXISTS (
        SELECT 1 FROM password_reset_requests pr
        WHERE pr.status = 'PENDING'
          AND pr.account_type = 'UNIT'
          AND pr.account_id = u.id
      ) AS is_reset_pending
    FROM units u
    JOIN sectors s ON s.id = u.sector_id
  ) acc
  WHERE (p_sector_id IS NULL OR acc.sector_id = p_sector_id)
    AND (
      v_role = 'ALL'
      OR (v_role = 'SECTOR' AND acc.account_type = 'SECTOR')
      OR (v_role = 'UNIT' AND acc.account_type = 'UNIT')
      OR (v_role = 'PENDING' AND acc.is_reset_pending = true)
    )
    AND (
      v_search = ''
      OR acc.name ILIKE '%' || v_search || '%'
      OR acc.subtitle ILIKE '%' || v_search || '%'
      OR acc.username ILIKE '%' || v_search || '%'
      OR acc.login_code ILIKE '%' || v_search || '%'
      OR acc.contact_phone ILIKE '%' || v_search || '%'
    );

  v_total_pages := GREATEST(CEIL(v_total::NUMERIC / v_page_size)::INT, 1);
  v_page := LEAST(v_req_page, v_total_pages);
  v_offset := (v_page - 1) * v_page_size;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'account_type', p.account_type,
        'account_id', p.account_id,
        'sector_id', p.sector_id,
        'sector_name', p.sector_name,
        'name', p.name,
        'subtitle', p.subtitle,
        'username', p.username,
        'login_code', p.login_code,
        'contact_phone', p.contact_phone,
        'must_change_password', p.must_change_password,
        'has_custom_password', p.has_custom_password,
        'is_reset_pending', p.is_reset_pending
      )
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT *
    FROM (
      SELECT
        'SECTOR'::TEXT AS account_type,
        s.id AS account_id,
        s.id AS sector_id,
        s.name AS sector_name,
        s.name AS name,
        'Sector Portal'::TEXT AS subtitle,
        COALESCE(s.username, s.name) AS username,
        s.login_code,
        COALESCE(s.contact_phone, '') AS contact_phone,
        s.must_change_password,
        (s.password_hash IS NOT NULL) AS has_custom_password,
        EXISTS (
          SELECT 1 FROM password_reset_requests pr
          WHERE pr.status = 'PENDING'
            AND pr.account_type = 'SECTOR'
            AND pr.account_id = s.id
        ) AS is_reset_pending
      FROM sectors s
      UNION ALL
      SELECT
        'UNIT'::TEXT AS account_type,
        u.id AS account_id,
        u.sector_id,
        s.name AS sector_name,
        u.name AS name,
        s.name AS subtitle,
        COALESCE(u.username, u.name) AS username,
        u.login_code,
        COALESCE(u.contact_phone, '') AS contact_phone,
        u.must_change_password,
        (u.password_hash IS NOT NULL) AS has_custom_password,
        EXISTS (
          SELECT 1 FROM password_reset_requests pr
          WHERE pr.status = 'PENDING'
            AND pr.account_type = 'UNIT'
            AND pr.account_id = u.id
        ) AS is_reset_pending
      FROM units u
      JOIN sectors s ON s.id = u.sector_id
    ) acc
    WHERE (p_sector_id IS NULL OR acc.sector_id = p_sector_id)
      AND (
        v_role = 'ALL'
        OR (v_role = 'SECTOR' AND acc.account_type = 'SECTOR')
        OR (v_role = 'UNIT' AND acc.account_type = 'UNIT')
        OR (v_role = 'PENDING' AND acc.is_reset_pending = true)
      )
      AND (
        v_search = ''
        OR acc.name ILIKE '%' || v_search || '%'
        OR acc.subtitle ILIKE '%' || v_search || '%'
        OR acc.username ILIKE '%' || v_search || '%'
        OR acc.login_code ILIKE '%' || v_search || '%'
        OR acc.contact_phone ILIKE '%' || v_search || '%'
      )
    ORDER BY
      CASE WHEN acc.account_type = 'SECTOR' THEN 0 ELSE 1 END ASC,
      LOWER(acc.sector_name) ASC,
      NULLIF(regexp_replace(acc.login_code, '[^0-9]', '', 'g'), '')::INT ASC NULLS LAST,
      acc.login_code ASC
    LIMIT v_page_size
    OFFSET v_offset
  ) p;

  RETURN jsonb_build_object(
    'items', v_items,
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', v_total_pages
  );
END;
$$;

-- 6.31 ADMIN: PAGINATED, FILTERED & SORTED UNITS SUMMARY
CREATE OR REPLACE FUNCTION admin_list_units(
  p_code TEXT,
  p_sector_id INT DEFAULT NULL,
  p_search TEXT DEFAULT '',
  p_sort TEXT DEFAULT 'highest',
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_search TEXT := TRIM(COALESCE(p_search, ''));
  v_sort TEXT := LOWER(TRIM(COALESCE(p_sort, 'highest')));
  v_req_page INT := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INT := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 10000);
  v_total INT := 0;
  v_total_pages INT := 1;
  v_page INT := 1;
  v_offset INT := 0;
  v_totals JSONB;
  v_items JSONB := '[]'::jsonb;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  WITH filtered_units AS (
    SELECT
      u.id,
      u.name,
      u.login_code,
      u.username,
      COALESCE(u.contact_phone, '') AS contact_phone,
      u.must_change_password,
      (u.password_hash IS NOT NULL) AS has_custom_password,
      u.sector_id,
      s.name AS sector_name,
      s.login_code AS sector_code,
      COUNT(e.id)::INT AS total_entries,
      COALESCE(SUM(e.quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'CASH' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS cash_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'UPI' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS upi_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS paid_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'UNPAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS unpaid_amount,
      COALESCE(COUNT(*) FILTER (WHERE e.payment_status = 'UNPAID'), 0)::INT AS unpaid_entries,
      COALESCE(SUM(e.total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM units u
    JOIN sectors s ON s.id = u.sector_id
    LEFT JOIN entries e ON e.unit_id = u.id AND e.is_deleted = false
    WHERE (p_sector_id IS NULL OR u.sector_id = p_sector_id)
      AND (
        v_search = ''
        OR u.name ILIKE '%' || v_search || '%'
        OR u.login_code ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
        OR s.login_code ILIKE '%' || v_search || '%'
      )
    GROUP BY
      u.id, u.name, u.login_code, u.username, u.contact_phone, u.must_change_password, u.password_hash,
      u.sector_id, s.name, s.login_code
  )
  SELECT
    COUNT(*)::INT,
    jsonb_build_object(
      'total_entries', COALESCE(SUM(total_entries), 0)::INT,
      'total_quantity', COALESCE(SUM(total_quantity), 0)::NUMERIC(10, 2),
      'cash_amount', COALESCE(SUM(cash_amount), 0)::NUMERIC(12, 2),
      'upi_amount', COALESCE(SUM(upi_amount), 0)::NUMERIC(12, 2),
      'unpaid_amount', COALESCE(SUM(unpaid_amount), 0)::NUMERIC(12, 2),
      'total_amount', COALESCE(SUM(total_amount), 0)::NUMERIC(12, 2)
    )
  INTO v_total, v_totals
  FROM filtered_units;

  v_total_pages := GREATEST(CEIL(v_total::NUMERIC / v_page_size)::INT, 1);
  v_page := LEAST(v_req_page, v_total_pages);
  v_offset := (v_page - 1) * v_page_size;

  WITH filtered_units AS (
    SELECT
      u.id,
      u.name,
      u.login_code,
      u.username,
      COALESCE(u.contact_phone, '') AS contact_phone,
      u.must_change_password,
      (u.password_hash IS NOT NULL) AS has_custom_password,
      u.sector_id,
      s.name AS sector_name,
      s.login_code AS sector_code,
      COUNT(e.id)::INT AS total_entries,
      COALESCE(SUM(e.quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'CASH' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS cash_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'UPI' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS upi_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS paid_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'UNPAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS unpaid_amount,
      COALESCE(COUNT(*) FILTER (WHERE e.payment_status = 'UNPAID'), 0)::INT AS unpaid_entries,
      COALESCE(SUM(e.total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM units u
    JOIN sectors s ON s.id = u.sector_id
    LEFT JOIN entries e ON e.unit_id = u.id AND e.is_deleted = false
    WHERE (p_sector_id IS NULL OR u.sector_id = p_sector_id)
      AND (
        v_search = ''
        OR u.name ILIKE '%' || v_search || '%'
        OR u.login_code ILIKE '%' || v_search || '%'
        OR s.name ILIKE '%' || v_search || '%'
        OR s.login_code ILIKE '%' || v_search || '%'
      )
    GROUP BY
      u.id, u.name, u.login_code, u.username, u.contact_phone, u.must_change_password, u.password_hash,
      u.sector_id, s.name, s.login_code
    ORDER BY
      CASE WHEN v_sort = 'highest' THEN COALESCE(SUM(e.quantity), 0) END DESC,
      CASE WHEN v_sort = 'lowest' THEN COALESCE(SUM(e.quantity), 0) END ASC,
      CASE WHEN v_sort = 'name' THEN LOWER(u.name) END ASC,
      CASE WHEN v_sort = 'code' THEN LOWER(s.name) END ASC,
      CASE WHEN v_sort = 'code' THEN NULLIF(regexp_replace(u.login_code, '[^0-9]', '', 'g'), '')::INT END ASC NULLS LAST,
      LOWER(u.name) ASC,
      u.login_code ASC
    LIMIT v_page_size
    OFFSET v_offset
  )
  SELECT COALESCE(jsonb_agg(row_to_json(filtered_units)::jsonb), '[]'::jsonb)
  INTO v_items
  FROM filtered_units;

  RETURN jsonb_build_object(
    'items', v_items,
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', v_total_pages,
    'totals', COALESCE(
      v_totals,
      jsonb_build_object(
        'total_entries', 0,
        'total_quantity', 0,
        'cash_amount', 0,
        'upi_amount', 0,
        'unpaid_amount', 0,
        'total_amount', 0
      )
    )
  );
END;
$$;

-- 6.32 ADMIN: PAGINATED & FILTERED ENTRIES
CREATE OR REPLACE FUNCTION admin_list_entries(
  p_code TEXT,
  p_sector_filter TEXT DEFAULT 'ALL',
  p_unit_filter TEXT DEFAULT 'ALL',
  p_payment_status TEXT DEFAULT 'ALL',
  p_payment_mode TEXT DEFAULT 'ALL',
  p_search TEXT DEFAULT '',
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sec_filter TEXT := UPPER(TRIM(COALESCE(p_sector_filter, 'ALL')));
  v_unit_filter TEXT := UPPER(TRIM(COALESCE(p_unit_filter, 'ALL')));
  v_status TEXT := UPPER(TRIM(COALESCE(p_payment_status, 'ALL')));
  v_mode TEXT := UPPER(TRIM(COALESCE(p_payment_mode, 'ALL')));
  v_search TEXT := TRIM(COALESCE(p_search, ''));
  v_req_page INT := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INT := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 10000);
  v_total INT := 0;
  v_total_pages INT := 1;
  v_page INT := 1;
  v_offset INT := 0;
  v_items JSONB := '[]'::jsonb;
BEGIN
  IF NOT is_valid_admin_auth(p_code) THEN
    RAISE EXCEPTION 'Unauthorized admin code';
  END IF;

  SELECT COUNT(*)::INT INTO v_total
  FROM entries e
  LEFT JOIN units u ON u.id = e.unit_id
  LEFT JOIN sectors s ON s.id = u.sector_id
  WHERE e.is_deleted = false
    AND (
      v_sec_filter = 'ALL'
      OR (v_sec_filter = 'DIRECT' AND e.unit_id IS NULL)
      OR (v_sec_filter ~ '^[0-9]+$' AND s.id = v_sec_filter::INT)
    )
    AND (
      v_unit_filter = 'ALL'
      OR (v_unit_filter = 'DIRECT' AND e.unit_id IS NULL)
      OR (v_unit_filter ~ '^[0-9]+$' AND e.unit_id = v_unit_filter::INT)
    )
    AND (v_status = 'ALL' OR e.payment_status = v_status)
    AND (v_mode = 'ALL' OR e.payment_mode = v_mode)
    AND (
      v_search = ''
      OR e.contributor_name ILIKE '%' || v_search || '%'
      OR e.mobile_number ILIKE '%' || v_search || '%'
      OR COALESCE(u.name, 'Division Direct') ILIKE '%' || v_search || '%'
      OR COALESCE(s.name, 'Division') ILIKE '%' || v_search || '%'
      OR COALESCE(u.login_code, '') ILIKE '%' || v_search || '%'
    );

  v_total_pages := GREATEST(CEIL(v_total::NUMERIC / v_page_size)::INT, 1);
  v_page := LEAST(v_req_page, v_total_pages);
  v_offset := (v_page - 1) * v_page_size;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'unit_id', p.unit_id,
        'unit_name', p.unit_name,
        'sector_id', p.sector_id,
        'sector_name', p.sector_name,
        'is_division_direct', p.is_division_direct,
        'contributor_name', p.contributor_name,
        'mobile_number', p.mobile_number,
        'quantity', p.quantity,
        'unit_rate_applied', p.unit_rate_applied,
        'total_amount', p.total_amount,
        'payment_status', p.payment_status,
        'payment_mode', p.payment_mode,
        'created_at', p.created_at
      )
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      e.id,
      e.unit_id,
      COALESCE(u.name, 'Division Direct') AS unit_name,
      s.id AS sector_id,
      COALESCE(s.name, 'Division') AS sector_name,
      (e.unit_id IS NULL) AS is_division_direct,
      e.contributor_name,
      e.mobile_number,
      e.quantity,
      e.unit_rate_applied,
      e.total_amount,
      e.payment_status,
      e.payment_mode,
      e.created_at
    FROM entries e
    LEFT JOIN units u ON u.id = e.unit_id
    LEFT JOIN sectors s ON s.id = u.sector_id
    WHERE e.is_deleted = false
      AND (
        v_sec_filter = 'ALL'
        OR (v_sec_filter = 'DIRECT' AND e.unit_id IS NULL)
        OR (v_sec_filter ~ '^[0-9]+$' AND s.id = v_sec_filter::INT)
      )
      AND (
        v_unit_filter = 'ALL'
        OR (v_unit_filter = 'DIRECT' AND e.unit_id IS NULL)
        OR (v_unit_filter ~ '^[0-9]+$' AND e.unit_id = v_unit_filter::INT)
      )
      AND (v_status = 'ALL' OR e.payment_status = v_status)
      AND (v_mode = 'ALL' OR e.payment_mode = v_mode)
      AND (
        v_search = ''
        OR e.contributor_name ILIKE '%' || v_search || '%'
        OR e.mobile_number ILIKE '%' || v_search || '%'
        OR COALESCE(u.name, 'Division Direct') ILIKE '%' || v_search || '%'
        OR COALESCE(s.name, 'Division') ILIKE '%' || v_search || '%'
        OR COALESCE(u.login_code, '') ILIKE '%' || v_search || '%'
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  ) p;

  RETURN jsonb_build_object(
    'items', v_items,
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', v_total_pages
  );
END;
$$;

-- 6.33 SECTOR: PAGINATED, FILTERED & SORTED UNITS (OWN SECTOR ONLY)
CREATE OR REPLACE FUNCTION sector_list_units(
  p_code TEXT,
  p_search TEXT DEFAULT '',
  p_sort TEXT DEFAULT 'highest',
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_search TEXT := TRIM(COALESCE(p_search, ''));
  v_sort TEXT := LOWER(TRIM(COALESCE(p_sort, 'highest')));
  v_req_page INT := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INT := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 10000);
  v_total INT := 0;
  v_total_pages INT := 1;
  v_page INT := 1;
  v_offset INT := 0;
  v_totals JSONB;
  v_items JSONB := '[]'::jsonb;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  WITH filtered_units AS (
    SELECT
      u.id,
      u.name,
      u.login_code,
      u.username,
      COALESCE(u.contact_phone, '') AS contact_phone,
      u.must_change_password,
      (u.password_hash IS NOT NULL) AS has_custom_password,
      u.sector_id,
      v_sector.name AS sector_name,
      COUNT(e.id)::INT AS total_entries,
      COALESCE(SUM(e.quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'CASH' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS cash_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'UPI' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS upi_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS paid_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'UNPAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS unpaid_amount,
      COALESCE(COUNT(*) FILTER (WHERE e.payment_status = 'UNPAID'), 0)::INT AS unpaid_entries,
      COALESCE(SUM(e.total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM units u
    LEFT JOIN entries e ON e.unit_id = u.id AND e.is_deleted = false
    WHERE u.sector_id = v_sector.id
      AND (
        v_search = ''
        OR u.name ILIKE '%' || v_search || '%'
        OR u.login_code ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, u.login_code, u.username, u.contact_phone, u.must_change_password, u.password_hash, u.sector_id
  )
  SELECT
    COUNT(*)::INT,
    jsonb_build_object(
      'total_entries', COALESCE(SUM(total_entries), 0)::INT,
      'total_quantity', COALESCE(SUM(total_quantity), 0)::NUMERIC(10, 2),
      'cash_amount', COALESCE(SUM(cash_amount), 0)::NUMERIC(12, 2),
      'upi_amount', COALESCE(SUM(upi_amount), 0)::NUMERIC(12, 2),
      'unpaid_amount', COALESCE(SUM(unpaid_amount), 0)::NUMERIC(12, 2),
      'total_amount', COALESCE(SUM(total_amount), 0)::NUMERIC(12, 2)
    )
  INTO v_total, v_totals
  FROM filtered_units;

  v_total_pages := GREATEST(CEIL(v_total::NUMERIC / v_page_size)::INT, 1);
  v_page := LEAST(v_req_page, v_total_pages);
  v_offset := (v_page - 1) * v_page_size;

  WITH filtered_units AS (
    SELECT
      u.id,
      u.name,
      u.login_code,
      u.username,
      COALESCE(u.contact_phone, '') AS contact_phone,
      u.must_change_password,
      (u.password_hash IS NOT NULL) AS has_custom_password,
      u.sector_id,
      v_sector.name AS sector_name,
      COUNT(e.id)::INT AS total_entries,
      COALESCE(SUM(e.quantity), 0)::NUMERIC(10, 2) AS total_quantity,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'CASH' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS cash_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' AND e.payment_mode = 'UPI' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS upi_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'PAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS paid_amount,
      COALESCE(SUM(CASE WHEN e.payment_status = 'UNPAID' THEN e.total_amount ELSE 0 END), 0)::NUMERIC(12, 2) AS unpaid_amount,
      COALESCE(COUNT(*) FILTER (WHERE e.payment_status = 'UNPAID'), 0)::INT AS unpaid_entries,
      COALESCE(SUM(e.total_amount), 0)::NUMERIC(12, 2) AS total_amount
    FROM units u
    LEFT JOIN entries e ON e.unit_id = u.id AND e.is_deleted = false
    WHERE u.sector_id = v_sector.id
      AND (
        v_search = ''
        OR u.name ILIKE '%' || v_search || '%'
        OR u.login_code ILIKE '%' || v_search || '%'
      )
    GROUP BY u.id, u.name, u.login_code, u.username, u.contact_phone, u.must_change_password, u.password_hash, u.sector_id
    ORDER BY
      CASE WHEN v_sort = 'highest' THEN COALESCE(SUM(e.quantity), 0) END DESC,
      CASE WHEN v_sort = 'lowest' THEN COALESCE(SUM(e.quantity), 0) END ASC,
      CASE WHEN v_sort = 'name' THEN LOWER(u.name) END ASC,
      CASE WHEN v_sort = 'code' THEN NULLIF(regexp_replace(u.login_code, '[^0-9]', '', 'g'), '')::INT END ASC NULLS LAST,
      LOWER(u.name) ASC,
      u.login_code ASC
    LIMIT v_page_size
    OFFSET v_offset
  )
  SELECT COALESCE(jsonb_agg(row_to_json(filtered_units)::jsonb), '[]'::jsonb)
  INTO v_items
  FROM filtered_units;

  RETURN jsonb_build_object(
    'items', v_items,
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', v_total_pages,
    'totals', COALESCE(
      v_totals,
      jsonb_build_object(
        'total_entries', 0,
        'total_quantity', 0,
        'cash_amount', 0,
        'upi_amount', 0,
        'unpaid_amount', 0,
        'total_amount', 0
      )
    )
  );
END;
$$;

-- 6.34 SECTOR: PAGINATED & FILTERED ENTRIES (OWN SECTOR ONLY)
CREATE OR REPLACE FUNCTION sector_list_entries(
  p_code TEXT,
  p_unit_id INT DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'ALL',
  p_payment_mode TEXT DEFAULT 'ALL',
  p_search TEXT DEFAULT '',
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_status TEXT := UPPER(TRIM(COALESCE(p_payment_status, 'ALL')));
  v_mode TEXT := UPPER(TRIM(COALESCE(p_payment_mode, 'ALL')));
  v_search TEXT := TRIM(COALESCE(p_search, ''));
  v_req_page INT := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INT := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 10000);
  v_total INT := 0;
  v_total_pages INT := 1;
  v_page INT := 1;
  v_offset INT := 0;
  v_items JSONB := '[]'::jsonb;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  SELECT COUNT(*)::INT INTO v_total
  FROM entries e
  JOIN units u ON u.id = e.unit_id
  WHERE u.sector_id = v_sector.id
    AND e.is_deleted = false
    AND (p_unit_id IS NULL OR e.unit_id = p_unit_id)
    AND (v_status = 'ALL' OR e.payment_status = v_status)
    AND (v_mode = 'ALL' OR e.payment_mode = v_mode)
    AND (
      v_search = ''
      OR e.contributor_name ILIKE '%' || v_search || '%'
      OR e.mobile_number ILIKE '%' || v_search || '%'
      OR u.name ILIKE '%' || v_search || '%'
      OR u.login_code ILIKE '%' || v_search || '%'
    );

  v_total_pages := GREATEST(CEIL(v_total::NUMERIC / v_page_size)::INT, 1);
  v_page := LEAST(v_req_page, v_total_pages);
  v_offset := (v_page - 1) * v_page_size;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'unit_id', p.unit_id,
        'unit_name', p.unit_name,
        'sector_id', v_sector.id,
        'sector_name', v_sector.name,
        'contributor_name', p.contributor_name,
        'mobile_number', p.mobile_number,
        'quantity', p.quantity,
        'unit_rate_applied', p.unit_rate_applied,
        'total_amount', p.total_amount,
        'payment_status', p.payment_status,
        'payment_mode', p.payment_mode,
        'created_at', p.created_at
      )
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      e.id,
      e.unit_id,
      u.name AS unit_name,
      e.contributor_name,
      e.mobile_number,
      e.quantity,
      e.unit_rate_applied,
      e.total_amount,
      e.payment_status,
      e.payment_mode,
      e.created_at
    FROM entries e
    JOIN units u ON u.id = e.unit_id
    WHERE u.sector_id = v_sector.id
      AND e.is_deleted = false
      AND (p_unit_id IS NULL OR e.unit_id = p_unit_id)
      AND (v_status = 'ALL' OR e.payment_status = v_status)
      AND (v_mode = 'ALL' OR e.payment_mode = v_mode)
      AND (
        v_search = ''
        OR e.contributor_name ILIKE '%' || v_search || '%'
        OR e.mobile_number ILIKE '%' || v_search || '%'
        OR u.name ILIKE '%' || v_search || '%'
        OR u.login_code ILIKE '%' || v_search || '%'
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  ) p;

  RETURN jsonb_build_object(
    'items', v_items,
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', v_total_pages
  );
END;
$$;

-- 6.35 UNIT: PAGINATED & FILTERED ENTRIES (OWN UNIT ONLY)
CREATE OR REPLACE FUNCTION unit_list_entries(
  p_code TEXT,
  p_payment_status TEXT DEFAULT 'ALL',
  p_payment_mode TEXT DEFAULT 'ALL',
  p_search TEXT DEFAULT '',
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_unit units%ROWTYPE;
  v_status TEXT := UPPER(TRIM(COALESCE(p_payment_status, 'ALL')));
  v_mode TEXT := UPPER(TRIM(COALESCE(p_payment_mode, 'ALL')));
  v_search TEXT := TRIM(COALESCE(p_search, ''));
  v_req_page INT := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INT := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 10000);
  v_total INT := 0;
  v_total_pages INT := 1;
  v_page INT := 1;
  v_offset INT := 0;
  v_items JSONB := '[]'::jsonb;
BEGIN
  v_unit := resolve_unit_by_auth(p_code);

  SELECT COUNT(*)::INT INTO v_total
  FROM entries e
  WHERE e.unit_id = v_unit.id
    AND e.is_deleted = false
    AND (v_status = 'ALL' OR e.payment_status = v_status)
    AND (v_mode = 'ALL' OR e.payment_mode = v_mode)
    AND (
      v_search = ''
      OR e.contributor_name ILIKE '%' || v_search || '%'
      OR e.mobile_number ILIKE '%' || v_search || '%'
    );

  v_total_pages := GREATEST(CEIL(v_total::NUMERIC / v_page_size)::INT, 1);
  v_page := LEAST(v_req_page, v_total_pages);
  v_offset := (v_page - 1) * v_page_size;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'unit_id', p.unit_id,
        'unit_name', v_unit.name,
        'sector_id', v_unit.sector_id,
        'contributor_name', p.contributor_name,
        'mobile_number', p.mobile_number,
        'quantity', p.quantity,
        'unit_rate_applied', p.unit_rate_applied,
        'total_amount', p.total_amount,
        'payment_status', p.payment_status,
        'payment_mode', p.payment_mode,
        'created_at', p.created_at
      )
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      e.id,
      e.unit_id,
      e.contributor_name,
      e.mobile_number,
      e.quantity,
      e.unit_rate_applied,
      e.total_amount,
      e.payment_status,
      e.payment_mode,
      e.created_at
    FROM entries e
    WHERE e.unit_id = v_unit.id
      AND e.is_deleted = false
      AND (v_status = 'ALL' OR e.payment_status = v_status)
      AND (v_mode = 'ALL' OR e.payment_mode = v_mode)
      AND (
        v_search = ''
        OR e.contributor_name ILIKE '%' || v_search || '%'
        OR e.mobile_number ILIKE '%' || v_search || '%'
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  ) p;

  RETURN jsonb_build_object(
    'items', v_items,
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', v_total_pages
  );
END;
$$;

-- 6.36 HELP KNOWLEDGE BASE VERSION-AWARE SYNC (READ-ONLY)
CREATE OR REPLACE FUNCTION get_help_kb_sync(p_client_version INT DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row help_kb_store%ROWTYPE;
  v_admin_phone TEXT := COALESCE((SELECT value FROM app_settings WHERE key = 'admin_whatsapp_phone'), '');
BEGIN
  SELECT * INTO v_row FROM help_kb_store WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'up_to_date', true,
      'version', 0,
      'admin_whatsapp_phone', v_admin_phone,
      'payload', NULL
    );
  END IF;
  IF COALESCE(p_client_version, 0) >= v_row.version THEN
    RETURN jsonb_build_object(
      'up_to_date', true,
      'version', v_row.version,
      'admin_whatsapp_phone', v_admin_phone
    );
  END IF;
  RETURN jsonb_build_object(
    'up_to_date', false,
    'version', v_row.version,
    'updated_at', v_row.updated_at,
    'admin_whatsapp_phone', v_admin_phone,
    'payload', v_row.payload
  );
END;
$$;

-- 7. GRANT RPC EXECUTION TO ANON & AUTHENTICATED
GRANT EXECUTE ON FUNCTION
  verify_login_code(TEXT),
  get_login_directory(),
  auth_login(TEXT, TEXT),
  auth_refresh_session(TEXT),
  auth_complete_first_login(TEXT, TEXT, TEXT),
  auth_logout(TEXT),
  auth_mark_doc_page_seen(TEXT, TEXT),
  request_password_reset(TEXT),
  admin_reset_account_password(TEXT, TEXT, INT, TEXT),
  admin_dismiss_reset_request(TEXT, INT),
  admin_update_account_contact(TEXT, TEXT, INT, TEXT),
  get_public_stats(),
  public_add_order(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT),
  unit_add_entry(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT),
  admin_add_entry(TEXT, INT, TEXT, TEXT, NUMERIC, TEXT, TEXT),
  unit_mark_entry_paid(TEXT, INT, TEXT),
  sector_mark_entry_paid(TEXT, INT, TEXT),
  admin_mark_entry_paid(TEXT, INT, TEXT),
  unit_get_dashboard(TEXT),
  sector_get_dashboard(TEXT),
  admin_get_dashboard(TEXT),
  admin_update_entry(TEXT, INT, TEXT, TEXT, NUMERIC, TEXT, TEXT),
  admin_delete_entry(TEXT, INT),
  admin_update_settings(TEXT, NUMERIC, NUMERIC, TEXT, BOOLEAN, TEXT),
  admin_bulk_upsert_units(TEXT, JSONB),
  admin_delete_unit(TEXT, INT),
  admin_delete_sector(TEXT, INT),
  sector_upsert_unit(TEXT, TEXT, TEXT, TEXT),
  sector_bulk_upsert_units(TEXT, JSONB),
  sector_delete_unit(TEXT, INT),
  sector_update_entry(TEXT, INT, TEXT, TEXT, NUMERIC, TEXT, TEXT),
  sector_delete_entry(TEXT, INT),
  admin_list_credentials(TEXT, TEXT, INT, TEXT, INT, INT),
  admin_list_units(TEXT, INT, TEXT, TEXT, INT, INT),
  admin_list_entries(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT),
  sector_list_units(TEXT, TEXT, TEXT, INT, INT),
  sector_list_entries(TEXT, INT, TEXT, TEXT, TEXT, INT, INT),
  unit_list_entries(TEXT, TEXT, TEXT, TEXT, INT, INT),
  get_help_kb_sync(INT)
TO anon, authenticated;
