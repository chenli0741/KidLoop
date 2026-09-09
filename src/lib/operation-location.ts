export type OperationLocation = {
  status: 'CAPTURED' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED' | 'NOT_PROVIDED' | 'INVALID';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  capturedAt?: string;
};

// Validate only payload shape; never evaluate proximity to a school or stop.
// Invalid/missing GPS data must not reject the pickup/dropoff itself.
export function normalizeOperationLocation(value: unknown): OperationLocation {
  if(value == null)return {status:'NOT_PROVIDED'};
  if(typeof value!=='object')return {status:'INVALID'};
  const v=value as Record<string,unknown>;
  if(v.status!=='CAPTURED'){
    return {status:typeof v.status==='string' && ['DENIED','UNAVAILABLE','TIMEOUT','UNSUPPORTED','NOT_PROVIDED'].includes(v.status) ? v.status as OperationLocation['status'] : 'INVALID'};
  }
  if(typeof v.latitude!=='number'||!Number.isFinite(v.latitude)||Math.abs(v.latitude)>90 ||
    typeof v.longitude!=='number'||!Number.isFinite(v.longitude)||Math.abs(v.longitude)>180 ||
    typeof v.accuracyMeters!=='number'||!Number.isFinite(v.accuracyMeters)||v.accuracyMeters<0 ||
    typeof v.capturedAt!=='string'||v.capturedAt.length>40||!Number.isFinite(Date.parse(v.capturedAt)))return {status:'INVALID'};
  return {status:'CAPTURED',latitude:v.latitude,longitude:v.longitude,accuracyMeters:v.accuracyMeters,capturedAt:new Date(v.capturedAt).toISOString()};
}
