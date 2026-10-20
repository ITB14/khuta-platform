import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import SignOutButton from '../../dashboard/SignOutButton';
import ChangePasswordForm from './ChangePasswordForm';
const S = require('../../../lib/session');

export const dynamic = 'force-dynamic';

export default async function ChangePassword() {
  const user = await S.currentUser();
  if (!user) redirect('/signin');

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 560 }}>
        <h1>كلمة المرور</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          {user.mustChangePassword
            ? 'اختر كلمة مرور خاصّة بك قبل متابعة الدورة.'
            : 'غيّر كلمة مرورك متى شئت.'}
        </p>
        <ChangePasswordForm forced={!!user.mustChangePassword} />
      </main>
    </>
  );
}
