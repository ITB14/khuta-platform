import { redirect } from 'next/navigation';
import { GovStrip, PlatformBar, DemoBanner } from '../../../components/Chrome';
import Back from '../../../components/Back';
import SignOutButton from '../../dashboard/SignOutButton';
import CatalogueEditor from './CatalogueEditor';
const db = require('../../../src/db');
const S = require('../../../lib/session');
const A = require('../../../lib/authz');

export const dynamic = 'force-dynamic';

export default async function AdminCatalogue() {
  const user = await S.currentUser();
  const denial = A.adminDenial(user);
  if (denial === 'signin') redirect('/signin');
  if (denial) redirect('/dashboard');

  const data = await db.withTenant(user.tenant.id, user.id, async (c) => {
    const { rows: courses } = await c.query(
      'select * from course_catalogue order by title_ar');
    const { rows: categories } = await c.query(`
      select cc.id, cc.name_ar, cc.name_en, cc.sort, cc.is_active,
             (select count(*) from course co where co.category_id = cc.id)::int as courses
        from course_category cc order by cc.sort, cc.name_ar`);
    const { rows: providers } = await c.query(`
      select pr.id, pr.name_ar, pr.name_en, pr.is_active,
             (select count(*) from course co where co.provider_id = pr.id)::int as courses
        from provider pr order by pr.name_ar`);
    return { courses, categories, providers };
  });

  const unclassified = data.courses.filter((c) => !c.category_id).length;

  return (
    <>
      <DemoBanner tenant={user.tenant} />
      <GovStrip />
      <PlatformBar user={user}><SignOutButton /></PlatformBar>

      <main className="wrap" style={{ maxWidth: 1040 }}>
        <Back href="/admin" label="المتعلّمون" here="الكتالوج" />
        <h1>كتالوج الدورات</h1>
        <p className="muted" style={{ marginBottom: 20, maxWidth: 820 }}>
          التصنيف يجمع الدورات في عائلات، والمزوّد يقول من أنتج المحتوى. وعلى
          دورة واحدة لا يفرز أحدهما شيئًا — فائدتهما تبدأ مع الدورة الثانية.
          وسببُ وجودهما اليوم أنّ تصنيف دورةٍ عند إنشائها معرفة، وتصنيفها بعد
          أن يسجّل فيها ألفٌ تخمين.
        </p>

        <div className="kpi" style={{ marginBottom: 18 }}>
          <div><b className="num">{data.courses.length}</b><span>دورات</span></div>
          <div><b className="num">{data.categories.length}</b><span>تصنيفات</span></div>
          <div><b className="num">{data.providers.length}</b><span>مزوّدون</span></div>
          <div>
            <b className={`num${unclassified ? ' no' : ''}`}>{unclassified}</b>
            <span>بلا تصنيف</span>
          </div>
        </div>

        <CatalogueEditor initial={data} />

        <p className="tiny muted" style={{ marginTop: 14 }}>
          أوّلُ تصنيفٍ وأوّلُ مزوّدٍ قرارُ محتوى تملكه الجهة، فلم يُزرع هنا شيء.
          ولا يُحذف تصنيفٌ حملته دورة — قاعدة البيانات نفسها تمنعه — والتعطيل
          يُخرجه من قائمة الإسناد ويُبقي ما أُسند.
        </p>
      </main>
    </>
  );
}
