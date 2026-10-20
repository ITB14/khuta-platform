import { redirect } from 'next/navigation';
const S = require('../lib/session');

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await S.currentUser();
  redirect(user ? '/dashboard' : '/signin');
}
