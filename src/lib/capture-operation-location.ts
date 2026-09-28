import {Capacitor} from '@capacitor/core';
import {Geolocation as NativeGeolocation} from '@capacitor/geolocation';
import {normalizeOperationLocation,type OperationLocation} from './operation-location';

type NativeGeo = Pick<typeof NativeGeolocation,'checkPermissions'|'requestPermissions'|'getCurrentPosition'>;

function captured(position:{coords:{latitude:number;longitude:number;accuracy:number};timestamp:number}):OperationLocation {
  return normalizeOperationLocation({status:'CAPTURED',latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyMeters:position.coords.accuracy,capturedAt:new Date(position.timestamp).toISOString()});
}

export async function captureNativeOperationLocation(geo:NativeGeo=NativeGeolocation):Promise<OperationLocation> {
  try {
    let permission=await geo.checkPermissions();
    if(permission.location==='prompt'||permission.location==='prompt-with-rationale')permission=await geo.requestPermissions({permissions:['location']});
    if(permission.location!=='granted')return {status:'DENIED'};
    return await new Promise(resolve=>{
      let completed=false;
      const finish=(location:OperationLocation)=>{if(completed)return;completed=true;clearTimeout(timer);resolve(location);};
      const timer=setTimeout(()=>finish({status:'TIMEOUT'}),5000);
      void geo.getCurrentPosition({enableHighAccuracy:true,maximumAge:0,timeout:4500})
        .then(position=>{try{finish(captured(position));}catch{finish({status:'INVALID'});}})
        .catch(()=>finish({status:'UNAVAILABLE'}));
    });
  } catch { return {status:'UNAVAILABLE'}; }
}

// One-shot, on user action only. No tracking, background polling or cached fixes.
export function captureOperationLocation(geo?: Pick<Geolocation,'getCurrentPosition'>): Promise<OperationLocation> {
  if(!geo&&Capacitor.isNativePlatform())return captureNativeOperationLocation();
  try{geo ??= typeof navigator==='undefined' ? undefined : navigator.geolocation;}catch{return Promise.resolve({status:'UNAVAILABLE'});}
  if(!geo)return Promise.resolve({status:'UNSUPPORTED'});
  return new Promise(resolve=>{
    let completed=false;
    const finish=(location:OperationLocation)=>{if(completed)return;completed=true;clearTimeout(timer);resolve(location);};
    const timer=setTimeout(()=>finish({status:'TIMEOUT'}),5000);
    try {
      geo.getCurrentPosition(position=>{
        try{finish(captured(position));}
        catch{finish({status:'INVALID'});}
      },
        error=>finish({status:error.code===1?'DENIED':error.code===3?'TIMEOUT':'UNAVAILABLE'}),
        {enableHighAccuracy:true,maximumAge:0,timeout:4500});
    }catch{finish({status:'UNAVAILABLE'});}
  });
}
