import Mark from './Mark';

// The government strip is fixed by the Abu Dhabi identity and is never
// restyled by the platform. Khuta lives in the black bar beneath it.
export function GovStrip() {
  return (
    <header className="gov">
      <div className="lockup">
        <div className="wm">
          <span className="a">دائرة البلديات والنقل · بلدية مدينة العين</span>
          <span className="e">DEPARTMENT OF MUNICIPALITIES AND TRANSPORT · AL AIN CITY MUNICIPALITY</span>
        </div>
      </div>
    </header>
  );
}

export function PlatformBar({ user, children }) {
  return (
    <>
      <div className="pbar">
        <div className="brand">
          <Mark />
          خُطى
          <small>KHUTA · أكاديمية بلدية مدينة العين</small>
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
