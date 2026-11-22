-- =============================================================================
-- WEB PUSH NOTIFICATIONS MIGRATION (ORDER-COUNT MILESTONES + APP UPDATE ALERTS)
-- 100% Idempotent & Safe for Live Databases
-- =============================================================================

-- 1. PUSH SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  account_id TEXT NULL, -- 'division:0', 'sector:<id>', 'unit:<id>' or NULL for 'public'
  role TEXT NOT NULL CHECK (role IN ('division', 'sector', 'unit', 'public')),
  sector_id INT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  unit_id INT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ALTER COLUMN account_id DROP NOT NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'push_subscriptions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_role_check CHECK (role IN ('division', 'sector', 'unit', 'public'));

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_role
  ON push_subscriptions(role);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_sector_id
  ON push_subscriptions(sector_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_unit_id
  ON push_subscriptions(unit_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_account_id
  ON push_subscriptions(account_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE push_subscriptions FROM anon, authenticated;

-- 2. PUSH DISPATCH LOG TABLE (ATOMIC CONCURRENCY & DEDUPLICATION GUARD)
CREATE TABLE IF NOT EXISTS push_dispatch_log (
  event_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_dispatch_log_type_created
  ON push_dispatch_log(event_type, created_at DESC);

ALTER TABLE push_dispatch_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE push_dispatch_log FROM anon, authenticated;

-- 3. PRE-EXISTING ORDER MILESTONE BACKFILL GUARD
-- Marks ONLY milestones strictly already passed prior to migration so existing orders
-- do not emit retroactive notifications on the next order, while all upcoming
-- milestones (10, 20, 30... for Unit/Sector and 50, 100, 150... for Division) fire cleanly.
DO $$
DECLARE
  v_rec RECORD;
  v_m INT;
  v_div_count INT := 0;
  v_div_max INT := 0;
BEGIN
  FOR v_rec IN
    SELECT unit_id, COUNT(*)::INT AS cnt
    FROM entries
    WHERE is_deleted = false AND unit_id IS NOT NULL
    GROUP BY unit_id
    HAVING COUNT(*) >= 10
  LOOP
    FOR v_m IN SELECT generate_series(10, (v_rec.cnt / 10) * 10, 10)
    LOOP
      INSERT INTO push_dispatch_log (event_key, event_type, payload)
      VALUES (
        'unit_milestone:' || v_rec.unit_id || ':' || v_m,
        'unit_milestone',
        jsonb_build_object('pre_migration_backfill', true, 'milestone', v_m)
      )
      ON CONFLICT (event_key) DO NOTHING;
    END LOOP;
  END LOOP;

  FOR v_rec IN
    SELECT u.sector_id, COUNT(*)::INT AS cnt
    FROM entries e
    JOIN units u ON u.id = e.unit_id
    WHERE e.is_deleted = false
    GROUP BY u.sector_id
    HAVING COUNT(*) >= 10
  LOOP
    FOR v_m IN SELECT generate_series(10, (v_rec.cnt / 10) * 10, 10)
    LOOP
      INSERT INTO push_dispatch_log (event_key, event_type, payload)
      VALUES (
        'sector_milestone:' || v_rec.sector_id || ':' || v_m,
        'sector_milestone',
        jsonb_build_object('pre_migration_backfill', true, 'milestone', v_m)
      )
      ON CONFLICT (event_key) DO NOTHING;
    END LOOP;
  END LOOP;

  SELECT COUNT(*)::INT INTO v_div_count
  FROM entries
  WHERE is_deleted = false;

  v_div_max := (v_div_count / 50) * 50;
  IF v_div_max >= 50 THEN
    FOR v_m IN SELECT generate_series(50, v_div_max, 50)
    LOOP
      INSERT INTO push_dispatch_log (event_key, event_type, payload)
      VALUES (
        'division_milestone:' || v_m,
        'division_milestone',
        jsonb_build_object('pre_migration_backfill', true, 'milestone', v_m)
      )
      ON CONFLICT (event_key) DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- 4. TRUSTED SESSION VALIDATION RPC FOR CLOUDFLARE PUSH FUNCTIONS
CREATE OR REPLACE FUNCTION push_verify_session(p_token TEXT)
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
  v_jwt_role TEXT;
  v_session_uuid UUID;
  v_sess auth_sessions%ROWTYPE;
  v_admin_user TEXT;
  v_sector sectors%ROWTYPE;
  v_unit units%ROWTYPE;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  v_parts := string_to_array(v_clean, '.');
  IF array_length(v_parts, 1) = 3 THEN
    SELECT value INTO v_secret FROM app_internal_secrets WHERE key = 'jwt_secret';
    IF v_secret IS NULL OR v_secret = '' THEN
      RETURN jsonb_build_object('valid', false);
    END IF;

    v_expected_sig := base64url_encode(
      hmac(
        convert_to(v_parts[1] || '.' || v_parts[2], 'UTF8'),
        convert_to(v_secret, 'UTF8'),
        'sha256'
      )
    );

    IF v_parts[3] <> v_expected_sig THEN
      RETURN jsonb_build_object('valid', false);
    END IF;

    BEGIN
      v_payload_json := convert_from(base64url_decode(v_parts[2]), 'UTF8')::JSONB;
      v_jwt_role := COALESCE(v_payload_json->>'role', '');
      v_session_uuid := (v_payload_json->>'jti')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('valid', false);
    END;
  ELSIF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_session_uuid := v_clean::UUID;
    v_jwt_role := NULL;
  ELSE
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT * INTO v_sess
  FROM auth_sessions
  WHERE token = v_session_uuid;

  IF NOT FOUND OR v_sess.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_jwt_role IS NOT NULL AND v_jwt_role <> v_sess.role THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_sess.role = 'ADMIN' THEN
    SELECT COALESCE(NULLIF(TRIM(value), ''), 'Division Admin')
    INTO v_admin_user
    FROM app_settings
    WHERE key = 'admin_username';

    RETURN jsonb_build_object(
      'valid', true,
      'role', 'division',
      'app_role', 'ADMIN',
      'account_id', 'division:0',
      'sector_id', NULL,
      'unit_id', NULL,
      'login_code', v_sess.login_code,
      'name', COALESCE(v_admin_user, 'Division Admin')
    );
  ELSIF v_sess.role = 'SECTOR' THEN
    SELECT * INTO v_sector FROM sectors WHERE id = v_sess.entity_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('valid', false);
    END IF;

    RETURN jsonb_build_object(
      'valid', true,
      'role', 'sector',
      'app_role', 'SECTOR',
      'account_id', 'sector:' || v_sector.id::TEXT,
      'sector_id', v_sector.id,
      'unit_id', NULL,
      'login_code', v_sector.login_code,
      'name', v_sector.name
    );
  ELSIF v_sess.role = 'UNIT' THEN
    SELECT * INTO v_unit FROM units WHERE id = v_sess.entity_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('valid', false);
    END IF;

    RETURN jsonb_build_object(
      'valid', true,
      'role', 'unit',
      'app_role', 'UNIT',
      'account_id', 'unit:' || v_unit.id::TEXT,
      'sector_id', v_unit.sector_id,
      'unit_id', v_unit.id,
      'login_code', v_unit.login_code,
      'name', v_unit.name
    );
  END IF;

  RETURN jsonb_build_object('valid', false);
END;
$$;

-- 5. ATOMIC ORDER-COUNT MILESTONE CLAIM RPC
-- Rules: Unit every 10 orders, Sector every 10 orders, Division every 50 orders.
CREATE OR REPLACE FUNCTION claim_order_push_events(
  p_order_id INT,
  p_source TEXT DEFAULT 'portal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_source TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_source, '')), ''), 'portal');
  v_order RECORD;
  v_unit_order_count INT := 0;
  v_unit_milestone INT := 0;
  v_sector_order_count INT := 0;
  v_sector_milestone INT := 0;
  v_div_order_count INT := 0;
  v_div_milestone INT := 0;
  v_event_key TEXT;
  v_inserted_key TEXT;
  v_job JSONB;
  v_events JSONB := '[]'::jsonb;
BEGIN
  IF p_order_id IS NULL OR p_order_id <= 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT
    e.id,
    e.unit_id,
    e.contributor_name,
    e.quantity,
    e.created_at,
    u.name AS unit_name,
    u.sector_id,
    s.name AS sector_name
  INTO v_order
  FROM entries e
  LEFT JOIN units u ON u.id = e.unit_id
  LEFT JOIN sectors s ON s.id = u.sector_id
  WHERE e.id = p_order_id
    AND e.is_deleted = false;

  -- Reject if missing, soft-deleted, or older than 15 minutes (anti-spam guard)
  IF NOT FOUND OR v_order.created_at < (now() - INTERVAL '15 minutes') THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Rule A: Unit Milestone (Every 10 Orders: 10, 20, 30...)
  IF v_order.unit_id IS NOT NULL THEN
    SELECT COUNT(*)::INT
    INTO v_unit_order_count
    FROM entries
    WHERE unit_id = v_order.unit_id
      AND is_deleted = false;

    v_unit_milestone := (v_unit_order_count / 10) * 10;
    IF v_unit_milestone >= 10 THEN
      v_event_key := 'unit_milestone:' || v_order.unit_id::TEXT || ':' || v_unit_milestone::TEXT;
      v_job := jsonb_build_object(
        'event_key', v_event_key,
        'event_type', 'unit_milestone',
        'source', v_source,
        'target', jsonb_build_object(
          'role', 'unit',
          'unit_id', v_order.unit_id
        ),
        'notification', jsonb_build_object(
          'title', v_order.unit_name || ' — ' || v_unit_milestone::TEXT || ' ഓർഡറുകൾ പിന്നിട്ടു! 🎉',
          'body', 'അഭിനന്ദനങ്ങൾ! ' || v_order.unit_name || ' യൂണിറ്റിൽ ആകെ ' || v_unit_milestone::TEXT || ' ഓർഡറുകൾ പൂർത്തിയായി.',
          'url', '/dashboard',
          'tag', v_event_key,
          'type', 'unit_milestone',
          'milestone', v_unit_milestone,
          'order_id', v_order.id
        )
      );

      INSERT INTO push_dispatch_log (event_key, event_type, payload)
      VALUES (v_event_key, 'unit_milestone', v_job)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING event_key INTO v_inserted_key;

      IF v_inserted_key IS NOT NULL THEN
        v_events := v_events || jsonb_build_array(v_job);
      END IF;
    END IF;
  END IF;

  -- Rule B: Sector Milestone (Every 10 Orders: 10, 20, 30...)
  IF v_order.sector_id IS NOT NULL THEN
    SELECT COUNT(*)::INT
    INTO v_sector_order_count
    FROM entries e
    JOIN units u ON u.id = e.unit_id
    WHERE u.sector_id = v_order.sector_id
      AND e.is_deleted = false;

    v_sector_milestone := (v_sector_order_count / 10) * 10;
    IF v_sector_milestone >= 10 THEN
      v_event_key := 'sector_milestone:' || v_order.sector_id::TEXT || ':' || v_sector_milestone::TEXT;
      v_job := jsonb_build_object(
        'event_key', v_event_key,
        'event_type', 'sector_milestone',
        'source', v_source,
        'target', jsonb_build_object(
          'role', 'sector',
          'sector_id', v_order.sector_id
        ),
        'notification', jsonb_build_object(
          'title', v_order.sector_name || ' — ' || v_sector_milestone::TEXT || ' ഓർഡറുകൾ പിന്നിട്ടു! 🎉',
          'body', 'അഭിനന്ദനങ്ങൾ! ' || v_order.sector_name || ' സെക്ടറിൽ ആകെ ' || v_sector_milestone::TEXT || ' ഓർഡറുകൾ പൂർത്തിയായി.',
          'url', '/sector',
          'tag', v_event_key,
          'type', 'sector_milestone',
          'milestone', v_sector_milestone,
          'order_id', v_order.id
        )
      );

      INSERT INTO push_dispatch_log (event_key, event_type, payload)
      VALUES (v_event_key, 'sector_milestone', v_job)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING event_key INTO v_inserted_key;

      IF v_inserted_key IS NOT NULL THEN
        v_events := v_events || jsonb_build_array(v_job);
      END IF;
    END IF;
  END IF;

  -- Rule C: Division Milestone (Every 50 Orders: 50, 100, 150...)
  SELECT COUNT(*)::INT
  INTO v_div_order_count
  FROM entries
  WHERE is_deleted = false;

  v_div_milestone := (v_div_order_count / 50) * 50;
  IF v_div_milestone >= 50 THEN
    v_event_key := 'division_milestone:' || v_div_milestone::TEXT;
    v_job := jsonb_build_object(
      'event_key', v_event_key,
      'event_type', 'division_milestone',
      'source', v_source,
      'target', jsonb_build_object(
        'role', 'division'
      ),
      'notification', jsonb_build_object(
        'title', 'ഡിവിഷൻ മൈൽസ്റ്റോൺ — ' || v_div_milestone::TEXT || ' ഓർഡറുകൾ! 🏆',
        'body', 'SSF വണ്ടൂർ ഡിവിഷനിൽ ആകെ ' || v_div_milestone::TEXT || ' പായസം ഓർഡറുകൾ പൂർത്തിയായി!',
        'url', '/admin',
        'tag', v_event_key,
        'type', 'division_milestone',
        'milestone', v_div_milestone,
        'order_id', v_order.id
      )
    );

    INSERT INTO push_dispatch_log (event_key, event_type, payload)
    VALUES (v_event_key, 'division_milestone', v_job)
    ON CONFLICT (event_key) DO NOTHING
    RETURNING event_key INTO v_inserted_key;

    IF v_inserted_key IS NOT NULL THEN
      v_events := v_events || jsonb_build_array(v_job);
    END IF;

    v_event_key := 'public_milestone:' || v_div_milestone::TEXT;
    v_job := jsonb_build_object(
      'event_key', v_event_key,
      'event_type', 'public_milestone',
      'source', v_source,
      'target', jsonb_build_object(
        'role', 'public'
      ),
      'notification', jsonb_build_object(
        'title', 'SSF വണ്ടൂർ പാലട പായസം ചലഞ്ച് — ' || v_div_milestone::TEXT || ' ഓർഡറുകൾ! 🎉',
        'body', 'ലൈവ് അപ്‌ഡേറ്റ്: ചലഞ്ചിൽ ആകെ ' || v_div_milestone::TEXT || ' ഓർഡറുകൾ പിന്നിട്ടു! ലൈവ് ലീഡർബോർഡ് കാണാം.',
        'url', '/',
        'tag', v_event_key,
        'type', 'public_milestone',
        'milestone', v_div_milestone,
        'order_id', v_order.id
      )
    );

    INSERT INTO push_dispatch_log (event_key, event_type, payload)
    VALUES (v_event_key, 'public_milestone', v_job)
    ON CONFLICT (event_key) DO NOTHING
    RETURNING event_key INTO v_inserted_key;

    IF v_inserted_key IS NOT NULL THEN
      v_events := v_events || jsonb_build_array(v_job);
    END IF;
  END IF;

  RETURN v_events;
END;
$$;

-- 6. ATOMIC APP UPDATE PUSH CLAIM RPC
CREATE OR REPLACE FUNCTION claim_app_update_push(
  p_version TEXT,
  p_force BOOLEAN DEFAULT false,
  p_custom_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_version TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_version, '')), ''), 'manual');
  v_force BOOLEAN := COALESCE(p_force, false);
  v_body TEXT := COALESCE(
    NULLIF(TRIM(COALESCE(p_custom_message, '')), ''),
    'ആപ്പിന് പുതിയ അപ്‌ഡേഷൻ വന്നിട്ടുണ്ട്. തുറന്ന് അപ്‌ഡേറ്റ് ചെയ്തോളൂ.'
  );
  v_event_key TEXT;
  v_inserted_key TEXT;
  v_payload JSONB;
BEGIN
  IF v_force THEN
    v_event_key :=
      'app_update:' || v_version || ':manual:' ||
      FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT::TEXT ||
      ':' || substr(md5(random()::text), 1, 6);
  ELSE
    v_event_key := 'app_update:' || v_version;
  END IF;

  v_payload := jsonb_build_object(
    'title', 'ആപ്പിൽ പുതിയ അപ്‌ഡേറ്റ് വന്നിട്ടുണ്ട്! ✨',
    'body', v_body,
    'url', '/?checkUpdate=1',
    'type', 'app_update',
    'version', v_version,
    'tag', 'app_update:' || v_version
  );

  INSERT INTO push_dispatch_log (event_key, event_type, payload)
  VALUES (v_event_key, 'app_update', v_payload)
  ON CONFLICT (event_key) DO NOTHING
  RETURNING event_key INTO v_inserted_key;

  RETURN jsonb_build_object(
    'claimed', (v_inserted_key IS NOT NULL),
    'event_key', v_event_key,
    'payload', v_payload
  );
END;
$$;

-- 7. STRICT PERMISSIONS: ONLY SERVICE_ROLE CAN CALL PUSH BACKEND RPCS
REVOKE ALL ON FUNCTION push_verify_session(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_order_push_events(INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_app_update_push(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION push_verify_session(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_order_push_events(INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_app_update_push(TEXT, BOOLEAN, TEXT) TO service_role;
