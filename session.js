// Supply this tab's key after a service-worker restart; never persist plaintext assets.
'use strict';
(()=>{
  const VERSION='22f4789f0cc2efc7',STORAGE='meh450-key:'+VERSION;
  sessionStorage.removeItem(STORAGE+':opening');
  const url=new URL(location.href);
  if(url.searchParams.has('__access')){url.searchParams.delete('__access');history.replaceState(history.state,'',url.href);}
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type==='key-request'&&event.data.version===VERSION){
      event.ports[0]?.postMessage({raw:sessionStorage.getItem(STORAGE)});
    }
  });
})();
