import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
const idPattern=/^[a-f0-9]{32}$/;
const hash=(value,salt)=>scryptSync(value,salt,32).toString('hex');
export const profileCookie=id=>`fs_profile_${id}`;
export const profileSubject=p=>`profile:${p.id}:${p.version}`;
export async function profileForGallery(store,galleryId){
  const link=await store.get(`profile-link/${galleryId}`,{type:'json'});
  if(!link)return null;
  const profile=await store.get(`profile/${link.profileId}`,{type:'json'});
  return profile?{...profile,category:link.category}:null;
}
export async function profileAction({action,request,url,store,owner,body,check,json,session,authenticated,secret,headers}){
  if(!action?.startsWith('profile-'))return null;
  const publicProfile=p=>({id:p.id,name:p.name,listed:p.listed,created:p.created});
  async function profiles(){const{blobs}=await store.list({prefix:'profile/'});return (await Promise.all(blobs.map(({key})=>store.get(key,{type:'json'})))).filter(Boolean);}
  if(action==='profile-list' && request.method==='GET')return json((await profiles()).filter(p=>owner||p.listed).map(publicProfile).sort((a,b)=>a.name.localeCompare(b.name)));
  if(action==='profile-create' && request.method==='POST'){
    check(owner,'Owner access required.',403);const data=await body(request);
    check(typeof data.name==='string' && data.name.trim().length>0 && data.name.length<=100,'Enter a profile name.');
    check(typeof data.passcode==='string' && data.passcode.length>=6 && data.passcode.length<=128,'Use a passcode of 6–128 characters.');
    check(!(await profiles()).some(p=>p.name.toLowerCase()===data.name.trim().toLowerCase()),'A profile with this name already exists.',409);
    const id=randomBytes(16).toString('hex'),salt=randomBytes(16).toString('hex');
    const profile={id,name:data.name.trim(),salt,hash:hash(data.passcode,salt),version:randomBytes(16).toString('hex'),listed:data.listed!==false,created:new Date().toISOString()};
    await store.setJSON(`profile/${id}`,profile,{onlyIfNew:true});return json(publicProfile(profile));
  }
  const id=url.searchParams.get('profile');check(idPattern.test(id||''),'Profile not found.',404);
  const profile=await store.get(`profile/${id}`,{type:'json'});check(profile,'Profile not found.',404);
  if(action==='profile-unlock' && request.method==='POST'){
    const data=await body(request);check(typeof data.passcode==='string'&&data.passcode.length<=128,'Incorrect passcode.',401);
    const given=Buffer.from(hash(data.passcode,profile.salt),'hex'),expected=Buffer.from(profile.hash,'hex');
    check(given.length===expected.length&&timingSafeEqual(given,expected),'Incorrect passcode.',401);
    return new Response('{}',{headers:session(profileCookie(id),profileSubject(profile),secret)});
  }
  if(action==='profile-lock' && request.method==='POST')return new Response('{}',{headers:{...headers,'Set-Cookie':`${profileCookie(id)}=; Path=/.netlify/functions/photo-review; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}});
  if(action==='profile-update' && request.method==='POST'){
    check(owner,'Owner access required.',403);const data=await body(request);
    check(typeof data.name==='string'&&data.name.trim().length>0&&data.name.length<=100,'Enter a profile name.');
    check(!(await profiles()).some(p=>p.id!==id&&p.name.toLowerCase()===data.name.trim().toLowerCase()),'A profile with this name already exists.',409);
    let updated={...profile,name:data.name.trim(),listed:Boolean(data.listed)};
    if(data.passcode){check(typeof data.passcode==='string'&&data.passcode.length>=6&&data.passcode.length<=128,'Use a passcode of 6–128 characters.');const salt=randomBytes(16).toString('hex');updated={...updated,salt,hash:hash(data.passcode,salt),version:randomBytes(16).toString('hex')};}
    await store.setJSON(`profile/${id}`,updated);return json(publicProfile(updated));
  }
  if(action==='profile-assign' && request.method==='POST'){
    check(owner,'Owner access required.',403);const data=await body(request);
    check(idPattern.test(data.gallery||''),'Choose a project.');check(await store.get(`gallery/${data.gallery}`,{type:'json'}),'Project not found.',404);
    check(['agreements','scripts','other'].includes(data.category),'Choose a document folder.');
    if(data.remove) {const current=await store.get(`profile-link/${data.gallery}`,{type:'json'});check(current?.profileId===id,'Project is not in this profile.',409);await store.delete(`profile-link/${data.gallery}`);}
    else await store.setJSON(`profile-link/${data.gallery}`,{profileId:id,category:data.category});
    return json({saved:true});
  }
  check(owner||authenticated(request,profileCookie(id),profileSubject(profile),secret),'Enter this profile’s passcode.',401);
  if(action==='profile-finals' && request.method==='GET'){
    const manifest=await store.get(`finals/${id}`,{type:'json'});
    let downloads=[];if(owner){const {blobs}=await store.list({prefix:`final-download/${id}/`});downloads=(await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})))).filter(Boolean).sort((a,b)=>b.time.localeCompare(a.time));}
    return json({files:(manifest?.files||[]).map(f=>({...f,name:f.name.replace(/enhanced/gi,'edited')})),downloads,owner});
  }
  if(action==='profile-final-download' && request.method==='GET'){
    const manifest=await store.get(`finals/${id}`,{type:'json'});check(manifest,'No finals available.',404);
    const file=url.searchParams.get('file');const entry=file==='all'?manifest.archive:manifest.files.find(f=>f.id===file);check(entry,'File not found.',404);
    const bytes=await store.get(entry.key,{type:'arrayBuffer'});check(bytes,'File unavailable.',404);
    if(!owner)await store.setJSON(`final-download/${id}/${randomBytes(16).toString('hex')}`,{time:new Date().toISOString(),filename:entry.name,type:file==='all'?'All photos ZIP':'Individual photo'});
    return new Response(bytes,{headers:{...headers,'Content-Type':file==='all'?'application/zip':'image/png','Content-Disposition':`attachment; filename="${entry.name.replace(/enhanced/gi,'edited')}"`,'Cache-Control':'private, no-store'}});
  }
  if(action==='profile-detail' && request.method==='GET'){
    const{blobs}=await store.list({prefix:'profile-link/'});const items=[];
    for(const{key}of blobs){const link=await store.get(key,{type:'json'});if(link?.profileId!==id)continue;const galleryId=key.split('/').at(-1);const g=await store.get(`gallery/${galleryId}`,{type:'json'});if(!g)continue;const manifest=await store.get(`published/${galleryId}`,{type:'json'});if(!owner&&!manifest)continue;
      const submitted=await store.get(`${g.kind==='document'?'document-completed':'selection'}/${galleryId}`,{type:'json'});
      items.push({id:g.id,title:g.title,kind:g.kind||'photos',category:link.category,created:g.created,published:Boolean(manifest),completed:Boolean(submitted),limit:g.limit});}
    return json({...publicProfile(profile),owner,items:items.sort((a,b)=>(b.created||'').localeCompare(a.created||''))});
  }
  return json({error:'Profile action not found.'},404);
}
