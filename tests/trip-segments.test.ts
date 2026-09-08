import {test} from "node:test";
import assert from "node:assert/strict";
import {nearestTripSegment,tripSegments} from "../src/lib/trip-segments";
import type {Trip} from "../src/lib/types";

test("pairs pickup and dropoff stops and keeps assignment IDs and route order",()=>{
  const trip={id:"trip",routeStops:[
    {id:"a",name:"School A",time:"14:00"},{id:"b",name:"Program A",time:"14:25"},
    {id:"c",name:"School B",time:"14:55"},{id:"d",name:"Program B",time:"15:25"},
  ],riders:[
    {id:"r2",pickupStopId:"c",dropoffStopId:"d",status:"SCHEDULED"},
    {id:"r1",pickupStopId:"a",dropoffStopId:"b",status:"PICKED_UP"},
  ]} as Trip;
  const groups=tripSegments(trip);
  assert.deepEqual(groups.map(g=>g.routeName),["School A → Program A","School B → Program B"]);
  assert.deepEqual(groups.map(g=>g.riders.map(r=>r.id)),[["r1"],["r2"]]);
  assert.deepEqual(groups.map(g=>g.departureTime),["14:00","14:55"]);
  assert.equal(groups[0].riders[0],trip.riders[1]);
  assert.equal(trip.riders.length,2);
  assert.deepEqual(tripSegments({...trip,riders:[{...trip.riders[0],pickupStopId:null}]}).length,1);
  assert.equal(tripSegments({...trip,routeStops:null})[0].id,"trip");
});

test("defaults to the nearest pickup in Los Angeles time across service dates",()=>{
  const segments=[{scheduledDate:"2026-09-08",departureTime:"14:00"},{scheduledDate:"2026-09-08",departureTime:"14:55"}] as Trip[];
  assert.equal(nearestTripSegment(segments,new Date("2026-09-08T20:00:00Z")),0);
  assert.equal(nearestTripSegment(segments,new Date("2026-09-08T21:40:00Z")),1);
  assert.equal(nearestTripSegment(segments,new Date("2026-09-08T05:00:00Z")),0);
  assert.equal(nearestTripSegment(segments,new Date("2026-09-09T05:00:00Z")),1);
});
