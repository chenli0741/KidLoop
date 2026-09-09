import 'server-only';
import type {PoolClient} from 'pg';
import {readFixedRoutes} from './fixed-routes';
export type StudentRouteAssignment={assigned:boolean;zh:string;en:string};
export async function assignNewStudentRoute(c:PoolClient,studentId:string,_selectedKey:string,today:string):Promise<StudentRouteAssignment>{
 void _selectedKey;
 const routes=await readFixedRoutes(c);
 const assigned=routes.some(r=>r.enabled&&r.endsOn>=today&&r.students.some(a=>a.studentId===studentId));
 return {assigned,zh:assigned?'学生已保存，接送名单自动更新。请查看每日接送核对。':'学生已保存，尚无匹配线路。请查看每日接送核对。',en:assigned?'Student saved; rosters update automatically. Review daily pickups.':'Student saved; no matching route yet. Review daily pickups.'};
}
