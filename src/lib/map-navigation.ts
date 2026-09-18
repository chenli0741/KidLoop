export type MapProvider='apple'|'google';

export function mapNavigationUrl(provider:MapProvider,address:string){
  const destination=address.trim();
  if(!destination)throw new Error('Navigation address unavailable');
  if(provider==='apple')return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
