/* V3.2 — Media without Firebase Storage.
   Files are uploaded to Cloudinary Free via an unsigned preset.
   Firestore stores only metadata and the public delivery URL.
*/
import { db } from "./firebase-config.js";
import { CLOUDINARY_UPLOAD_URL, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";
import {
  collection, addDoc, getDocs, query, where, orderBy,
  deleteDoc, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const LIMITS = { photo: 10 * 1024 * 1024, video: 100 * 1024 * 1024 };
const ALLOWED = {
  photo: ["image/jpeg","image/png","image/webp"],
  video: ["video/mp4","video/webm"]
};
function esc(s){const d=document.createElement("div");d.textContent=s||"";return d.innerHTML;}

export function validateFile(file,type){
  if(!file)return "Aucun fichier sélectionné.";
  if(!ALLOWED[type]?.includes(file.type))return "Format non autorisé.";
  if(file.size>LIMITS[type])return `Fichier trop volumineux. Limite : ${type==="video"?"100":"10"} Mo.`;
  if(CLOUDINARY_CLOUD_NAME_MISSING())return "Cloudinary n'est pas encore configuré.";
  return null;
}
function CLOUDINARY_CLOUD_NAME_MISSING(){return !CLOUDINARY_UPLOAD_URL || CLOUDINARY_UPLOAD_URL.includes("YOUR_CLOUD_NAME") || CLOUDINARY_UPLOAD_PRESET==="YOUR_UNSIGNED_UPLOAD_PRESET";}

function uploadToCloudinary(file,onProgress){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open("POST",CLOUDINARY_UPLOAD_URL);
    xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.round(e.loaded/e.total*100));};
    xhr.onload=()=>{
      try{
        const data=JSON.parse(xhr.responseText||"{}");
        if(xhr.status>=200&&xhr.status<300&&data.secure_url)resolve(data);
        else reject(new Error(data.error?.message||"Upload Cloudinary refusé."));
      }catch{reject(new Error("Réponse Cloudinary invalide."));}
    };
    xhr.onerror=()=>reject(new Error("Connexion Cloudinary impossible."));
    const form=new FormData();
    form.append("file",file);
    form.append("upload_preset",CLOUDINARY_UPLOAD_PRESET);
    xhr.send(form);
  });
}

export async function loadPublicMedia(filter="all"){
  const container=document.getElementById("mediaContainer"),empty=document.getElementById("mediaEmpty");
  if(!container)return;
  container.innerHTML="<p class='skeleton'>Chargement des médias...</p>";
  try{
    const snap=await getDocs(query(collection(db,"media"),where("visibility","==","public")));
    let items=snap.docs.map(d=>({id:d.id,...d.data()}));
    items.sort((a,b)=>{
      const ta=a.createdAt?.toMillis?.() ?? 0;
      const tb=b.createdAt?.toMillis?.() ?? 0;
      return tb-ta;
    });
    if(filter!=="all")items=items.filter(i=>i.type===filter);
    container.innerHTML="";
    if(!items.length){empty&&(empty.style.display="block",container.appendChild(empty));return;}
    if(empty)empty.style.display="none";
    items.forEach(i=>container.insertAdjacentHTML("beforeend",renderMediaCard(i)));
  }catch(e){console.error(e);container.innerHTML="<p class='skeleton'>Impossible de charger les médias.</p>";}
}
function renderMediaCard(i){
  const date=i.createdAt?.toDate?i.createdAt.toDate().toLocaleDateString("fr-FR"):"";
  const safeUrl=esc(i.url||"");
  if(i.type==="video")return `<article class="card media-item"><div class="card-subtitle">${esc(date)}</div><video src="${safeUrl}" controls preload="metadata" class="media-thumbnail"></video><h3 class="card-title">${esc(i.title)}</h3><p style="font-size:.9rem;color:var(--text-muted)">${esc(i.description)}</p></article>`;
  return `<article class="card media-item"><div class="card-subtitle">${esc(date)}</div><img src="${safeUrl}" alt="${esc(i.title)}" class="media-thumbnail" loading="lazy"><h3 class="card-title">${esc(i.title)}</h3><p style="font-size:.9rem;color:var(--text-muted)">${esc(i.description)}</p></article>`;
}

export function uploadMedia({file,type,title,description,visibility,onProgress,onDone,onError}){
  uploadToCloudinary(file,onProgress).then(async data=>{
    const url=data.secure_url;
    await addDoc(collection(db,"media"),{
      title,description,type,url,thumbnail:type==="photo"?url:(data.thumbnail_url||""),
      publicId:data.public_id||"",storagePath:"cloudinary",visibility,size:file.size,fileType:file.type,
      createdAt:serverTimestamp()
    });
    onDone?.(url);
  }).catch(onError);
}
export async function loadAllMediaAdmin(){
  const snap=await getDocs(query(collection(db,"media"),orderBy("createdAt","desc")));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
export async function toggleMediaVisibility(id,currentVisibility){
  const next=currentVisibility==="public"?"private":"public";
  await updateDoc(doc(db,"media",id),{visibility:next});return next;
}
export async function deleteMedia(id){
  // Cloudinary deletion requires a server-side API secret. We remove the publication
  // from Firestore; the asset can be cleaned from the Cloudinary console later.
  await deleteDoc(doc(db,"media",id));
}
window.loadPublicMedia=loadPublicMedia;
