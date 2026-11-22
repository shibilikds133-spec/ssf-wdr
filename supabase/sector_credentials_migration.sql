-- ============================================================
-- SECTOR CREDENTIALS & WHATSAPP HUB MIGRATION
-- Run this in Supabase SQL Editor to enable password resets,
-- pending reset requests, contact phone updates, and paginated
-- unit credential listing in the Sector Portal.
-- ============================================================

-- 1. Update sector_get_dashboard to include pending_reset_requests for sector's units
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
        JOIN units u ON u.id = pr.account_id
        WHERE pr.status = 'PENDING'
          AND pr.account_type = 'UNIT'
          AND u.sector_id = v_sector.id
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 2. Paginated unit credentials for own sector
CREATE OR REPLACE FUNCTION sector_list_credentials(
  p_code TEXT,
  p_filter TEXT DEFAULT 'ALL',
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
  v_sector sectors%ROWTYPE;
  v_filter TEXT := UPPER(TRIM(COALESCE(p_filter, 'ALL')));
  v_search TEXT := TRIM(COALESCE(p_search, ''));
  v_req_page INT := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INT := LEAST(GREATEST(COALESCE(p_page_size, 15), 1), 10000);
  v_total INT := 0;
  v_total_pages INT := 1;
  v_page INT := 1;
  v_offset INT := 0;
  v_items JSONB := '[]'::jsonb;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  SELECT COUNT(*)::INT INTO v_total
  FROM (
    SELECT
      u.id AS account_id,
      u.name,
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
    WHERE u.sector_id = v_sector.id
  ) acc
  WHERE (
      v_filter = 'ALL'
      OR (v_filter = 'PENDING' AND acc.is_reset_pending = true)
    )
    AND (
      v_search = ''
      OR acc.name ILIKE '%' || v_search || '%'
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
        'account_type', 'UNIT',
        'account_id', p.account_id,
        'sector_id', v_sector.id,
        'sector_name', v_sector.name,
        'name', p.name,
        'subtitle', v_sector.name,
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
        u.id AS account_id,
        u.name,
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
      WHERE u.sector_id = v_sector.id
    ) acc
    WHERE (
        v_filter = 'ALL'
        OR (v_filter = 'PENDING' AND acc.is_reset_pending = true)
      )
      AND (
        v_search = ''
        OR acc.name ILIKE '%' || v_search || '%'
        OR acc.username ILIKE '%' || v_search || '%'
        OR acc.login_code ILIKE '%' || v_search || '%'
        OR acc.contact_phone ILIKE '%' || v_search || '%'
      )
    ORDER BY
      acc.is_reset_pending DESC,
      acc.name ASC
    LIMIT v_page_size OFFSET v_offset
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

-- 3. Reset own unit password & revoke active sessions
CREATE OR REPLACE FUNCTION sector_reset_unit_password(
  p_code TEXT,
  p_unit_id INT,
  p_temp_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_temp TEXT := TRIM(COALESCE(p_temp_password, ''));
  v_return_pwd TEXT;
  v_unit RECORD;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  IF v_temp <> '' AND LENGTH(v_temp) < 4 THEN
    RAISE EXCEPTION 'Temporary password must be at least 4 characters';
  END IF;

  SELECT id, username, login_code, contact_phone INTO v_unit
  FROM units
  WHERE id = p_unit_id AND sector_id = v_sector.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found in your sector';
  END IF;

  IF v_temp = '' THEN
    UPDATE units
    SET password_hash = NULL, must_change_password = true
    WHERE id = p_unit_id AND sector_id = v_sector.id;
    v_return_pwd := v_unit.login_code;
  ELSE
    UPDATE units
    SET password_hash = crypt(v_temp, gen_salt('bf')), must_change_password = true
    WHERE id = p_unit_id AND sector_id = v_sector.id;
    v_return_pwd := v_temp;
  END IF;

  DELETE FROM auth_sessions
  WHERE role = 'UNIT' AND entity_id = p_unit_id;

  UPDATE password_reset_requests
  SET status = 'RESOLVED', resolved_at = now()
  WHERE account_type = 'UNIT'
    AND account_id = p_unit_id
    AND status = 'PENDING';

  RETURN jsonb_build_object(
    'success', true,
    'username', v_unit.username,
    'temp_password', v_return_pwd,
    'login_code', v_unit.login_code,
    'contact_phone', COALESCE(v_unit.contact_phone, '')
  );
END;
$$;

-- 4. Dismiss pending reset request for own unit
CREATE OR REPLACE FUNCTION sector_dismiss_reset_request(p_code TEXT, p_request_id INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  UPDATE password_reset_requests pr
  SET status = 'DISMISSED', resolved_at = now()
  FROM units u
  WHERE pr.id = p_request_id
    AND pr.status = 'PENDING'
    AND pr.account_type = 'UNIT'
    AND pr.account_id = u.id
    AND u.sector_id = v_sector.id;

  RETURN true;
END;
$$;

-- 5. Update contact phone for own unit
CREATE OR REPLACE FUNCTION sector_update_unit_contact(
  p_code TEXT,
  p_unit_id INT,
  p_contact_phone TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sector sectors%ROWTYPE;
  v_raw TEXT := TRIM(COALESCE(p_contact_phone, ''));
  v_clean TEXT := regexp_replace(v_raw, '[^0-9]', '', 'g');
BEGIN
  v_sector := resolve_sector_by_auth(p_code);

  IF v_clean <> '' AND LENGTH(v_clean) < 10 THEN
    RAISE EXCEPTION 'Phone number must be at least 10 digits (or leave empty)';
  END IF;

  UPDATE units
  SET contact_phone = NULLIF(v_clean, '')
  WHERE id = p_unit_id AND sector_id = v_sector.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit not found in your sector';
  END IF;

  RETURN true;
END;
$$;

-- 6. Grant execute permissions
GRANT EXECUTE ON FUNCTION
  sector_get_dashboard(TEXT),
  sector_list_credentials(TEXT, TEXT, TEXT, INT, INT),
  sector_reset_unit_password(TEXT, INT, TEXT),
  sector_dismiss_reset_request(TEXT, INT),
  sector_update_unit_contact(TEXT, INT, TEXT)
TO anon, authenticated;
