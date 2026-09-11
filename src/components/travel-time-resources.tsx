import { Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ActionForm } from "@/components/action-form";
import { ResourceDialog } from "@/components/resource-dialog";
import { createTravelTime, deleteTravelTime, updateTravelTime } from "@/app/actions";

type TravelTime = { id:string; from_name:string; to_name:string; estimated_minutes:number; buffer_minutes:number; origin_dwell_minutes:number; notes:string };
function fields(locale: "zh" | "en", row?: TravelTime) { return <>
  {row && <input type="hidden" name="id" value={row.id}/>}<label><span>{text(locale,"起点","From")}</span><input name="fromName" defaultValue={row?.from_name} required maxLength={160}/></label>
  <label><span>{text(locale,"终点","To")}</span><input name="toName" defaultValue={row?.to_name} required maxLength={160}/></label>
  <label><span>{text(locale,"行驶分钟数","Travel minutes")}</span><input name="estimatedMinutes" type="number" min="1" max="600" defaultValue={row?.estimated_minutes} required/></label>
  <label><span>{text(locale,"起点停留分钟数","Origin dwell minutes")}</span><input name="dwellMinutes" type="number" min="0" max="120" defaultValue={row?.origin_dwell_minutes ?? 0} required/></label>
  <label><span>{text(locale,"缓冲分钟数","Buffer minutes")}</span><input name="bufferMinutes" type="number" min="0" max="120" defaultValue={row?.buffer_minutes ?? 0} required/></label>
  <label className="full"><span>{text(locale,"备注","Notes")}</span><textarea name="notes" rows={2} defaultValue={row?.notes}/></label>
</>; }
export async function TravelTimeResources() {
  await requireUser(["ADMIN"]); const locale = await getLocale();
  const rows = (await query<TravelTime>("select id,from_name,to_name,estimated_minutes,buffer_minutes,origin_dwell_minutes,notes from travel_time_profiles where active order by from_name,to_name")).rows;
  return <section className="content-section resource-list-section"><div className="section-heading"><div><span className="eyebrow">{text(locale,"基础配置","Configuration")}</span><h2>{text(locale,"地点时间","Location times")}</h2><p className="form-hint">{text(locale,"记录 A 到 B 的行驶时间，以及从 A 点停留多久再出发。","Record travel time from A to B and how long the vehicle waits at A before departure.")}</p></div><div className="resource-heading-actions"><span className="section-count">{rows.length}</span><ResourceDialog title={text(locale,"添加地点时间","Add location time")}><ActionForm action={createTravelTime} submitLabel={text(locale,"保存","Save")}>{fields(locale)}</ActionForm></ResourceDialog></div></div>
    {rows.length ? <div className="resource-rows">{rows.map(row => <article className="resource-row" key={row.id}><div className="resource-row-main"><strong>{row.from_name} → {row.to_name}</strong><span>{text(locale,"行驶","Travel")} {row.estimated_minutes}{text(locale,"分钟"," min")} · {text(locale,"起点停留","Dwell")} {row.origin_dwell_minutes}{text(locale,"分钟"," min")}{row.buffer_minutes ? ` · ${text(locale,"缓冲","buffer")} ${row.buffer_minutes}${text(locale,"分钟"," min")}` : ""}</span></div><div className="resource-row-actions"><ResourceDialog title={text(locale,"编辑地点时间","Edit location time")} trigger={<button type="button" className="icon-button" title={text(locale,"编辑","Edit")} aria-label={text(locale,"编辑","Edit")}><Pencil size={16}/></button>}><ActionForm action={updateTravelTime} submitLabel={text(locale,"保存","Save")}>{fields(locale,row)}</ActionForm></ResourceDialog><ActionForm action={deleteTravelTime} submitLabel="" submitIcon={<Trash2 size={16}/>} submitClassName="icon-only-action" className="inline-action-form"><input type="hidden" name="id" value={row.id}/></ActionForm></div></article>)}</div> : <p className="form-hint">{text(locale,"暂无地点时间。","No location times yet.")}</p>}
  </section>;
}
