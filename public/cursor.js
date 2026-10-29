/* Projection Studios custom glowing cursor. Its color follows the active look/theme accent. */
(()=>{
  const finePointer=window.matchMedia&&window.matchMedia('(hover: hover) and (pointer: fine)');
  if(!finePointer||!finePointer.matches||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const style=document.createElement('style');
  style.textContent=`
    @media (hover:hover) and (pointer:fine) {
      html.sh-glow-cursor, html.sh-glow-cursor body { cursor:none!important; }
      html.sh-glow-cursor a,html.sh-glow-cursor button,html.sh-glow-cursor input,html.sh-glow-cursor textarea,html.sh-glow-cursor select,html.sh-glow-cursor [role="button"],html.sh-glow-cursor label { cursor:none!important; }
      #shGlowCursor{position:fixed;left:0;top:0;width:24px;height:24px;border:1.5px solid var(--sh-accent,#6d5efc);border-radius:50%;pointer-events:none;z-index:99999;opacity:0;transform:translate3d(-100px,-100px,0) translate(-50%,-50%);box-shadow:0 0 9px color-mix(in srgb,var(--sh-accent,#6d5efc) 60%,transparent),inset 0 0 8px color-mix(in srgb,var(--sh-accent,#6d5efc) 20%,transparent);transition:width .16s ease,height .16s ease,opacity .16s ease,border-color .2s ease,box-shadow .2s ease;mix-blend-mode:screen}
      #shGlowCursor:after{content:"";position:absolute;left:50%;top:50%;width:5px;height:5px;border-radius:50%;background:var(--sh-accent,#6d5efc);box-shadow:0 0 10px 3px color-mix(in srgb,var(--sh-accent,#6d5efc) 70%,transparent);transform:translate(-50%,-50%)}
      #shGlowCursor.sh-hover{width:38px;height:38px;background:color-mix(in srgb,var(--sh-accent,#6d5efc) 10%,transparent);box-shadow:0 0 16px color-mix(in srgb,var(--sh-accent,#6d5efc) 75%,transparent),0 0 32px color-mix(in srgb,var(--sh-accent,#6d5efc) 35%,transparent)}
      #shGlowCursor.sh-down{width:17px;height:17px}
    }
  `;
  document.head.append(style);
  const cursor=document.createElement('div');cursor.id='shGlowCursor';cursor.setAttribute('aria-hidden','true');document.body.append(cursor);document.documentElement.classList.add('sh-glow-cursor');
  let visible=false;
  document.addEventListener('pointermove',e=>{cursor.style.transform=`translate3d(${e.clientX}px,${e.clientY}px,0) translate(-50%,-50%)`;if(!visible){cursor.style.opacity='1';visible=true;}}, {passive:true});
  document.addEventListener('pointerover',e=>{if(e.target&&e.target.closest&&e.target.closest('a,button,input,textarea,select,[role="button"],label,.card,.sh-card,.sh-pt'))cursor.classList.add('sh-hover');else cursor.classList.remove('sh-hover')},{passive:true});
  document.addEventListener('pointerdown',()=>cursor.classList.add('sh-down'),{passive:true});
  document.addEventListener('pointerup',()=>cursor.classList.remove('sh-down'),{passive:true});
  document.addEventListener('pointerleave',()=>{cursor.style.opacity='0';visible=false});
  document.addEventListener('pointerenter',()=>{if(visible)cursor.style.opacity='1'});
})();
