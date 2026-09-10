import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import { FormPanel } from "@/components/form-panel";
import { createTravelTime, deleteTravelTime } from "@/app/actions";

type TravelTime = { id:string; from_name:string; to_name:string; estimated_minutes:number; buffer_minutes:number; notes:string };
export async function TravelTimeResources() {
  await requireUser(["ADMIN"]);
  const locale = await getLocale();
  const rows = (await query<TravelTime>("select id,from_name,to_name,estimated_minutes,buffer_minutes,notes from travel_time_profiles where active order by from_name,to_name")).rows;
  return <div className="split-layout">
    <section className="content-section"><div className="section-heading"><div><span className="eyebrow">{text(locale,"基础配置","Configuration")}</span><h2>{text(locale,"地点间行驶时间","Point-to-point travel times")}</h2></div><span className="section-count">{rows.length}</span></div>
      {rows.length ? <div className="location-list">{rows.map(row => <article className="location-card" key={row.id}><div className="location-title"><div><h3>{row.from_name} → {row.to_name}</h3><p>{row.estimated_minutes} {text(locale,"分钟","minutes")} {row.buffer_minutes ? `+ ${row.buffer_minutes} ${text(locale,"分钟缓冲","min buffer")}` : ""}</p></div></div>{row.notes && <div className="location-details"><p>{row.notes}</p></div>}<ActionForm action={deleteTravelTime} submitLabel={text(locale,"停用","Deactivate")}><input type="hidden" name="id" value={row.id}/></ActionForm></article>)}</div> : <p className="form-hint">{text(locale,"尚未配置地点间时间。排班试算遇到缺失时会提示。","No travel times configured. Scheduling trials will flag missing pairs.")}</p>}
    </section>
    <FormPanel heading={<div className="panel-heading"><div><h2>{text(locale,"添加地点间时间","Add travel time")}</h2><p>{text(locale,"A→B 与 B→A 分开维护。","Maintain A→B and B→A separately.")}</p></div></div>}>
      <ActionForm action={createTravelTime} submitLabel={text(locale,"保存时间","Save travel time")}>
        <label><span>{text(locale,"起点","From")}</span><input name="fromName" required maxLength={160}/></label>
        <label><span>{text(locale,"终点","To")}</span><input name="toName" required maxLength={160}/></label>
        <label><span>{text(locale,"预计分钟数","Estimated minutes")}</span><input name="estimatedMinutes" type="number" min="1" max="600" required/></label>
        <label><span>{text(locale,"缓冲分钟数","Buffer minutes")}</span><input name="bufferMinutes" type="number" min="0" max="120" defaultValue="0" required/></label>
        <label className="full"><span>{text(locale,"备注","Notes")}</span><textarea name="notes" rows={3}/></label>
      </ActionForm>
    </FormPanel>
  </div>;
}
