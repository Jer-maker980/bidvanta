const API='https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';
export async function onRequestGet(){
 const now=new Date(),from=new Date(now.getTime()-30*86400000);
 let url=API+'?'+new URLSearchParams({updatedFrom:from.toISOString().slice(0,19),updatedTo:now.toISOString().slice(0,19),stages:'tender',limit:'100'});
 const seenPages=new Set(),latest=new Map();let partial=false,pages=0;
 try{
  for(;pages<8&&url;pages++){
   const u=new URL(url);
   if(u.protocol!=='https:'||u.hostname!=='www.find-tender.service.gov.uk'||u.pathname!=='/api/1.0/ocdsReleasePackages'||seenPages.has(u.href))throw Error('Invalid pagination');
   seenPages.add(u.href);
   const response=await fetch(u.href,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Government API HTTP '+response.status);
   const body=await response.text();if(body.length>6000000)throw Error('Response too large');
   const data=JSON.parse(body);if(!Array.isArray(data.releases))throw Error('Unexpected response');
   for(const release of data.releases){
    const key=String(release.ocid||release.id||'');
    if(!key)continue;
    const prior=latest.get(key);
    if(!prior||String(release.date||'')>String(prior.date||''))latest.set(key,release);
   }
   url=data.links?.next?new URL(data.links.next,API).href:null;
  }
  partial=Boolean(url);
  return Response.json({releases:[...latest.values()],partial,pages,retrieved_at:now.toISOString(),lookback_days:30},{headers:{'Cache-Control':'public, max-age=900'}});
 }catch(e){return Response.json({error:'Government data unavailable: '+e.message},{status:502,headers:{'Cache-Control':'no-store'}})}
}