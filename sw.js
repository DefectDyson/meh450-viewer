'use strict';
const VERSION='0b97908bcf95409e',BASE='/meh450-viewer/',CACHE='meh450-encrypted:'+VERSION;
const keys=new Map();
// Navigation requests do not consistently expose the previous document's ID
// (notably in WebKit). A one-use, short-lived ticket transfers only this tab's
// verified key to the requested document, without putting that key in the URL.
const navigations=new Map();
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const configPromise=fetch(BASE+'manifest.json',{cache:'no-store'}).then(r=>r.json()).then(c=>{
  if(c.version!==VERSION)throw Error('Release mismatch');return c;
});
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const n of await caches.keys())if(n.startsWith('meh450-encrypted:')&&n!==CACHE)await caches.delete(n);
  await self.clients.claim();
})()));
async function acceptKey(id,raw){
  if(!raw)return null;
  const c=await configPromise;
  const key=await crypto.subtle.importKey('raw',decode(raw),'AES-GCM',false,['decrypt']);
  await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(c.check.iv),additionalData:new TextEncoder().encode('verify:'+VERSION)},key,decode(c.check.data));
  keys.set(id,key);return key;
}
self.addEventListener('message',event=>{
  if(event.data?.type==='unlock'&&event.data.version===VERSION&&event.source?.id){
    event.waitUntil(acceptKey(event.source.id,event.data.raw).then(async key=>{
      const nav=event.data.navigation,c=await configPromise;
      if(!key)throw Error('Missing key');
      if(nav){
        if(!/^[a-f0-9]{48}$/.test(nav.token)||!c.files[nav.route]?.type.startsWith('text/html'))throw Error('Invalid navigation');
        for(const [token,value] of navigations)if(value.expires<Date.now()||value.clientId===event.source.id)navigations.delete(token);
        navigations.set(nav.token,{key,route:nav.route,clientId:event.source.id,expires:Date.now()+60000});
      }
      // A hard refresh can intentionally bypass the worker for the login
      // document. Reclaim that document before navigating to protected content.
      await self.clients.claim();event.ports[0]?.postMessage({ok:true,navigationReady:Boolean(nav)});
    }).catch(()=>event.ports[0]?.postMessage({ok:false})));
  }
});
async function keyFor(clientId){
  if(keys.has(clientId))return keys.get(clientId);
  const client=clientId&&await self.clients.get(clientId);
  if(!client)return null;
  const raw=await new Promise(resolve=>{
    const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(null);},1500);
    channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.raw);};
    client.postMessage({type:'key-request',version:VERSION},[channel.port2]);
  });
  return acceptKey(clientId,raw).catch(()=>null);
}
async function encryptedChunk(name){
  const cache=await caches.open(CACHE),url=new URL(BASE+name,self.location.origin).href;
  let response=await cache.match(url);
  if(!response){response=await fetch(url);if(!response.ok)throw Error('Asset unavailable');await cache.put(url,response.clone());}
  return new Uint8Array(await response.arrayBuffer());
}
function bodyFor(route,rec,key){
  let index=0;
  return new ReadableStream({async pull(controller){
    try{
      if(index===rec.chunks.length){controller.close();return;}
      const part=index++,bytes=await encryptedChunk(rec.chunks[part]);
      const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:new TextEncoder().encode(route+':'+part)},key,bytes.slice(12));
      controller.enqueue(new Uint8Array(data));
    }catch(error){controller.error(error);}
  }}).pipeThrough(new DecompressionStream('gzip'));
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
  const route=decodeURIComponent(url.pathname.slice(BASE.length));
  // Do not reuse an older tab bootstrap after updating the access mechanism.
  if(route==='session.js'){event.respondWith(fetch(event.request,{cache:'no-store'}));return;}
  if(!route.startsWith('site/'))return;
  event.respondWith((async()=>{
    const c=await configPromise,rec=c.files[route];
    if(!rec)return new Response('Nicht gefunden',{status:404});
    let key;
    if(event.request.mode==='navigate'){
      const token=url.searchParams.get('__access'),nav=navigations.get(token);
      if(nav&&nav.route===route){
        navigations.delete(token);
        if(nav.expires>=Date.now())key=nav.key;
      }
    }
    if(!key)key=await keyFor(event.clientId||event.replacesClientId);
    if(!key){
      if(event.request.mode==='navigate')return fetch(BASE+'index.html',{cache:'no-store'});
      return new Response('Zugang gesperrt',{status:401});
    }
    if(event.resultingClientId)keys.set(event.resultingClientId,key);
    const headers={'Content-Type':rec.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    if(rec.download)headers['Content-Disposition']='attachment; filename="'+rec.download+'"';
    return new Response(bodyFor(route,rec,key),{headers});
  })().catch(()=>new Response('Die Datei konnte nicht geöffnet werden. Bitte die Seite neu laden.',{status:503})));
});
