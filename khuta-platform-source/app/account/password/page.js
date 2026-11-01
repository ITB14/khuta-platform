import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
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
      <PlatformBar user={user} home={user.mustChangePassword ? null : '/dashboard'}>
        <SignOutButton />
      </PlatformBar>

      <main className="wrap" style={{ maxWidth: 560 }}>
        {/* لا رجوع من كلمة المرور المؤقّتة: الرئيسية تُعيد إلى هنا، فرابطٌ
            إليها يبدو معطّلًا. ويظهر الرجوع حين يكون التغيير اختياريًا. */}
        {user.mustChangePassword ? null : (
          <Back href="/dashboard" label="الرئيسية" here="كلمة المرور" />
        )}
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
