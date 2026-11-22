import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { buildPushPayload } from '@block65/webcrypto-web-push';

const { Client } = pg;

const dbUrl = process.env.SUPABASE_DB_URL?.trim();
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim();
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const vapidSubject =
  process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@ssfwandoor.org';

if (!dbUrl || dbUrl === 'PASTE_YOUR_POSTGRES_URI_HERE') {
  console.error('Missing SUPABASE_DB_URL in .env');
  process.exit(1);
}
if (!vapidPublicKey || !vapidPrivateKey) {
  console.error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY in .env');
  process.exit(1);
}

const client1 = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});
const client2 = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

const createdEntryIds = [];
const createdDispatchKeys = [];
const createdSessionTokens = [];
const passedTests = [];

function pass(name) {
  passedTests.push(name);
  console.log(`PASS: ${name}`);
}

async function insertTestOrder(unitId, tag, quantity = 1) {
  const { rows } = await client1.query(
    `INSERT INTO entries (
       unit_id, contributor_name, mobile_number, quantity, unit_rate_applied, total_amount, payment_status, payment_mode
     ) VALUES ($1, $2, '9000000000', $3, 250, $4, 'PAID', 'CASH')
     RETURNING id`,
    [unitId, `PUSH_VERIFY_${tag}`, quantity, quantity * 250]
  );
  const id = rows[0].id;
  createdEntryIds.push(id);
  return id;
}

