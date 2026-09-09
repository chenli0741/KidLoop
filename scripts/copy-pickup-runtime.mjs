import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('public/onnx',{recursive:true});
for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await copyFile('node_modules/onnxruntime-web/dist/'+name,'public/onnx/'+name);
