// Supply this tab's key after a service-worker restart; never persist plaintext assets.
'use strict';
(()=>{
  const VERSION='7d50e5d28cbe77f7',STORAGE='meh450-key:'+VERSION;
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type==='key-request'&&event.data.version===VERSION){
      event.ports[0]?.postMessage({raw:sessionStorage.getItem(STORAGE)});
    }
  });
})();
