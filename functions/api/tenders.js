const SOURCES=[
 {name:'Find a Tender',base:'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages',host:'www.find-tender.service.gov.uk',date:'updated'},
 {name:'Contracts Finder',base:'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search',host:'www.contractsfinder.service.gov.uk',date:'published'}
];
async function collect(source,from,to){
 const dates=source.date==='updated'?{updatedFrom:from,updatedTo:to}:{publishedFrom:from,publishedTo:to};
 let url=source.base+'?'+new URLSearchParams({...dates,stages:'tender',limit:'100'});
 const seen=new Set(),latest=new Map();let pages=0;
 for(;url&&pages<4;pages++){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!==source.host||u.pathname!==new URL(source.base).pathname||seen.has(u.href))throw Error('Unsafe pagination');
  seen.add(u.href);
  const response=await fetch(u.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const body=await response.text();if(body.length>8000000)throw Error('Response too large');
  const data=JSON.parse(body);if(!Array.isArray(data.releases))throw Error('Unexpected response');
  for(const release of data.releases){
   const key=String(release.ocid||release.id||'');if(!key)continue;
   const prior=latest.get(key);
   if(!prior||String(release.date||'')>String(prior.date||''))latest.set(key,{...release,_source:source.name});
  }
  url=data.links?.next?new URL(data.links.next,source.base).href:null;
 }
 return {name:source.name,releases:[...latest.values()],pages,partial:Boolean(url)};
}
export async function onRequestGet(){
 const now=new Date(),from=new Date(now.getTime()-30*86400000);
 const date=d=>d.toISOString().slice(0,19);
 const results=await Promise.allSettled(SOURCES.map(s=>collect(s,date(from),date(now))));
 const successful=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
 if(!successful.length)return Response.json({error:'Both official data sources are temporarily unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});
 return Response.json({
  releases:successful.flatMap(r=>r.releases),sources:successful.map(r=>({name:r.name,count:r.releases.length,pages:r.pages,partial:r.partial})),
  partial:successful.some(r=>r.partial)||successful.length<SOURCES.length,
  source_errors:results.flatMap((r,i)=>r.status==='rejected'?[{source:SOURCES[i].name,error:String(r.reason?.message||'Unavailable')}]:[]),
  retrieved_at:now.toISOString(),lookback_days:30
 },{headers:{'Cache-Control':'public, max-age=900'}});
}
