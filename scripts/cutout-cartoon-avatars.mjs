import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// User-authorized chroma key cleanup of AI-generated images, never source photos.
const directory=process.argv[2];
if(!directory)throw new Error('Usage: node scripts/cutout-cartoon-avatars.mjs <private batch directory>');
const files=(await fs.readdir(directory)).filter(f=>/^\d+-green\.png$/.test(f)).sort();
for(const file of files){
 const {data,info}=await sharp(path.join(directory,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=4){
  const r=data[i],g=data[i+1],b=data[i+2],excess=g-Math.max(r,b);
  if(excess>15){
   const key=Math.min(1,Math.max(0,(excess-15)/65));
   data[i+3]=Math.round(data[i+3]*(1-key));
   data[i+1]=Math.min(g,Math.max(r,b));
  }
 }
 const output=path.join(directory,file.replace('-green','-avatar'));
 const head=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).trim({background:'#00000000',threshold:10})
  .resize(448,448,{fit:'contain',background:'#00000000'}).png().toBuffer();
 await sharp(head).extend({top:32,bottom:32,left:32,right:32,background:'#00000000'}).png().toFile(output);
 const m=await sharp(output).metadata(),stats=await sharp(output).stats();
 if(m.width!==512||m.height!==512||!m.hasAlpha||stats.channels[3].min!==0||stats.channels[3].max!==255)throw new Error(`Invalid alpha or dimensions: ${file}`);
}
console.log(`Validated ${files.length} transparent avatars`);
