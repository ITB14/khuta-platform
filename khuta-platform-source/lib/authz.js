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

// --------------------------------------------------------- أدوار الأكاديمية
// ثلاث طبقات لا طبقتان: من يرى الجهة كلّها، ومن يرى إدارته، ومن يرى نفسه.
// والطبقة الوسطى هي الأكثر عددًا في أكاديمية التدريب البلدي — رؤساء الإدارات.
//
// **ما يُفرض هنا هو الدخول إلى الشاشة لا مدى ما تعرضه.** مدى الرؤية يفرضه
// منظر `visible_user` في قاعدة البيانات: رئيس إدارة يفتح صفحة المتعلّمين
// فيراها بموظفي إدارته وحدهم، لا لأن الصفحة رشّحت بل لأن الصفّ الآخر لم يصله.
const hasAnyRole = (user, roles) => roles.some((r) => hasRole(user, r));

const isAcademyDirector = (user) => hasRole(user, 'academy_director');
const isTrainingOfficer = (user) => hasRole(user, 'training_officer');
const isDeptHead        = (user) => hasRole(user, 'dept_head');

/** رؤيةٌ على مستوى الجهة كلّها — يطابق actor_is_tenant_wide في قاعدة البيانات. */
const isTenantWide = (user) =>
  hasAnyRole(user, ['admin', 'academy_director', 'training_officer', 'auditor']);

/** من له عملٌ في شاشات الأكاديمية أصلًا — بأي قدر من المدى. */
const isStaff = (user) =>
  hasAnyRole(user, ['admin', 'academy_director', 'training_officer', 'dept_head']);

/** للصفحات: سبب المنع أو null. */
function staffDenial(user) {
  if (!user) return 'signin';
  if (!isStaff(user)) return 'forbidden';
  return null;
}

/** لمسارات API: Response عند المنع أو null عند السماح. لا يذكر اسم دور. */
function guardStaff(user) {
  if (!user) return Response.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  if (!isStaff(user)) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  return null;
}

/** ولمسارات لا يملكها رئيس إدارة — اعتماد خطة، كتالوج، إعدادات الجهة. */
function guardTenantWide(user) {
  if (!user) return Response.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  if (!isTenantWide(user)) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  return null;
}

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

module.exports = {
  hasRole, hasAnyRole, isAdmin, adminDenial, guardAdmin, learnerDenial,
  isAcademyDirector, isTrainingOfficer, isDeptHead, isTenantWide, isStaff,
  staffDenial, guardStaff, guardTenantWide,
};