try {
  await client1.connect();
  await client2.connect();

  // Locate dedicated test accounts WDR202, WDR203, WDR204
  const { rows: unitRows } = await client1.query(
    `SELECT u.id, u.name, u.login_code, u.sector_id, s.name AS sector_name
     FROM units u
     JOIN sectors s ON s.id = u.sector_id
     WHERE u.login_code IN ('WDR202', 'WDR203', 'WDR204')
     ORDER BY u.login_code ASC`
  );
  const unitA = unitRows.find((r) => r.login_code === 'WDR202');
  const unitB = unitRows.find((r) => r.login_code === 'WDR203');
  assert(unitA, 'Test unit WDR202 not found. Run npm run db:seed first.');
  assert(unitB, 'Test unit WDR203 not found. Run npm run db:seed first.');

  // -------------------------------------------------------------------------
  // TEST 1: RLS & Privilege Lockdown for anon role
  // -------------------------------------------------------------------------
  await client1.query('BEGIN');
  await client1.query('SET LOCAL ROLE anon');
  for (const sql of [
    'SELECT * FROM push_subscriptions LIMIT 1',
    'SELECT * FROM push_dispatch_log LIMIT 1',
    "SELECT claim_order_push_events(1, 'portal')",
    "SELECT claim_app_update_push('test', false)",
    "SELECT push_verify_session('invalid')",
  ]) {
    let blocked = false;
    try {
      await client1.query('SAVEPOINT sp_anon_check');
      await client1.query(sql);
      await client1.query('RELEASE SAVEPOINT sp_anon_check');
    } catch {
      blocked = true;
      await client1.query('ROLLBACK TO SAVEPOINT sp_anon_check');
    }
    assert.equal(blocked, true, `Expected anon to be blocked on: ${sql}`);
  }
  await client1.query('COMMIT');
  pass('1. RLS and service-role privilege lockdown verified for anon role');

  // -------------------------------------------------------------------------
  // TEST 2: Unit 10-order milestone (order count only, including public source)
  // -------------------------------------------------------------------------
  const { rows: unitCountRows } = await client1.query(
    `SELECT COUNT(*)::INT AS cnt FROM entries WHERE unit_id = $1 AND is_deleted = false`,
    [unitA.id]
  );
  const startUnitACount = unitCountRows[0].cnt;
  const remUnit = startUnitACount % 10;
  const neededUnit = 10 - remUnit;
  const targetUnitMilestone = startUnitACount + neededUnit;

  // Insert orders below the 10-order boundary with large liter quantities (e.g., 75 L)
  // to confirm milestones NEVER fire on liter volume or every individual order.
  for (let i = 0; i < neededUnit - 1; i += 1) {
    const orderId = await insertTestOrder(unitA.id, `UNIT_PRE_${i}`, 75);
    const { rows } = await client1.query(
      `SELECT claim_order_push_events($1, 'portal') AS events`,
      [orderId]
    );
    const unitEvents = (rows[0].events || []).filter(
      (ev) => ev.event_type === 'unit_milestone'
    );
    assert.equal(
      unitEvents.length,
      0,
      `Unit milestone must NOT fire before crossing multiple of 10 (order ${i + 1})`
    );
  }

  // Cross the 10-order boundary using source = 'public'
  const unitMilestoneOrderId = await insertTestOrder(
    unitA.id,
    'UNIT_MILESTONE',
    1
  );
  const { rows: unitClaimRows1 } = await client1.query(
    `SELECT claim_order_push_events($1, 'public') AS events`,
    [unitMilestoneOrderId]
  );
  for (const ev of unitClaimRows1[0].events || []) {
    if (ev?.event_key) createdDispatchKeys.push(ev.event_key);
  }
  const claimedUnitEvents = (unitClaimRows1[0].events || []).filter(
    (ev) => ev.event_type === 'unit_milestone'
  );
  assert.equal(claimedUnitEvents.length, 1);
  assert.equal(
    claimedUnitEvents[0].event_key,
    `unit_milestone:${unitA.id}:${targetUnitMilestone}`
  );
  assert.equal(claimedUnitEvents[0].source, 'public');
  assert.equal(claimedUnitEvents[0].target.role, 'unit');
  assert.equal(claimedUnitEvents[0].target.unit_id, unitA.id);
  assert.equal(claimedUnitEvents[0].notification.url, '/dashboard');
  assert(
    claimedUnitEvents[0].notification.title.includes(String(targetUnitMilestone))
  );

  // Re-calling on the same order must return 0 unit events
  const { rows: unitClaimRows2 } = await client1.query(
    `SELECT claim_order_push_events($1, 'public') AS events`,
    [unitMilestoneOrderId]
  );
  assert.equal((unitClaimRows2[0].events || []).length, 0);
  pass(
    `2. Unit 10-order milestone (${targetUnitMilestone}) claimed strictly once (source='public')`
  );

  // -------------------------------------------------------------------------
  // TEST 3: Sector 10-order milestone + concurrent Promise.all deduplication
  // -------------------------------------------------------------------------
  const { rows: secCountRows } = await client1.query(
    `SELECT COUNT(*)::INT AS cnt
     FROM entries e
     JOIN units u ON u.id = e.unit_id
     WHERE u.sector_id = $1 AND e.is_deleted = false`,
    [unitA.sector_id]
  );
  const startSecCount = secCountRows[0].cnt;
  const neededSec = 10 - (startSecCount % 10);
  const targetSecMilestone = startSecCount + neededSec;

  for (let i = 0; i < neededSec - 1; i += 1) {
    const orderId = await insertTestOrder(unitB.id, `SEC_PRE_${i}`, 50);
    const { rows } = await client1.query(
      `SELECT claim_order_push_events($1, 'portal') AS events`,
      [orderId]
    );
    for (const ev of rows[0].events || []) {
      if (ev?.event_key) createdDispatchKeys.push(ev.event_key);
    }
    const secEvents = (rows[0].events || []).filter(
      (ev) => ev.event_type === 'sector_milestone'
    );
    assert.equal(
      secEvents.length,
      0,
      'Sector milestone must NOT fire before crossing multiple of 10'
    );
  }

  const sectorMilestoneOrderId = await insertTestOrder(
    unitB.id,
    'SEC_MILESTONE',
    1
  );
  const [raceRes1, raceRes2] = await Promise.all([
    client1.query(`SELECT claim_order_push_events($1, 'portal') AS events`, [
      sectorMilestoneOrderId,
    ]),
    client2.query(`SELECT claim_order_push_events($1, 'portal') AS events`, [
      sectorMilestoneOrderId,
    ]),
  ]);

  const allRaceEvents = [
    ...(raceRes1.rows[0].events || []),
    ...(raceRes2.rows[0].events || []),
  ];
  for (const ev of allRaceEvents) {
    if (ev?.event_key) createdDispatchKeys.push(ev.event_key);
  }
  const claimedSecEvents = allRaceEvents.filter(
    (ev) => ev.event_type === 'sector_milestone'
  );
  assert.equal(
    claimedSecEvents.length,
    1,
    'Concurrent callers must claim sector milestone strictly once'
  );
  assert.equal(
    claimedSecEvents[0].event_key,
    `sector_milestone:${unitA.sector_id}:${targetSecMilestone}`
  );
  assert.equal(claimedSecEvents[0].target.role, 'sector');
  assert.equal(claimedSecEvents[0].target.sector_id, unitA.sector_id);
  assert.equal(claimedSecEvents[0].notification.url, '/sector');
  pass(
    `3. Sector 10-order milestone (${targetSecMilestone}) claimed strictly once under concurrent calls`
  );

  // -------------------------------------------------------------------------
  // TEST 4: Division 50-order milestone (every 50 orders)
  // -------------------------------------------------------------------------
  const { rows: divCountRows } = await client1.query(
    `SELECT COUNT(*)::INT AS cnt FROM entries WHERE is_deleted = false`
  );
  const startDivCount = divCountRows[0].cnt;
  const neededDiv = 50 - (startDivCount % 50);
  const targetDivMilestone = startDivCount + neededDiv;

  for (let i = 0; i < neededDiv - 1; i += 1) {
    const orderId = await insertTestOrder(null, `DIV_PRE_${i}`, 25);
    if (i === 0 || i === neededDiv - 2) {
      const { rows } = await client1.query(
        `SELECT claim_order_push_events($1, 'portal') AS events`,
        [orderId]
      );
      for (const ev of rows[0].events || []) {
        if (ev?.event_key) createdDispatchKeys.push(ev.event_key);
      }
      const divEvents = (rows[0].events || []).filter(
        (ev) => ev.event_type === 'division_milestone'
      );
      assert.equal(
        divEvents.length,
        0,
        'Division milestone must NOT fire before crossing multiple of 50'
      );
    }
  }

  const divMilestoneOrderId = await insertTestOrder(null, 'DIV_MILESTONE', 1);
  const { rows: divClaim1 } = await client1.query(
    `SELECT claim_order_push_events($1, 'portal') AS events`,
    [divMilestoneOrderId]
  );
  for (const ev of divClaim1[0].events || []) {
    if (ev?.event_key) createdDispatchKeys.push(ev.event_key);
  }
  const claimedDivEvents = (divClaim1[0].events || []).filter(
    (ev) => ev.event_type === 'division_milestone'
  );
  assert.equal(claimedDivEvents.length, 1);
  assert.equal(
    claimedDivEvents[0].event_key,
    `division_milestone:${targetDivMilestone}`
  );
  assert.equal(claimedDivEvents[0].target.role, 'division');
  assert.equal(claimedDivEvents[0].notification.url, '/admin');
  assert(
    claimedDivEvents[0].notification.title.includes(String(targetDivMilestone))
  );

  const { rows: divClaim2 } = await client1.query(
    `SELECT claim_order_push_events($1, 'portal') AS events`,
    [divMilestoneOrderId]
  );
  assert.equal((divClaim2[0].events || []).length, 0);
  pass(
    `4. Division 50-order milestone (${targetDivMilestone}) claimed strictly once`
  );

  // -------------------------------------------------------------------------
  // TEST 5: claim_app_update_push idempotency + force override
  // -------------------------------------------------------------------------
  const testVersion = `verify-${Date.now()}`;
  const { rows: upd1 } = await client1.query(
    `SELECT claim_app_update_push($1, false, NULL) AS res`,
    [testVersion]
  );
  assert.equal(upd1[0].res.claimed, true);
  assert.equal(upd1[0].res.event_key, `app_update:${testVersion}`);
  assert.equal(upd1[0].res.payload.url, '/?checkUpdate=1');
  createdDispatchKeys.push(upd1[0].res.event_key);

  const { rows: upd2 } = await client1.query(
    `SELECT claim_app_update_push($1, false, NULL) AS res`,
    [testVersion]
  );
  assert.equal(upd2[0].res.claimed, false);

  const { rows: upd3 } = await client1.query(
    `SELECT claim_app_update_push($1, true, 'Custom Test Broadcast') AS res`,
    [testVersion]
  );
  assert.equal(upd3[0].res.claimed, true);
  assert.equal(upd3[0].res.payload.body, 'Custom Test Broadcast');
  assert(upd3[0].res.event_key.startsWith(`app_update:${testVersion}:manual:`));
  createdDispatchKeys.push(upd3[0].res.event_key);
  pass('5. claim_app_update_push automatic deduplication + manual force verified');

  // -------------------------------------------------------------------------
  // TEST 6: push_verify_session trusted resolution
  // -------------------------------------------------------------------------
  const { rows: sessRows } = await client1.query(
    `INSERT INTO auth_sessions (role, entity_id, login_code, expires_at)
     VALUES ('UNIT', $1, $2, now() + INTERVAL '1 hour')
     RETURNING token, EXTRACT(EPOCH FROM expires_at)::BIGINT AS exp`,
    [unitA.id, unitA.login_code]
  );
  const sessToken = sessRows[0].token;
  createdSessionTokens.push(sessToken);

  const { rows: jwtRows } = await client1.query(
    `SELECT sign_session_jwt($1, 'UNIT', $2, $3, $4) AS jwt`,
    [sessToken, unitA.id, unitA.name, sessRows[0].exp]
  );
  const signedJwt = jwtRows[0].jwt;

  const { rows: verifiedRows } = await client1.query(
    `SELECT push_verify_session($1) AS res`,
    [signedJwt]
  );
  assert.equal(verifiedRows[0].res.valid, true);
  assert.equal(verifiedRows[0].res.role, 'unit');
  assert.equal(verifiedRows[0].res.account_id, `unit:${unitA.id}`);
  assert.equal(verifiedRows[0].res.unit_id, unitA.id);
  assert.equal(verifiedRows[0].res.sector_id, unitA.sector_id);

  const { rows: invalidRows } = await client1.query(
    `SELECT push_verify_session('invalid.jwt.token') AS res`
  );
  assert.equal(invalidRows[0].res.valid, false);
  pass('6. push_verify_session trusted identity resolution verified');

  // -------------------------------------------------------------------------
  // TEST 7: @block65/webcrypto-web-push encryption & VAPID signing dry-run
  // -------------------------------------------------------------------------
  const clientEc = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const clientJwk = clientEc.privateKey.export({ format: 'jwk' });
  const p256dh = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(clientJwk.x, 'base64url'),
    Buffer.from(clientJwk.y, 'base64url'),
  ]).toString('base64url');
  const authSecret = crypto.randomBytes(16).toString('base64url');

  const builtPayload = await buildPushPayload(
    {
      data: {
        title: 'ടെസ്റ്റ് മൈൽസ്റ്റോൺ 🎉',
        body: 'അഭിനന്ദനങ്ങൾ! 10 ഓർഡറുകൾ പൂർത്തിയായി.',
        url: '/dashboard',
      },
      options: {
        ttl: 86400,
        urgency: 'high',
      },
    },
    {
      endpoint: 'https://fcm.googleapis.com/fcm/send/dry-run-endpoint',
      expirationTime: null,
      keys: { p256dh, auth: authSecret },
    },
    {
      subject: vapidSubject,
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
    }
  );

  assert.equal(builtPayload.method, 'post');
  assert(builtPayload.headers.authorization.startsWith('vapid t='));
  assert(builtPayload.headers.authorization.includes(`, k=${vapidPublicKey}`));
  assert.equal(builtPayload.headers['content-encoding'], 'aes128gcm');
  assert.equal(builtPayload.headers.ttl, '86400');
  assert.equal(builtPayload.headers.urgency, 'high');
  assert(builtPayload.body instanceof Uint8Array);
  assert.equal(builtPayload.body.byteLength, 4096);
  pass('7. @block65/webcrypto-web-push RFC 8291 encryption & VAPID signing dry-run verified');
} finally {
  if (createdSessionTokens.length > 0) {
    await client1
      .query(`DELETE FROM auth_sessions WHERE token = ANY($1::uuid[])`, [
        createdSessionTokens,
      ])
      .catch(() => undefined);
  }
  if (createdDispatchKeys.length > 0) {
    await client1
      .query(`DELETE FROM push_dispatch_log WHERE event_key = ANY($1::text[])`, [
        createdDispatchKeys,
      ])
      .catch(() => undefined);
  }
  if (createdEntryIds.length > 0) {
    await client1
      .query(`DELETE FROM entries WHERE id = ANY($1::int[])`, [createdEntryIds])
      .catch(() => undefined);
  }

  // Confirm 0 leftover test rows remain
  if (createdEntryIds.length > 0) {
    const { rows: remEntries } = await client1
      .query(`SELECT COUNT(*)::INT AS cnt FROM entries WHERE id = ANY($1::int[])`, [
        createdEntryIds,
      ])
      .catch(() => ({ rows: [{ cnt: -1 }] }));
    assert.equal(remEntries[0].cnt, 0, 'Leftover test entries found after cleanup');
  }
  if (createdDispatchKeys.length > 0) {
    const { rows: remLogs } = await client1
      .query(
        `SELECT COUNT(*)::INT AS cnt FROM push_dispatch_log WHERE event_key = ANY($1::text[])`,
        [createdDispatchKeys]
      )
      .catch(() => ({ rows: [{ cnt: -1 }] }));
    assert.equal(remLogs[0].cnt, 0, 'Leftover dispatch logs found after cleanup');
  }

  await client1.end().catch(() => undefined);
  await client2.end().catch(() => undefined);
}

console.log(
  `\nAll ${passedTests.length} push verification checks passed cleanly with zero leftover test data.`
);
