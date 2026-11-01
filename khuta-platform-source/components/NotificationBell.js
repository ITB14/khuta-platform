import Link from 'next/link';

/**
 * جرس الإشعارات — عدد غير المقروء وحده.
 *
 * مكوّن خادم لا عميل: العدد يأتي مع الصفحة بلا طلب ثانٍ، ولا شيء هنا يحتاج
 * تحديثًا لحظيًّا. والصفر لا يُعرض: شارة صفرية ضجيج دائم لا معلومة.
 */
export default function NotificationBell({ count = 0 }) {
  return (
    <Link className="linkbtn bell" href="/notifications" data-testid="bell"
          aria-label={count > 0 ? `الإشعارات، ${count} غير مقروء` : 'الإشعارات'}>
      الإشعارات
      {count > 0 ? <span className="dot" data-testid="bell-count">{count}</span> : null}
    </Link>
  );
}
