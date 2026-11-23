-- ============================================================
-- UNIT PORTAL PASSWORD = UNIT ORDER CODE (login_code) MIGRATION
-- Idempotent SQL migration for unit account password synchronization
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE units ALTER COLUMN must_change_password SET DEFAULT false;

-- 1. Trigger function to keep Unit password_hash strictly synced to login_code (Order Code)
CREATE OR REPLACE FUNCTION trg_sync_unit_order_code_password()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  NEW.login_code := UPPER(TRIM(COALESCE(NEW.login_code, '')));
  NEW.must_change_password := false;

  IF TG_OP = 'INSERT'
     OR NEW.login_code IS DISTINCT FROM OLD.login_code
     OR NEW.password_hash IS NULL
     OR (crypt(NEW.login_code, NEW.password_hash) <> NEW.password_hash) THEN
    NEW.password_hash := crypt(NEW.login_code, gen_salt('bf'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_units_sync_order_code_password ON units;
CREATE TRIGGER trg_units_sync_order_code_password
BEFORE INSERT OR UPDATE OF login_code, password_hash, must_change_password
ON units
FOR EACH ROW
EXECUTE FUNCTION trg_sync_unit_order_code_password();

-- 2. Sync all existing Unit accounts so password_hash = bcrypt(UPPER(TRIM(login_code))) and must_change_password = false
UPDATE units
SET
  login_code = UPPER(TRIM(login_code)),
  password_hash = crypt(UPPER(TRIM(login_code)), gen_salt('bf')),
  must_change_password = false
WHERE
  must_change_password = true
  OR password_hash IS NULL
  OR login_code <> UPPER(TRIM(login_code))
  OR (crypt(UPPER(TRIM(login_code)), password_hash) <> password_hash);

-- Resolve any pending password reset requests for UNIT accounts
UPDATE password_reset_requests
SET status = 'RESOLVED', resolved_at = now()
WHERE account_type = 'UNIT' AND status = 'PENDING';
