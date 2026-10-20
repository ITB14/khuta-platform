import { NextResponse } from 'next/server';
const db = require('../../../../src/db');
const identity = require('../../../../src/identity');
const S = require('../../../../lib/session');

export async function POST(req) {
  const token = req.cookies.get(S.SESSION_COOKIE)?.value;
  if (token) {
    const tenant = await S.requestTenant();
    await db.withTenant(tenant.id, null, (c) => identity.revokeSession(c, token));
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(S.SESSION_COOKIE, '', S.cookieOpts(0));
  res.cookies.set(S.PENDING_COOKIE, '', S.cookieOpts(0));
  return res;
}
