'use strict';
(async()=>{
  const BASE='/meh450-viewer/', VERSION='7d50e5d28cbe77f7', STORAGE='meh450-key:'+VERSION;
  const form=document.querySelector('#gate'),status=document.querySelector('#status'),button=form.querySelector('button');
  const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const encode=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
  let config,registration;
  function workerMessage(worker,message){return new Promise((resolve,reject)=>{
    const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Zeitüberschreitung beim Öffnen. Bitte erneut versuchen.')),20000);
    channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data.ok?resolve():reject(Error('Der Zugang konnte nicht geöffnet werden.'));};
    worker.postMessage(message,[channel.port2]);
  });}
  async function open(raw){
    const key=await crypto.subtle.importKey('raw',decode(raw),'AES-GCM',false,['decrypt']);
    try{await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(config.check.iv),additionalData:new TextEncoder().encode('verify:'+VERSION)},key,decode(config.check.data));}
    catch{throw Error('Das Passwort stimmt nicht.');}
    sessionStorage.setItem(STORAGE,raw);
    await workerMessage(registration.active,{type:'unlock',version:VERSION,raw});
    if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Bitte die Seite erneut laden.')),10000);
      navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});
    });
    const here=decodeURIComponent(location.pathname.slice(BASE.length));
    const target=config.files[here]?location.pathname+location.search+location.hash:BASE+config.entry;
    location.replace(target);
  }
  try{
    if(!crypto.subtle||!navigator.serviceWorker||!window.DecompressionStream)throw Error('Bitte einen aktuellen Browser mit HTTPS verwenden.');
    config=await(await fetch(BASE+'manifest.json',{cache:'no-store'})).json();
    if(config.version!==VERSION)throw Error('Die Seite wurde aktualisiert. Bitte neu laden.');
    registration=await navigator.serviceWorker.register(BASE+'sw.js',{scope:BASE,updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    if(!registration.active)registration=await navigator.serviceWorker.ready;
    const existing=sessionStorage.getItem(STORAGE);
    if(existing){status.textContent='Seite wird geöffnet …';try{await open(existing);return;}catch{sessionStorage.removeItem(STORAGE);}}
    status.textContent='';form.hidden=false;
    form.addEventListener('submit',async event=>{
      event.preventDefault();button.disabled=true;status.textContent='Seite wird entschlüsselt …';
      try{
        const password=document.querySelector('#password').value;
        const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
        const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:decode(config.salt),iterations:config.iterations,hash:'SHA-256'},material,256);
        await open(encode(bits));
      }catch(error){status.textContent=error.message;button.disabled=false;document.querySelector('#password').focus();}
    });
  }catch(error){status.textContent=error.message;}
})();
