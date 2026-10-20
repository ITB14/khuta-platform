'use strict';
// التصريح بالأدوار.
//
// العزل بين الجهات تفرضه قاعدة البيانات بسياسات الصفوف، فلا تستطيع جهة رؤية
// صفوف جهة أخرى مهما أخطأ الاستعلام. أمّا الفصل **داخل** الجهة — متعلّم مقابل
// مسؤول — فلا سياسة له: دور khuta_app يرى صفوف جهته كلّها. ولذلك يُفرض هنا،
// في طبقة التطبيق، صراحةً وفي كل مسار على حدة.
//
// النتيجة العملية: نسيان الحارس على صفحة جديدة يكشفها. فكل ما تحت /admin
// يبدأ بـ requireAdmin، وكل مسار API إداري يبدأ بـ guardAdmin.

/** هل يحمل المستخدم هذا الدور؟ */
function hasRole(user, role) {
  return Array.isArray(user?.roles) && user.roles.includes(role);
}

const isAdmin = (user) => hasRole(user, 'admin');

/**
 * للصفحات: يعيد سبب المنع، أو null إن كان مصرَّحًا له.
 * الصفحة تقرّر ماذا تفعل بالسبب — تحويل أو رسالة.
 */
function adminDenial(user) {
  if (!user) return 'signin';
  if (!isAdmin(user)) return 'forbidden';
  return null;
}

/**
 * لمسارات API: يعيد Response جاهزًا عند المنع، أو null عند السماح.
 * لا يميّز الردّ بين «غير مسجّل» و«غير مصرَّح» بأكثر من الرمز، ولا يذكر
 * أسماء أدوار — فمن لا يملك الصلاحية لا يتعلّم منها شيئًا.
 */
function guardAdmin(user) {
  if (!user) return Response.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  if (!isAdmin(user)) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  return null;
}

/**
 * كلمة مرور مؤقّتة وضعها غير صاحبها لا تُترك قائمة: كل صفحة متعلّم تمرّ من
 * هنا فتُحوَّل إلى صفحة التغيير. وهذا انضباط تشغيلي لا حدّ أمني — صاحبها
 * دخل فعلًا — ولذلك يكفي حجب الصفحات دون مسارات البيانات.
 */
function learnerDenial(user) {
  if (!user) return 'signin';
  if (user.mustChangePassword) return 'change-password';
  return null;
}

module.exports = { hasRole, isAdmin, adminDenial, guardAdmin, learnerDenial };
