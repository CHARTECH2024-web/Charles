import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

// CSS imported as a side effect — do NOT add `?url` or `?inline`.
//
// Why: TanStack Start runs two Vite build environments (client + ssr) with
// independent module graphs. A `?url` import resolves the CSS URL twice and
// the two passes can produce different hashes; the SSR pass bakes its hash
// into the prerendered HTML, but only the client's asset actually exists in
// `dist/client/assets/`, so the stylesheet 404s and the page loads unstyled.
//
// A bare side-effect import sidesteps the issue: only the client environment
// emits the CSS asset, and TanStack Start's manifest collection injects the
// correct hashed `<link rel="stylesheet">` into the rendered head from the
// client manifest. The CSS stays a shared, cacheable asset (important if
// prerender is expanded to multiple static pages — `?inline` would duplicate
// the CSS into every HTML file).
import '../styles.css'
import '../lib/boot-recovery'
import { AppProviders } from '../components/app-providers'

/**
 * Runs before the app bundle. If the bundle never mounts (missing chunk, dead
 * service worker, broken update) the visitor sees a recovery card instead of a
 * white page, and one tap clears the cached files and reloads.
 */
const BOOT_WATCHDOG = `(function(){
  var GUARD='horizon.boot-guard';
  var SPLASH='horizon-boot-splash';
  var FALLBACK='horizon-boot-fallback';
  var COOLDOWN=60000;
  function readGuard(){
    try{return Number(sessionStorage.getItem(GUARD)||0)||0;}catch(e){return 0;}
  }
  function writeGuard(){
    try{sessionStorage.setItem(GUARD,String(Date.now()));}catch(e){}
  }
  function canRecover(){
    return Date.now()-readGuard()>COOLDOWN;
  }
  function clearCaches(){
    var jobs=[];
    try{
      if(navigator.serviceWorker){
        if(navigator.serviceWorker.controller){
          try{navigator.serviceWorker.controller.postMessage({type:'PURGE'});}catch(e){}
        }
        if(navigator.serviceWorker.getRegistrations){
          jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){
            return Promise.all(rs.map(function(r){return r.unregister();}));
          }));
        }
      }
    }catch(e){}
    try{
      if(window.caches&&caches.keys){
        jobs.push(caches.keys().then(function(keys){
          return Promise.all(keys.map(function(k){return caches.delete(k);}));
        }));
      }
    }catch(e){}
    return Promise.all(jobs).catch(function(){});
  }
  function fresh(){
    var u=new URL(location.href);
    u.searchParams.set('_v',String(Date.now()));
    location.replace(u.toString());
  }
  function removeSplash(){
    var el=document.getElementById(SPLASH);
    if(el&&el.parentNode)el.parentNode.removeChild(el);
  }
  function splash(){
    if(document.getElementById(SPLASH))return;
    var el=document.createElement('div');
    el.id=SPLASH;
    el.setAttribute('data-testid','boot-splash');
    el.style.cssText='position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0D0D0D;color:#F5F5F5;font-family:system-ui,-apple-system,sans-serif;';
    el.innerHTML='<div style="width:54px;height:54px;border-radius:16px;background:#FFD60A;color:#0D0D0D;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;letter-spacing:-.02em">H</div>'
      +'<p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.18em;color:#B9B9B9">CHARGEMENT</p>';
    var host=document.body||document.documentElement;
    host.appendChild(el);
  }
  function recover(){
    if(!canRecover()){removeSplash();show();return;}
    writeGuard();
    clearCaches().then(fresh,fresh);
  }
  function show(){
    removeSplash();
    if(document.getElementById(FALLBACK))return;
    var wrap=document.createElement('div');
    wrap.id=FALLBACK;
    wrap.setAttribute('data-testid','boot-fallback');
    wrap.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#0D0D0D;color:#F5F5F5;font-family:system-ui,-apple-system,sans-serif;padding:24px;';
    wrap.innerHTML='<div style="max-width:340px;width:100%;border:1px solid #333;border-radius:18px;padding:20px;background:#141414">'
      +'<p style="margin:0;font-size:18px;font-weight:800;letter-spacing:.04em">HORIZON</p>'
      +'<p style="margin:10px 0 0;font-size:14px;line-height:1.45;color:#B9B9B9">L\u2019application n\u2019a pas pu se charger. Appuyez pour recharger une version propre.</p>'
      +'<p style="margin:6px 0 0;font-size:12px;line-height:1.45;color:#8A8A8A">The app could not load. Tap to reload a clean version.</p>'
      +'<button id="horizon-boot-retry" type="button" style="margin-top:16px;width:100%;padding:12px;border-radius:999px;border:0;background:#FFD60A;color:#0D0D0D;font-size:14px;font-weight:800">Recharger / Reload</button>'
      +'</div>';
    var host=document.body||document.documentElement;
    host.appendChild(wrap);
    var btn=document.getElementById('horizon-boot-retry');
    if(btn){btn.onclick=function(){writeGuard();clearCaches().then(fresh,fresh);};}
  }
  function isReady(){
    return document.documentElement.dataset.appReady==='1';
  }
  function stylesOk(){
    var links=document.querySelectorAll('link[rel="stylesheet"]');
    if(!links.length)return true;
    for(var i=0;i<document.styleSheets.length;i++){
      var href=document.styleSheets[i].href||'';
      if(href.indexOf('/assets/')>-1)return true;
    }
    return false;
  }
  function checkBuild(){
    try{
      var tag=document.querySelector('script[type="module"][src*="/assets/"]');
      if(!tag)return;
      var current=tag.getAttribute('src');
      fetch(location.href,{cache:'no-store',credentials:'same-origin'}).then(function(r){
        return r.ok?r.text():'';
      }).then(function(html){
        if(!html)return;
        var m=html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/);
        if(m&&m[1]&&m[1]!==current){recover();return;}
        if(!stylesOk()){recover();}
      }).catch(function(){});
    }catch(e){}
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',splash);
  }else{
    splash();
  }
  // A stylesheet or script from a build that no longer exists.
  window.addEventListener('error',function(e){
    var t=e&&e.target;
    if(t&&t.tagName==='SCRIPT'&&t.src&&t.src.indexOf(location.origin)===0){recover();return;}
    if(t&&t.tagName==='LINK'&&t.href&&t.href.indexOf(location.origin)===0){recover();return;}
    var m=(e&&e.message?e.message:'');
    if(/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|is not a valid JavaScript MIME type/i.test(m)) recover();
  },true);
  window.addEventListener('unhandledrejection',function(e){
    var r=e&&e.reason;var m=(r&&r.message)?r.message:String(r||'');
    if(/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(m)) recover();
  });
  var ticks=0;
  var timer=setInterval(function(){
    if(isReady()){
      clearInterval(timer);
      removeSplash();
      return;
    }
    ticks++;
    if(ticks>=32){
      clearInterval(timer);
      show();
    }
  },250);
  window.addEventListener('pageshow',function(){
    if(isReady())removeSplash();
  });
  function afterLoad(){
    if(isReady()){removeSplash();}
    if(canRecover())checkBuild();
  }
  if(document.readyState==='complete')afterLoad();
  else window.addEventListener('load',afterLoad);
})();`

export const Route = createRootRoute({
  head: () => ({
    scripts: [{ children: BOOT_WATCHDOG }],
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { name: 'theme-color', content: '#0D0D0D' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'HORIZON' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: RootError,
})

/**
 * Never leave a phone on a blank screen: a failed render shows a readable
 * recovery card with a button that drops cached files and reloads.
 */
function RootError() {
  async function retry() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
    } catch {
      // Reload anyway.
    }
    window.location.replace(`/?_v=${Date.now()}`)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-card-foreground">
        <p className="text-lg font-extrabold">HORIZON</p>
        <p className="mt-2 text-sm text-muted-foreground">
          L’application n’a pas pu s’afficher. Appuyez sur le bouton pour recharger une
          version propre.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The app could not load. Tap the button to reload a clean version.
        </p>
        <button
          type="button"
          onClick={() => void retry()}
          data-testid="app-reload"
          className="mt-4 w-full rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          Recharger / Reload
        </button>
      </div>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
        <Scripts />
      </body>
    </html>
  )
}
