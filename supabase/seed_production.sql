-- =============================================================================
-- PRODUCTION DATA SEED & TEST ACCOUNT ISOLATION MIGRATION
-- Accounts: WDR1-WDR92 (92 Real Units), WDR101-WDR108 (8 Real Sectors),
--           WDR200-WDR201 (2 Test Sectors), WDR202-WDR205 (4 Test Units)
-- 100% Idempotent & Transactional (Preserves existing passwords, phones, orders)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_test_unit1_id INT;
  v_sec RECORD;
  v_unit RECORD;
  v_sector_id INT;
  v_existing_sec_id INT;
  v_existing_unit_id INT;
  v_new_username TEXT;
BEGIN
  -- ===========================================================================
  -- STEP 1: Ensure Dedicated Test Sectors (WDR200, WDR201) & Test Units (WDR202-WDR205) exist first
  -- ===========================================================================
  FOR v_sec IN
    SELECT * FROM (VALUES
      ('WDR200', 'Test Sector 1'),
      ('WDR201', 'Test Sector 2')
    ) AS t(login_code, name)
  LOOP
    SELECT id INTO v_existing_sec_id FROM sectors WHERE login_code = v_sec.login_code;
    IF v_existing_sec_id IS NULL THEN
      v_new_username := resolve_unique_username(v_sec.name, v_sec.login_code, 'SECTOR', NULL);
      INSERT INTO sectors (name, login_code, username, password_hash, must_change_password, contact_phone)
      VALUES (v_sec.name, v_sec.login_code, v_new_username, NULL, true, '');
    ELSE
      UPDATE sectors
      SET name = v_sec.name
      WHERE id = v_existing_sec_id;
    END IF;
  END LOOP;

  FOR v_unit IN
    SELECT * FROM (VALUES
      ('WDR200', 'WDR202', 'Test Unit 1'),
      ('WDR200', 'WDR203', 'Test Unit 2'),
      ('WDR201', 'WDR204', 'Test Unit 3'),
      ('WDR201', 'WDR205', 'Test Unit 4')
    ) AS t(sector_code, login_code, name)
  LOOP
    SELECT id INTO v_sector_id FROM sectors WHERE login_code = v_unit.sector_code;
    SELECT id INTO v_existing_unit_id FROM units WHERE login_code = v_unit.login_code;

    IF v_existing_unit_id IS NULL THEN
      v_new_username := resolve_unique_username(v_unit.name, v_unit.login_code, 'UNIT', NULL);
      INSERT INTO units (sector_id, name, login_code, username, password_hash, must_change_password, contact_phone)
      VALUES (v_sector_id, v_unit.name, v_unit.login_code, v_new_username, NULL, true, '');
    ELSE
      UPDATE units
      SET name = v_unit.name, sector_id = v_sector_id
      WHERE id = v_existing_unit_id;
    END IF;
  END LOOP;

  SELECT id INTO v_test_unit1_id FROM units WHERE login_code = 'WDR202';

  -- ===========================================================================
  -- STEP 2: Detect & Evict Legacy Dummy Accounts Safely (One-Time Transition Guard)
  -- Runs ONLY if WDR101 is not yet 'SSF Pandikkad Sector'
  -- ===========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM sectors
    WHERE login_code = 'WDR101' AND name = 'SSF Pandikkad Sector'
  ) THEN
    -- 2a. Re-home any existing unit-linked dummy entries to WDR202 (Test Unit 1)
    --     so zero test orders leak into real production units (WDR1-WDR92).
    IF v_test_unit1_id IS NOT NULL THEN
      UPDATE entries
      SET unit_id = v_test_unit1_id
      WHERE unit_id IS NOT NULL
        AND unit_id IN (
          SELECT id FROM units
          WHERE login_code NOT IN ('WDR202', 'WDR203', 'WDR204', 'WDR205')
        );
    END IF;

    -- 2b. Clean stale auth_sessions & password_reset_requests for old dummy sectors/units
    DELETE FROM auth_sessions
    WHERE (role = 'UNIT' AND entity_id IN (
             SELECT id FROM units WHERE login_code NOT IN ('WDR202', 'WDR203', 'WDR204', 'WDR205')
           ))
       OR (role = 'SECTOR' AND entity_id IN (
             SELECT id FROM sectors WHERE login_code NOT IN ('WDR200', 'WDR201')
           ));

    DELETE FROM password_reset_requests
    WHERE (account_type = 'UNIT' AND account_id IN (
             SELECT id FROM units WHERE login_code NOT IN ('WDR202', 'WDR203', 'WDR204', 'WDR205')
           ))
       OR (account_type = 'SECTOR' AND account_id IN (
             SELECT id FROM sectors WHERE login_code NOT IN ('WDR200', 'WDR201')
           ));

    -- 2c. Delete old dummy units and sectors
    DELETE FROM units
    WHERE login_code NOT IN ('WDR202', 'WDR203', 'WDR204', 'WDR205');

    DELETE FROM sectors
    WHERE login_code NOT IN ('WDR200', 'WDR201');
  END IF;

  -- ===========================================================================
  -- STEP 3: Idempotently Seed 8 Production Sectors (WDR101-WDR108) & 92 Units (WDR1-WDR92)
  -- ===========================================================================
  FOR v_sec IN
    SELECT * FROM (VALUES
      ('WDR101', 'SSF Pandikkad Sector'),
      ('WDR102', 'SSF Kodasseri Sector'),
      ('WDR103', 'SSF Wandoor Sector'),
      ('WDR104', 'SSF Thiruvali Sector'),
      ('WDR105', 'SSF Kalikavu Sector'),
      ('WDR106', 'SSF Porur Sector'),
      ('WDR107', 'SSF Chokkad Sector'),
      ('WDR108', 'SSF Karuvarakundu Sector'),
      ('WDR200', 'Test Sector 1'),
      ('WDR201', 'Test Sector 2')
    ) AS t(login_code, name)
  LOOP
    SELECT id INTO v_existing_sec_id FROM sectors WHERE login_code = v_sec.login_code;
    IF v_existing_sec_id IS NULL THEN
      v_new_username := resolve_unique_username(v_sec.name, v_sec.login_code, 'SECTOR', NULL);
      INSERT INTO sectors (name, login_code, username, password_hash, must_change_password, contact_phone)
      VALUES (v_sec.name, v_sec.login_code, v_new_username, NULL, true, '');
    ELSE
      UPDATE sectors
      SET name = v_sec.name
      WHERE id = v_existing_sec_id;
    END IF;
  END LOOP;

  FOR v_unit IN
    SELECT * FROM (VALUES
      -- 1. SSF Pandikkad Sector (WDR101) — 10 Units (WDR1-WDR10)
      ('WDR101', 'WDR1',  'Pallipadi'),
      ('WDR101', 'WDR2',  'Kavungal Paramba'),
      ('WDR101', 'WDR3',  'Valluvangad Town'),
      ('WDR101', 'WDR4',  'East Pandikkad'),
      ('WDR101', 'WDR5',  'Tharippadi'),
      ('WDR101', 'WDR6',  'Pandikkad'),
      ('WDR101', 'WDR7',  'Kakkulam'),
      ('WDR101', 'WDR8',  'Pandikkad West'),
      ('WDR101', 'WDR9',  'Valany'),
      ('WDR101', 'WDR10', 'Pulikkalparambu'),

      -- 2. SSF Kodasseri Sector (WDR102) — 10 Units (WDR11-WDR20)
      ('WDR102', 'WDR11', 'Odompatta'),
      ('WDR102', 'WDR12', 'Kodasseri North'),
      ('WDR102', 'WDR13', 'Kodasseri South'),
      ('WDR102', 'WDR14', 'Vettikkattiri'),
      ('WDR102', 'WDR15', 'Chembrasseri West'),
      ('WDR102', 'WDR16', 'Chembrasseri East'),
      ('WDR102', 'WDR17', 'East Vettikkattiri'),
      ('WDR102', 'WDR18', 'Nattukall'),
      ('WDR102', 'WDR19', 'Poolamanna'),
      ('WDR102', 'WDR20', 'Arppinikkunn'),

      -- 3. SSF Wandoor Sector (WDR103) — 8 Units (WDR21-WDR28)
      ('WDR103', 'WDR21', 'Koorad'),
      ('WDR103', 'WDR22', 'Emangad'),
      ('WDR103', 'WDR23', 'Kuttiyil'),
      ('WDR103', 'WDR24', 'Vaniyambalam'),
      ('WDR103', 'WDR25', 'Thekkumpuram'),
      ('WDR103', 'WDR26', 'Old Vaniyambalam'),
      ('WDR103', 'WDR27', 'Wandoor'),
      ('WDR103', 'WDR28', 'Shanthinagar'),

      -- 4. SSF Thiruvali Sector (WDR104) — 9 Units (WDR29-WDR37)
      ('WDR104', 'WDR29', 'Pathiriyal'),
      ('WDR104', 'WDR30', 'Poolakkal'),
      ('WDR104', 'WDR31', 'Eriyad'),
      ('WDR104', 'WDR32', 'Thiruvali'),
      ('WDR104', 'WDR33', 'Ottappokk'),
      ('WDR104', 'WDR34', 'Moorkankund'),
      ('WDR104', 'WDR35', 'Tharikulam'),
      ('WDR104', 'WDR36', 'Thannikkunnu'),
      ('WDR104', 'WDR37', 'Thazhenkodu'),

      -- 5. SSF Kalikavu Sector (WDR105) — 14 Units (WDR38-WDR51)
      ('WDR105', 'WDR38', 'Poongode'),
      ('WDR105', 'WDR39', 'Kavungal'),
      ('WDR105', 'WDR40', 'Cherooth'),
      ('WDR105', 'WDR41', 'Vellayur'),
      ('WDR105', 'WDR42', 'Thandukkode'),
      ('WDR105', 'WDR43', 'Karutheni'),
      ('WDR105', 'WDR44', 'Cherankodu'),
      ('WDR105', 'WDR45', 'Poocha Poyil'),
      ('WDR105', 'WDR46', 'Pallisseri'),
      ('WDR105', 'WDR47', 'Anchachavidi'),
      ('WDR105', 'WDR48', 'Amappoyil'),
      ('WDR105', 'WDR49', 'Puttamanna'),
      ('WDR105', 'WDR50', 'Arppoyil'),
      ('WDR105', 'WDR51', 'Venthodapadi'),

      -- 6. SSF Porur Sector (WDR106) — 13 Units (WDR52-WDR64)
      ('WDR106', 'WDR52', 'Kottakunnu'),
      ('WDR106', 'WDR53', 'Valiyaparambu'),
      ('WDR106', 'WDR54', 'Cherukode'),
      ('WDR106', 'WDR55', 'Ayanikodu'),
      ('WDR106', 'WDR56', 'Veethanasseri'),
      ('WDR106', 'WDR57', 'Karuvattakkunnu'),
      ('WDR106', 'WDR58', 'Palakkode'),
      ('WDR106', 'WDR59', 'Mutheeri'),
      ('WDR106', 'WDR60', 'Nirannaparambu'),
      ('WDR106', 'WDR61', 'Eranjikkunnu'),
      ('WDR106', 'WDR62', 'Edappulam'),
      ('WDR106', 'WDR63', 'Cheriparambu'),
      ('WDR106', 'WDR64', 'Mundayil'),

      -- 7. SSF Chokkad Sector (WDR107) — 15 Units (WDR65-WDR79)
      ('WDR107', 'WDR65', 'Pallippadi'),
      ('WDR107', 'WDR66', 'Mampattumoola'),
      ('WDR107', 'WDR67', 'Chokkad'),
      ('WDR107', 'WDR68', 'Mailadi Chola'),
      ('WDR107', 'WDR69', 'Paral'),
      ('WDR107', 'WDR70', 'Kallamoola'),
      ('WDR107', 'WDR71', 'Chundukunnu'),
      ('WDR107', 'WDR72', 'Valanjirappadi'),
      ('WDR107', 'WDR73', 'Srambikkall'),
      ('WDR107', 'WDR74', 'Maliyekkal'),
      ('WDR107', 'WDR75', 'Maliyekkal Kunnu'),
      ('WDR107', 'WDR76', 'Oralamada'),
      ('WDR107', 'WDR77', 'Chellakkodi'),
      ('WDR107', 'WDR78', 'Valiyaparambu'),
      ('WDR107', 'WDR79', 'Salamath Nagar'),

      -- 8. SSF Karuvarakundu Sector (WDR108) — 13 Units (WDR80-WDR92)
      ('WDR108', 'WDR80', 'Karuvarakkundu'),
      ('WDR108', 'WDR81', 'Iringattiri'),
      ('WDR108', 'WDR82', 'Punnakkad'),
      ('WDR108', 'WDR83', 'Kuttathi'),
      ('WDR108', 'WDR84', 'Alikkode'),
      ('WDR108', 'WDR85', 'Panthra'),
      ('WDR108', 'WDR86', 'Pulvetta'),
      ('WDR108', 'WDR87', 'Kerala'),
      ('WDR108', 'WDR88', 'Neelanchery'),
      ('WDR108', 'WDR89', 'Mampuzha'),
      ('WDR108', 'WDR90', 'Palliparambu'),
      ('WDR108', 'WDR91', 'Ambalakunnu'),
      ('WDR108', 'WDR92', 'Thuvvur'),

      -- Dedicated Test Units (WDR202-WDR205)
      ('WDR200', 'WDR202', 'Test Unit 1'),
      ('WDR200', 'WDR203', 'Test Unit 2'),
      ('WDR201', 'WDR204', 'Test Unit 3'),
      ('WDR201', 'WDR205', 'Test Unit 4')
    ) AS t(sector_code, login_code, name)
  LOOP
    SELECT id INTO v_sector_id FROM sectors WHERE login_code = v_unit.sector_code;
    SELECT id INTO v_existing_unit_id FROM units WHERE login_code = v_unit.login_code;

    IF v_existing_unit_id IS NULL THEN
      v_new_username := resolve_unique_username(v_unit.name, v_unit.login_code, 'UNIT', NULL);
      INSERT INTO units (sector_id, name, login_code, username, password_hash, must_change_password, contact_phone)
      VALUES (v_sector_id, v_unit.name, v_unit.login_code, v_new_username, NULL, true, '');
    ELSE
      UPDATE units
      SET name = v_unit.name, sector_id = v_sector_id
      WHERE id = v_existing_unit_id;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- STEP 4: Sync PostgreSQL Serial Sequences (Prevent Future Manual Insert PK Errors)
-- =============================================================================
SELECT setval(pg_get_serial_sequence('sectors', 'id'), COALESCE((SELECT MAX(id) FROM sectors), 1), true);
SELECT setval(pg_get_serial_sequence('units', 'id'), COALESCE((SELECT MAX(id) FROM units), 1), true);

COMMIT;
