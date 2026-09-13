const {isIP}=require('node:net');
function clientNetwork(ip) {
  const family=isIP(ip);
  if(family===4)return ip;
  if(family!==6)return null;
  const normalized=new URL('http://['+ip+']/').hostname.slice(1,-1);
  const halves=normalized.split('::');
  const left=halves[0]?halves[0].split(':'):[];
  const right=halves.length===2 && halves[1]?halves[1].split(':'):[];
  const words=(halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left).map(x=>parseInt(x,16));
  if(words.length!==8)return null;
  if(words.slice(0,5).every(x=>x===0)&&words[5]===65535)
    return [words[6]>>8,words[6]&255,words[7]>>8,words[7]&255].join('.');
  return words.slice(0,4).map(x=>x.toString(16)).join(':')+'::/64';
}
module.exports={clientNetwork};
