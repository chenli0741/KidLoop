import {normalizeOperationLocation,type OperationLocation} from './operation-location';

// One-shot, on user action only. No tracking, background polling or cached fixes.
export function captureOperationLocation(geo?: Pick<Geolocation,'getCurrentPosition'>): Promise<OperationLocation> {
  try{geo ??= typeof navigator==='undefined' ? undefined : navigator.geolocation;}catch{return Promise.resolve({status:'UNAVAILABLE'});}
  if(!geo)return Promise.resolve({status:'UNSUPPORTED'});
  return new Promise(resolve=>{
    let completed=false;
    const finish=(location:OperationLocation)=>{if(completed)return;completed=true;clearTimeout(timer);resolve(location);};
    const timer=setTimeout(()=>finish({status:'TIMEOUT'}),5000);
    try {
      geo.getCurrentPosition(position=>{
        try{finish(normalizeOperationLocation({status:'CAPTURED',latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyMeters:position.coords.accuracy,capturedAt:new Date(position.timestamp).toISOString()}));}
        catch{finish({status:'INVALID'});}
      },
        error=>finish({status:error.code===1?'DENIED':error.code===3?'TIMEOUT':'UNAVAILABLE'}),
        {enableHighAccuracy:true,maximumAge:0,timeout:4500});
    }catch{finish({status:'UNAVAILABLE'});}
  });
}
