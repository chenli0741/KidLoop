// Adapted from RedHotWeb's shared uploader: native picker and bounded JPEG compression.
export const MAX_PHOTO_BYTES = 1024 * 1024;
export function pickerCanceled(error: unknown) {
  const message=error instanceof Error ? error.message : typeof error==='object' && error!==null && 'message' in error ? String(error.message) : String(error);
  return /cancel|取消|no image picked/i.test(message);
}
export async function compressPhoto(file:File):Promise<Blob> {
  if(file.size>15*1024*1024)throw new Error('size');
  const url=URL.createObjectURL(file);
  try {
    const image=new window.Image();image.src=url;
    try{await image.decode();}catch{throw new Error('format');}
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    let width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale)),quality=0.82;
    for(let attempt=0;attempt<8;attempt++) {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('format');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      canvas.width=canvas.height=1;
      if(blob && blob.size<=MAX_PHOTO_BYTES)return blob;
      width=Math.max(1,Math.round(width*0.82));height=Math.max(1,Math.round(height*0.82));quality=Math.max(0.55,quality-0.08);
    }
    throw new Error('size');
  } finally {URL.revokeObjectURL(url);}
}
export async function pickNativePhoto(source:'photos'|'camera'):Promise<File|null> {
  const {Capacitor}=await import('@capacitor/core');
  if(!Capacitor.isNativePlatform())return null;
  if(!Capacitor.isPluginAvailable('Camera'))throw new Error('native-gallery-unavailable');
  const {Camera,CameraSource,CameraResultType}=await import('@capacitor/camera');
  const photo=await Camera.getPhoto({source:source==='camera'?CameraSource.Camera:CameraSource.Photos,resultType:CameraResultType.Base64,quality:82,width:1600,height:1600,allowEditing:false,correctOrientation:true,saveToGallery:false});
  return nativePhotoFile(photo);
}

// The native plugin returns processed JPEG bytes. Avoid fetching temporary file URLs
// from the remotely hosted WKWebView (cross-origin/custom-scheme restrictions).
export function nativePhotoFile(photo:{base64String?:string}):File {
  const encoded=photo.base64String;
  if(!encoded)throw new Error('format');
  if(encoded.length>20*1024*1024)throw new Error('size');
  let decoded:string;try{decoded=atob(encoded);}catch{throw new Error('format');}
  if(!decoded.length)throw new Error('format');
  return new File([Uint8Array.from(decoded,c=>c.charCodeAt(0))],'student-photo.jpg',{type:'image/jpeg'});
}
