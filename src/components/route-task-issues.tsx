import { readRouteTaskIssues } from "@/lib/fixed-routes";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { text, type Locale } from "@/lib/i18n";
export async function RouteTaskIssues({date,locale}:{date:string;locale:Locale}) {
 await requireUser(["ADMIN"]);
 const issues=await readRouteTaskIssues(db,date);
 return issues.length?<section className="setup-callout" role="status"><strong>{text(locale,"以下固定线路需要调整","Recurring routes need attention")}</strong>{issues.map(i=><p key={i.name}>{i.name}：{i.message.split(" / ")[locale==="zh"?0:1]}</p>)}</section>:null;
}
