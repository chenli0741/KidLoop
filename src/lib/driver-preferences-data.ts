import type {PoolClient} from 'pg';
import type {DriverPreferences} from './driver-preferences';
export async function saveDriverPreferences(c:PoolClient,id:string,p:DriverPreferences) {
 const ids=p.preferredSchoolIds??[];
 const schools=await c.query('select id from schools where id=any($1::uuid[]) for key share',[ids]);
 if(schools.rowCount!==ids.length)throw new Error('请选择有效学校 / Select valid schools');
 await c.query('update drivers set earliest_dismissal_time=$2,latest_dismissal_time=$3,school_preference_mode=$4,updated_at=clock_timestamp() where id=$1',[id,p.earliestDismissalTime,p.latestDismissalTime,p.schoolPreferenceMode]);
 await c.query('delete from driver_school_preferences where driver_id=$1',[id]);
 await c.query('insert into driver_school_preferences(driver_id,school_id) select $1,unnest($2::uuid[])',[id,ids]);
}
