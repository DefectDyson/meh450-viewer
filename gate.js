'use strict';
(async()=>{
  const BASE='/meh450-viewer/', VERSION='b03c8395f0b6bb8c', STORAGE='meh450-key:'+VERSION, ATTEMPTS=STORAGE+':opening';
  const form=document.querySelector('#gate'),status=document.querySelector('#status'),button=form.querySelector('button');
  const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const encode=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
  let config,registration;
  navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='key-request'&&event.data.version===VERSION)
      event.ports[0]?.postMessage({raw:sessionStorage.getItem(STORAGE)});
  });
  function waitFor(check){return new Promise((resolve,reject)=>{
    const start=Date.now(),timer=setInterval(()=>{
      if(check()){clearInterval(timer);resolve();}
      else if(Date.now()-start>15000){clearInterval(timer);reject(Error('Der Zugang konnte nicht gestartet werden. Bitte erneut versuchen.'));}
    },50);
  });}
  function workerMessage(worker,message){return new Promise((resolve,reject)=>{
    const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Zeitüberschreitung beim Öffnen. Bitte erneut versuchen.')),20000);
    channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data.ok&&e.data.navigationReady?resolve():reject(Error('Der Zugang wurde aktualisiert. Bitte die Seite erneut laden.'));};
    worker.postMessage(message,[channel.port2]);
  });}
  async function open(raw){
    const key=await crypto.subtle.importKey('raw',decode(raw),'AES-GCM',false,['decrypt']);
    try{await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(config.check.iv),additionalData:new TextEncoder().encode('verify:'+VERSION)},key,decode(config.check.data));}
    catch{throw Error('Das Passwort stimmt nicht.');}
    sessionStorage.setItem(STORAGE,raw);
    const here=decodeURIComponent(location.pathname.slice(BASE.length));
    const target=new URL(config.files[here]?location.href:BASE+config.entry,location.origin);
    target.searchParams.delete('__access');
    const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
    await workerMessage(registration.active,{type:'unlock',version:VERSION,raw,navigation:{token,route:decodeURIComponent(target.pathname.slice(BASE.length))}});
    await waitFor(()=>navigator.serviceWorker.controller?.scriptURL===registration.active?.scriptURL);
    const attempts=Number(sessionStorage.getItem(ATTEMPTS)||0);
    if(attempts>=2)throw Error('Die Seite konnte nicht geöffnet werden. Bitte erneut anmelden oder in Safari beziehungsweise Chrome öffnen.');
    sessionStorage.setItem(ATTEMPTS,String(attempts+1));
    target.searchParams.set('__access',token);
    location.replace(target.href);
  }
  try{
    if(!crypto.subtle||!navigator.serviceWorker||!window.DecompressionStream)throw Error('Bitte einen aktuellen Browser mit HTTPS verwenden.');
    config=await(await fetch(BASE+'manifest.json',{cache:'no-store'})).json();
    if(config.version!==VERSION)throw Error('Die Seite wurde aktualisiert. Bitte neu laden.');
    registration=await navigator.serviceWorker.register(BASE+'sw.js?access=2',{scope:BASE,updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    await waitFor(()=>registration.active&&!registration.installing&&!registration.waiting);
    const existing=sessionStorage.getItem(STORAGE);
    status.textContent='';
    if(existing){status.textContent='Seite wird geöffnet …';try{await open(existing);return;}catch(error){sessionStorage.removeItem(STORAGE);status.textContent=error.message;}}
    form.hidden=false;
    form.addEventListener('submit',async event=>{
      event.preventDefault();button.disabled=true;status.textContent='Seite wird entschlüsselt …';
      sessionStorage.removeItem(ATTEMPTS);
      try{
        const password=document.querySelector('#password').value;
        const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
        const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:decode(config.salt),iterations:config.iterations,hash:'SHA-256'},material,256);
        await open(encode(bits));
      }catch(error){status.textContent=error.message;button.disabled=false;document.querySelector('#password').focus();}
    });
  }catch(error){status.textContent=error.message;}
})();
