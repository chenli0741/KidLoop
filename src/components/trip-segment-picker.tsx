"use client";

import {useId,useState,type ReactNode} from "react";

export function TripSegmentPicker({options,defaultIndex,label,children}:{
  options:{id:string;label:string}[];defaultIndex:number;label:string;children:ReactNode[];
}) {
  const id=useId();
  const [selected,setSelected]=useState<string|null>(null);
  const selectedIndex=options.findIndex(option=>option.id===selected);
  const index=selectedIndex>=0?selectedIndex:defaultIndex;
  return <>
    {options.length>1 && <label className="trip-segment-picker" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={options[index].id} onChange={event=>setSelected(event.target.value)} aria-controls={`${id}-content`}>
        {options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>}
    <div id={`${id}-content`} key={options[index].id}>{children[index]}</div>
  </>;
}
