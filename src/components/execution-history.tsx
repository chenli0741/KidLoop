import {query} from '@/lib/db';
import {text,type Locale} from '@/lib/i18n';
export async function ExecutionHistory({locale}:{locale:Locale}){
 const [summary,events]=await Promise.all([
 query<{from_name:string;to_name:string;n:number;median:string;p90:string;recent:string|null;previous:string|null}>(`select from_id,to_id,max(from_name) from_name,max(to_name) to_name,count(*)::int n,
 round((percentile_cont(0.5) within group(order by minutes))::numeric,1)::text median,
 round((percentile_cont(0.9) within group(order by minutes))::numeric,1)::text p90,
 round((percentile_cont(0.5) within group(order by minutes) filter(where service_date>=current_date-30))::numeric,1)::text recent,
 round((percentile_cont(0.5) within group(order by minutes) filter(where service_date<current_date-30))::numeric,1)::text previous
 from observed_travel_samples where service_date>=current_date-90 group by from_id,to_id order by n desc limit 50`),
 query<{driver_name:string;vehicle_name:string;route_name:string;name:string;event_type:string;time:string;is_test:boolean;snapshot_backfilled:boolean}>(`select driver_name,vehicle_name,route_name,stop_snapshot->>'name' as name,event_type,to_char(occurred_at at time zone 'America/Los_Angeles','YYYY-MM-DD HH24:MI:SS') time,is_test,snapshot_backfilled from execution_observations order by occurred_at desc limit 100`)
 ]);
 return <section className="content-section"><h2>{text(locale,'实际运行记录','Actual operations')}</h2>
 <p>{text(locale,'记录司机点击出发、到达、送达的实际操作时间。不是 GPS 自动测量；漏点或补点会影响用时。首站到达、跨车次空驶尚无完整打点时不推算。','Records departure, arrival and drop-off button timestamps, not automatic GPS measurements. Missing or late taps affect accuracy; incomplete first-stop and between-trip timing is not inferred.')}</p>
 <h3>{text(locale,'近 90 天路段用时参考','Last 90 days: measured journey times')}</h3>
 <p>{text(locale,'仅配对司机同车次相邻站的出发与到达；排除测试账号、管理员操作、跨日及小于 1 分钟或超过 6 小时的样本。少于 5 次仅供观察，不自动覆盖配置。','Pairs driver departure and arrival at adjacent stops in one trip. Excludes test accounts, admin actions, cross-day and durations outside 1–360 minutes. Fewer than 5 samples is preliminary; settings are not automatically overwritten.')}</p>
 <div className="table-wrap"><table><thead><tr>{[text(locale,'路段','Journey'),text(locale,'样本数','Samples'),text(locale,'中位数 / P90（分钟）','Median / P90 (min)'),text(locale,'近30天 / 前60天','Recent 30 / prior 60 days')].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{summary.rows.map((r,i)=><tr key={i}><td>{r.from_name} → {r.to_name}</td><td>{r.n}{r.n<5?text(locale,'（样本少）',' (limited)'):''}</td><td>{r.median} / {r.p90}</td><td>{r.recent??'—'} / {r.previous??'—'}</td></tr>)}</tbody></table></div>
 {!summary.rows.length&&<p>{text(locale,'尚无完整出发—到达样本；计划时间不会计入。','No complete departure–arrival samples yet. Planned times are never counted.')}</p>}
 <h3>{text(locale,'最近 100 条操作记录','Latest 100 events')}</h3><div className="table-wrap"><table><thead><tr><th>{text(locale,'时间','Time')}</th><th>{text(locale,'司机 / 车辆','Driver / vehicle')}</th><th>{text(locale,'地点','Stop')}</th><th>{text(locale,'操作','Event')}</th></tr></thead><tbody>{events.rows.map((e,i)=><tr key={i}><td>{e.time}</td><td>{e.driver_name} / {e.vehicle_name}</td><td>{e.name}</td><td>{e.event_type==='GO'?text(locale,'出发/结束','Depart/finish'):e.event_type==='ARRIVED'?text(locale,'到达','Arrive'):text(locale,'送达','Drop off')}{e.is_test?text(locale,'（测试）',' (test)'):''}{e.snapshot_backfilled?text(locale,'（历史补录）',' (historical import)'):''}</td></tr>)}</tbody></table></div>
 </section>;
}
