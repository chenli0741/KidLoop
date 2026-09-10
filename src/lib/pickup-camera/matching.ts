export type Point={x:number;y:number};
export type FaceBox={x:number;y:number;width:number;height:number;landmarks:Point[];score:number};
export type FaceMatch={face:FaceBox;assignmentId?:string;similarity?:number};
// Tuned for varied in-car lighting and partial profiles. The margin still
// rejects ambiguous candidates, while the lower score accepts more genuine
// matches from small or shadowed faces.
export const MATCH_MIN_SIMILARITY=0.40;
export const MATCH_MIN_MARGIN=0.05;
export function cosine(a:ArrayLike<number>,b:ArrayLike<number>){
 if(a.length!==b.length||!a.length)return -1;
 let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
 return aa&&bb?dot/Math.sqrt(aa*bb):-1;
}
export function matchFaces(faces:{face:FaceBox;embedding:ArrayLike<number>}[],references:{assignmentId:string;embedding:ArrayLike<number>}[]):FaceMatch[]{
 const results=faces.map(({face,embedding})=>{
  const scores=references.map(r=>({id:r.assignmentId,score:cosine(embedding,r.embedding)})).sort((a,b)=>b.score-a.score);
  const best=scores[0];
  return {face,similarity:best?.score,assignmentId:best&&best.score>=MATCH_MIN_SIMILARITY&&best.score-(scores[1]?.score??-1)>=MATCH_MIN_MARGIN?best.id:undefined};
 });
 // Ambiguous duplicate identity is never silently assigned to either face.
 const counts=new Map<string,number>();for(const r of results)if(r.assignmentId)counts.set(r.assignmentId,(counts.get(r.assignmentId)??0)+1);
 return results.map(r=>counts.get(r.assignmentId??'')!>1?{...r,assignmentId:undefined}:r);
}
export function alignment(points:Point[]){
 const target=[{x:38.2946,y:51.6963},{x:73.5318,y:51.5014},{x:56.0252,y:71.7366},{x:41.5493,y:92.3655},{x:70.7299,y:92.2041}];
 if(points.length!==5)throw new Error('Invalid landmarks');
 const mean=(p:Point[])=>({x:p.reduce((s,p)=>s+p.x,0)/5,y:p.reduce((s,p)=>s+p.y,0)/5});
 const m=mean(points),n=mean(target);let dot=0,cross=0,den=0;
 for(let i=0;i<5;i++){const x=points[i].x-m.x,y=points[i].y-m.y,u=target[i].x-n.x,v=target[i].y-n.y;dot+=x*u+y*v;cross+=x*v-y*u;den+=x*x+y*y;}
 if(den<1e-6)throw new Error('Invalid landmarks');
 const a=dot/den,b=cross/den;return [a,b,-b,a,n.x-a*m.x+b*m.y,n.y-b*m.x-a*m.y] as const;
}
export function suppressFaces(faces:FaceBox[]){
 const kept:FaceBox[]=[];
 for(const f of [...faces].sort((a,b)=>b.score-a.score)){
  if(kept.some(g=>{const intersection=Math.max(0,Math.min(f.x+f.width,g.x+g.width)-Math.max(f.x,g.x))*Math.max(0,Math.min(f.y+f.height,g.y+g.height)-Math.max(f.y,g.y));return intersection/(f.width*f.height+g.width*g.height-intersection)>.3;}))continue;
  kept.push(f);if(kept.length===30)break;
 }
 return kept.sort((a,b)=>a.y-b.y||a.x-b.x);
}

// Recognition can label every manifest rider; confirmation only includes currently eligible pickups.
export function selectablePickups(ids:string[],riders:{id:string;status:string;parentAbsent?:boolean;otherVehicle?:string}[]){
 const allowed=new Set(riders.filter(r=>r.status==='SCHEDULED'&&!r.parentAbsent&&!r.otherVehicle).map(r=>r.id));
 return [...new Set(ids.filter(id=>allowed.has(id)))];
}
