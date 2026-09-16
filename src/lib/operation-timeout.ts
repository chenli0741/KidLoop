// Bounds UI waiting only; never retries or claims to cancel a server mutation.
export async function withOperationTimeout<T>(operation:Promise<T>,milliseconds=20000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Operation result not confirmed')),milliseconds);})]);}
 finally{clearTimeout(timer);}
}
