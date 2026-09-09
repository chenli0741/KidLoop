import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alignment,matchFaces,suppressFaces,type FaceBox} from '../src/lib/pickup-camera/matching';
const face:FaceBox={x:0,y:0,width:10,height:10,score:.9,landmarks:[]};
test('camera leaves ambiguous, duplicate and weak matches unknown',()=>{
 assert.equal(matchFaces([{face,embedding:[1,0]}],[{assignmentId:'a',embedding:[1,0]}])[0].assignmentId,'a');
 assert.equal(matchFaces([{face,embedding:[1,0]}],[{assignmentId:'a',embedding:[0,1]}])[0].assignmentId,undefined);
 assert.equal(matchFaces([{face,embedding:[1,0]}],[{assignmentId:'a',embedding:[1,0]},{assignmentId:'b',embedding:[1,.01]}])[0].assignmentId,undefined);
 assert.ok(matchFaces([{face,embedding:[1,0]},{face,embedding:[1,0]}],[{assignmentId:'a',embedding:[1,0]}]).every(m=>!m.assignmentId));
 assert.equal(matchFaces([{face,embedding:[0,0]}],[])[0].assignmentId,undefined);
});
test('alignment reverses rotation, scale and translation',()=>{
 const target=[{x:38.2946,y:51.6963},{x:73.5318,y:51.5014},{x:56.0252,y:71.7366},{x:41.5493,y:92.3655},{x:70.7299,y:92.2041}];
 const input=target.map(p=>({x:20-2*p.y,y:10+2*p.x}));const [a,b,c,d,e,f]=alignment(input);
 input.forEach((p,i)=>{assert.ok(Math.abs(a*p.x+c*p.y+e-target[i].x)<1e-6);assert.ok(Math.abs(b*p.x+d*p.y+f-target[i].y)<1e-6);});
 assert.throws(()=>alignment(Array(5).fill({x:0,y:0})));
});
test('face boxes suppress duplicate detections but preserve separate people',()=>assert.equal(suppressFaces([face,{...face,x:1,score:.7},{...face,x:20}]).length,2));

test('recognition labels completed riders while pickup selection excludes completed and unavailable riders',async()=>{
 const {selectablePickups}=await import('../src/lib/pickup-camera/matching');
 const riders=[{id:'done',status:'DROPPED_OFF'},{id:'onboard',status:'PICKED_UP'},{id:'next',status:'SCHEDULED'},{id:'absent',status:'SCHEDULED',parentAbsent:true},{id:'other',status:'PICKED_UP',otherVehicle:'Other car'}];
 const matches=matchFaces([{face,embedding:[1,0]}],riders.map((r,i)=>({assignmentId:r.id,embedding:i===0?[1,0]:[0,1]})));
 assert.equal(matches[0].assignmentId,'done');
 assert.deepEqual(selectablePickups(['done','onboard','next','absent','other','next','unknown'],riders),['next']);
 assert.deepEqual(selectablePickups(['done','onboard'],riders),[]);
});
