// LINE Flex 名片繪製（名片頁 /card/ 與口袋頁 /line 共用）
var FS={xxs:11,xs:13,sm:14,md:16,lg:19,xl:22,xxl:29,'3xl':35,'4xl':48,'5xl':74};
var SP={none:0,xs:2,sm:4,md:8,lg:12,xl:16,xxl:20};
function px(v,map){if(v==null)return null;if(map&&map[v]!=null)return map[v]+'px';return v;}
function el(n){
  var t=n.type,d;
  if(t==='box'){
    d=document.createElement(n.action?'a':'div');
    if(n.action){d.href=n.action.uri;d.style.textDecoration='none';d.style.color='inherit';}
    d.style.display='flex';d.style.flexDirection=n.layout==='horizontal'||n.layout==='baseline'?'row':'column';
    if(n.layout==='baseline')d.style.alignItems='baseline';
    if(n.alignItems)d.style.alignItems=n.alignItems==='center'?'center':n.alignItems==='flex-end'?'flex-end':'flex-start';
    if(n.backgroundColor)d.style.background=n.backgroundColor;
    if(n.cornerRadius)d.style.borderRadius=n.cornerRadius;
    ['paddingAll','paddingTop','paddingBottom','paddingStart','paddingEnd'].forEach(function(k){if(n[k]){var v=px(n[k],SP);if(k==='paddingAll')d.style.padding=v;else d.style[{paddingTop:'paddingTop',paddingBottom:'paddingBottom',paddingStart:'paddingLeft',paddingEnd:'paddingRight'}[k]]=v;}});
    var gap=n.spacing?px(n.spacing,SP):'0px';
    (n.contents||[]).forEach(function(c,i){var ch=el(c);var m=c.margin!=null?px(c.margin,SP):(i?gap:null);if(i&&m){if(d.style.flexDirection==='row')ch.style.marginLeft=m;else ch.style.marginTop=m;}d.appendChild(ch);});
  }else if(t==='text'){
    d=document.createElement('div');d.textContent=n.text;d.style.whiteSpace='pre-line';
    d.style.fontSize=px(n.size||'md',FS);if(n.color)d.style.color=n.color;if(n.weight==='bold')d.style.fontWeight='700';
    if(n.align)d.style.textAlign=n.align==='start'?'left':n.align==='end'?'right':n.align;
  }else if(t==='image'){
    d=document.createElement('img');d.src=n.url;d.alt='';d.loading='lazy';
    var r=(n.aspectRatio||'1:1').split(':');d.style.aspectRatio=r[0]+'/'+r[1];
    d.style.objectFit=n.aspectMode==='cover'?'cover':'contain';
    d.style.width=(!n.size||n.size==='full')?'100%':px(n.size,{xxs:40,xs:60,sm:80,md:100,lg:120,xl:140,xxl:160,'3xl':180,'4xl':200,'5xl':220});
    d.style.maxWidth='100%';d.style.display='block';
    if(n.gravity==='bottom')d.style.alignSelf='flex-end';
    if(n.align==='center'||(!n.align&&n.size&&n.size!=='full'))d.style.margin='0 auto';
  }else if(t==='button'){
    d=document.createElement('a');d.className='fx-link';d.href=n.action.uri;d.textContent=n.action.label;
  }else{d=document.createElement('div');}
  if(n.flex!=null)d.style.flex=n.flex===0?'0 0 auto':String(n.flex);
  if(n.position==='relative'){d.style.position='relative';if(n.offsetStart)d.style.left=n.offsetStart;if(n.offsetTop)d.style.top=n.offsetTop;}
  return d;
}

// 把 line-flex.json 的每張名片畫成 <article class="bubble">，回傳陣列
function renderFlexCards(json){
  var car=json.contents.type==='carousel'?json.contents.contents:[json.contents];
  return car.map(function(b){var w=document.createElement('article');w.className='bubble';
    var body=el(b.body);body.classList.add('body');w.appendChild(body);if(b.footer)w.appendChild(el(b.footer));return w;});
}
