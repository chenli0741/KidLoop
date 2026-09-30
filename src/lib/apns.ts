import "server-only";
import { connect } from "node:http2";
import { createSign } from "node:crypto";

let cached:{value:string;expires:number}|null=null;
const base64url=(value:string|Buffer)=>Buffer.from(value).toString("base64url");
function credentials(){const keyId=process.env.APNS_KEY_ID?.trim(),teamId=process.env.APNS_TEAM_ID?.trim(),bundleId=process.env.APNS_BUNDLE_ID?.trim()||"com.globjoy.kidloop",key=process.env.APNS_PRIVATE_KEY?.replace(/\\n/g,"\n").trim();if(!keyId||!teamId||!key)throw new Error("APNS_NOT_CONFIGURED");return{keyId,teamId,bundleId,key};}
function bearer(){const c=credentials(),now=Math.floor(Date.now()/1000);if(cached&&cached.expires>now)return cached.value;const header=base64url(JSON.stringify({alg:"ES256",kid:c.keyId})),claims=base64url(JSON.stringify({iss:c.teamId,iat:now})),signer=createSign("SHA256");signer.update(`${header}.${claims}`);signer.end();const signature=signer.sign({key:c.key,dsaEncoding:"ieee-p1363"});const value=`${header}.${claims}.${base64url(signature)}`;cached={value,expires:now+3000};return value;}
export async function sendApns(token:string,environment:"sandbox"|"production",payload:{title:string;body:string;path:string}){
 const c=credentials(),origin=environment==="sandbox"?"https://api.sandbox.push.apple.com":"https://api.push.apple.com";
 return new Promise<{status:number;reason?:string}>((resolve,reject)=>{const client=connect(origin);client.setTimeout(15000,()=>client.destroy(new Error("APNS_TIMEOUT")));client.once("error",reject);const request=client.request({":method":"POST",":path":`/3/device/${token}`,authorization:`bearer ${bearer()}`,"apns-topic":c.bundleId,"apns-push-type":"alert","apns-priority":"10"});let status=0,data="";request.setEncoding("utf8");request.on("response",headers=>{status=Number(headers[":status"]??0);});request.on("data",chunk=>data+=chunk);request.on("end",()=>{client.close();let reason:string|undefined;try{reason=(JSON.parse(data) as {reason?:string}).reason;}catch{}resolve({status,reason});});request.on("error",error=>{client.destroy();reject(error);});request.end(JSON.stringify({aps:{alert:{title:payload.title,body:payload.body},sound:"default"},path:payload.path}));});
}
