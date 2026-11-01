import Link from 'next/link';
import Mark from './Mark';
import Wordmark from './Wordmark';

// The government strip is fixed by the Abu Dhabi identity and is never
// restyled by the platform. Khuta lives in the black bar beneath it.
export function GovStrip() {
  return (
    <header className="gov">
      <div className="lockup">
        {/* الشعار الرسمي كما ورد من الجهة — لا يُعاد رسمه ولا يُعاد تلوينه */}
        <img className="crest" src="/gov/al-ain-municipality.png" alt="" width="40" height="56" />
        <div className="vr" />
        <div className="wm">
          <span className="a">دائرة البلديات والنقل · بلدية مدينة العين</span>
          <span className="e">DEPARTMENT OF MUNICIPALITIES AND TRANSPORT · AL AIN CITY MUNICIPALITY</span>
        </div>
      </div>
    </header>
  );
}

// الكلمة-علامة مخرجٌ من أي صفحة إلى الرئيسية. و`home` يُمرَّر null حيث
// يكون الخروج ممنوعًا أصلًا — كصفحة كلمة المرور المؤقّتة التي تُعيد إليها
// الرئيسيةُ نفسها، فرابطٌ إليها يبدو معطّلًا وهو ليس كذلك.
export function PlatformBar({ user, children, home = '/dashboard' }) {
  const lockup = (
    <>
      <Mark />
      <Wordmark />
      <small>KHUTA · أكاديمية بلدية مدينة العين</small>
    </>
  );
  return (
    <>
      <div className="pbar">
        <div className="brand">
          {user && home ? <Link href={home} data-testid="brand-home">{lockup}</Link> : lockup}
        </div>
        <div className="util">
          {user ? <span className="who">{user.full_name_ar}</span> : null}
          {children}
        </div>
      </div>
      <div className="goldline" />
    </>
  );
}

export function DemoBanner({ tenant }) {
  if (!tenant?.demo_mode) return null;
  return (
    <div className="demo">
      <b>وضع العرض مُفعّل</b> — تشغيل الفيديو أسرع من الزمن الحقيقي بمقدار ×{tenant.demo_speed}.
      هذا الوضع مسجَّل في سجلّ التدقيق ولا يُفعَّل في بيئة الإنتاج.
    </div>
  );
}
