/** Keep the travel order while shortening labels for small screens. */
export function routeName(stops: {name:string}[]) {
 const names=stops.map(s=>s.name.trim().replace(/\s+/g," ")).filter(Boolean).map(name=>{
  const short=name.replace(/\s+(?:(?:Elementary|Middle|High)\s+)?School$/i,"").trim() || name;
  return Array.from(short).length>24 ? Array.from(short).slice(0,23).join("")+"…" : short;
 });
 return (names.length>3 ? [names[0],"…",names[names.length-1]] : names).join(" → ");
}
