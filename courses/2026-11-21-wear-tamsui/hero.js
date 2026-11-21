// 共用首圖：生圖站首頁與上課簡報封面都從這一份產生（2026-11-19 江江：這一塊要固定，底下才是四個分頁）。
// 頁面上放 <header id="hero" class="hc"></header>，這支會把標誌、大標、小標籤、範例圖輪播、淡水河填進去。
// 要換文字或輪播的圖，只改這裡。
(function(){
  var PICS=[
    ['./ex-illust.jpg','旅學堂 Vicky 的把淡水穿在身上'],
    ['./past/g1-01-poster.jpg','學員作品：夕陽電影海報'],
    ['./styles/sheet.jpg','角色設計圖版的範例圖'],
    ['./styles/geoline.jpg','幾何線條版的範例圖'],
    ['./past/g5-03-poster.jpg','學員作品：立體卡通海報'],
    ['./styles/journal.jpg','心情手札版的範例圖'],
    ['./styles/geo.jpg','幾何色塊版的範例圖']
  ];
  var RIVER='<svg class="cover-river" viewBox="0 0 1200 118" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="hcr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f525b"/><stop offset="1" stop-color="#18333d"/></linearGradient></defs><path d="M0 46 Q120 26 240 38 Q330 6 400 36 Q440 24 478 36 Q520 0 550 12 Q590 -6 620 14 Q660 20 700 34 Q800 22 900 36 Q1040 20 1200 40 V70 H0Z" fill="#d88c3a" opacity=".38"/><path d="M0 56 Q160 40 300 50 Q400 36 510 46 Q560 22 600 40 Q700 52 860 44 Q1000 34 1200 52 V80 H0Z" fill="#93421f" opacity=".42"/><path class="wv wv1" d="M-400 60 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 q100 -9 200 0 q100 9 200 0 V130 H-400 Z" fill="#3d6a96" opacity=".55"/><path class="wv wv2" d="M-520 68 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 q130 -7 260 0 q130 7 260 0 V130 H-520 Z" fill="url(#hcr)"/><g class="wv wv3" fill="none" stroke="#fff" stroke-linecap="round" opacity=".3" stroke-width="2"><path d="M80 88 q10 -5 20 0 t20 0 t20 0"/><path d="M340 102 q10 -5 20 0 t20 0"/><path d="M620 86 q10 -5 20 0 t20 0 t20 0"/><path d="M900 100 q10 -5 20 0 t20 0"/><path d="M1080 88 q10 -5 20 0 t20 0"/><path d="M-320 88 q10 -5 20 0 t20 0 t20 0"/><path d="M-120 100 q10 -5 20 0 t20 0"/></g></svg>';
  var h=document.getElementById('hero');
  if(h&&!h.firstChild){
    var imgs=PICS.map(function(p,i){
      var c=i===0?'c-mid':i===PICS.length-1?'c-left':i===1?'c-right':'c-hide';
      return '<img class="'+c+'" src="'+p[0]+'" alt="'+p[1]+'">';}).join('');
    h.innerHTML='<div class="hc-in"><div class="hc-txt">'
      +'<img class="hc-logo" src="./logo.png" alt="旅學堂 Tamsui Traveler" width="132" height="77">'
      +'<p class="hc-cap">AI 生圖工作坊</p>'
      +'<h1>把<em>淡水</em><br>穿在身上</h1>'
      +'<p class="hc-lead">把你對淡水的感受，變成一張自己的圖。</p>'
      +'<div class="chips"><span>一支手機就可以</span><span>不用裝 App</span><span>不用先會 AI</span></div>'
      +'</div><div class="cover-art" id="cover-art">'+imgs+'</div></div>'+RIVER;
  }
  // 封面：五張範例圖自動輪播，保留左中右重疊。滑鼠停在上面會暫停，點旁邊那張就換到中間
  var ca=document.getElementById('cover-art');
  if(ca){
    var ims=[].slice.call(ca.querySelectorAll('img')),k=0,n=ims.length,hold=false;
    function lay(){ims.forEach(function(im,i){
      var d=((i-k)%n+n)%n;
      im.className=d===0?'c-mid':d===n-1?'c-left':d===1?'c-right':'c-hide';});}
    ims.forEach(function(im,i){im.addEventListener('click',function(){k=i;lay();});});
    ca.addEventListener('mouseenter',function(){hold=true;});
    ca.addEventListener('mouseleave',function(){hold=false;});
    if(!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)){
      setInterval(function(){if(!hold&&!document.hidden){k=(k+1)%n;lay();}},3200);
    }
  }

})();
