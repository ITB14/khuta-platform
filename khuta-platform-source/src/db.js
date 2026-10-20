'use strict';
// Database access. Every query the application makes runs as khuta_app — a
// plain role with no superuser and no BYPASSRLS — inside a transaction whose
// tenant context is set with SET LOCAL. Two consequences worth stating:
//
//   · A forgotten WHERE clause cannot cross a tenant boundary; the row-level
//     policy refuses before the query returns.
//   · The context is transaction-local, so a pooled connection handed to the
//     next request never carries the previous tenant's identity with it.
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 5433),
  user: process.env.PGUSER || 'khuta_app',
  password: process.env.PGPASSWORD || 'change_me_at_deploy',
  database: process.env.PGDATABASE || 'khuta',
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
});

/** Resolve a request's Host header to a tenant, before any context exists. */
async function resolveTenant(host, fallback = 'alain') {
  const c = await pool.connect();
  try {
    const { rows } = await c.query(
      'select r.* from tenant_slug_from_host($1, $2) s, resolve_tenant(s) r', [host || '', fallback]);
    return rows[0] || null;
  } finally { c.release(); }
}

/** Run fn inside a transaction bound to one tenant (and optionally one actor). */
async function withTenant(tenantId, actorUserId, fn) {
  if (!tenantId) throw new Error('withTenant: tenantId is required');
  const c = await pool.connect();
  try {
    await c.query('begin');
    // `true` = SET LOCAL: discarded at commit or rollback, never leaks to the
    // next borrower of this pooled connection.
    await c.query('select set_config($1,$2,true)', ['khuta.tenant_id', tenantId]);
    await c.query('select set_config($1,$2,true)', ['khuta.user_id', actorUserId || '']);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally { c.release(); }
}

async function audit(c, { action, objectType = null, objectId = null, detail = null, ip = null }) {
  await c.query(
    `insert into audit_log (tenant_id, actor_user_id, action, object_type, object_id, detail, ip)
     values (current_tenant(), current_actor(), $1, $2, $3, $4, $5)`,
    [action, objectType, objectId, detail ? JSON.stringify(detail) : null, ip]);
}

const close = () => pool.end();

module.exports = { pool, resolveTenant, withTenant, audit, close };
