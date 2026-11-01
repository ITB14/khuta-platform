import Link from 'next/link';

/**
 * نقطة الرجوع — سطرٌ واحد في أعلى كل صفحة.
 *
 * الوجهة صفحةٌ بعينها لا تاريخُ المتصفّح: من فتح الرابط من إشعار أو من
 * بريد أو أعاد التحميل لا تاريخَ له يرجع إليه، فزرٌّ يستدعي history.back()
 * يصير عنده زرًّا لا يفعل شيئًا. والأبُ معروفٌ دائمًا.
 *
 * والسهم يشير يمينًا لأن الرجوع في واجهة عربية رجوعٌ إلى اليمين، ويُرسم
 * بشكلٍ لا يعتمد على اتّجاه الخطّ لئلّا ينقلب مع النصّ.
 */
export default function Back({ href, label, here }) {
  return (
    <p className="crumb">
      <Link className="back" href={href} data-testid="back">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{label}</span>
      </Link>
      {here ? <span className="here">{here}</span> : null}
    </p>
  );
}
