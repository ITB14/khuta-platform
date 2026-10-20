// كلمة «خُطى» كما في ملف الهوية، لا كنصّ HTML.
//
// السبب: الضمّة في الهوية ذهبية وبـ٦٥٪ من حجم الكلمة، وHTML لا يستطيع تلوين
// علامة تشكيل ولا تصغيرها — فهي تنفصل عن حرفها وتفقد لونها. أمّا SVG فيضع
// العلامة بإحداثيات مقيسة على الخطّ نفسه، فتبقى في موضعها وبلونها.
//
// الإحداثيات منقولة حرفيًّا من design/khuta/svg/khuta_horizontal_reverse.svg
// ولا تُعدَّل هنا: مصدرها مولّد الهوية، وأي تغيير يبدأ من هناك.
const FONT = "'IBM Plex Sans Arabic','Helvetica Neue Arabic','Segoe UI',sans-serif";

export default function Wordmark({ height = 34, ink = '#FFFFFF', mark = '#B68A35' }) {
  return (
    <svg viewBox="150 8 245 132" height={height} role="img" aria-label="خُطى"
         style={{ display: 'block', overflow: 'visible' }}>
      <text x="388" y="118" textAnchor="start" fontFamily={FONT} fontWeight="700"
            fontSize="108" fill={ink} direction="rtl">خطى</text>
      <text x="342.53" y="58.06" fontFamily={FONT} fontWeight="700"
            fontSize="70.2" fill={mark}>{'ُ'}</text>
    </svg>
  );
}
