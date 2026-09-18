import type {TripStatus} from './types';

export function driverRideOrder(status:TripStatus){
  if(status==='IN_PROGRESS')return 0;
  if(status==='PUBLISHED'||status==='NEEDS_ATTENTION')return 1;
  if(status==='COMPLETED')return 2;
  return 3;
}
