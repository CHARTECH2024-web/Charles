/* V3.2 — Documents without Firebase Storage.
   Files are uploaded to Cloudinary Free as raw assets; Firestore stores metadata.
*/
import { db } from "./firebase-config.js";
import { CLOUDINARY_UPLOAD_URL, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";
import { collection,addDoc,getDocs,query,where,orderBy,deleteDoc,doc,updateDoc,serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const ALLOWED_EXT=[".pdf",".doc",".docx",".ppt",".pptx",".txt",".odt"];
const MAX=10*1024*1024;
function esc(s){const d=document.createElement("div");d.textContent=s||"";return d.innerHTML;}
function formatBytes(b){if(!b)return"0 Ko";const k=1024,s=["o","Ko","Mo","Go"],i=Math.floor(Math.log(b)/Math.log(k));return parseFloat((b/Math.pow(k,i)).toFixed(1))+" "+s[i];}
function configured(){return !CLOUDINARY_UPLOAD_URL.includes("YOUR_CLOUD_NAME")&&CLOUDINARY_UPLOAD_PRESET!=="YOUR_UNSIGNED_UPLOAD_PRESET";}

export function validateDocFile(file){
  if(!file)return"Aucun fichier sélectionné.";
  const ok=ALLOWED_EXT.some(x=>file.name.toLowerCase().endsWith(x));
  if(!ok)return"Extension non autorisée : "+ALLOWED_EXT.join(", ");
  if(file.size>MAX)return"Document trop volumineux. Limite : 10 Mo.";
  if(!configured())return"Cloudinary n'est pas encore configuré.";
  return null;
}
function uploadRaw(file,onProgress){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open("POST",CLOUDINARY_UPLOAD_URL);
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.round(e.loaded/e.total*100));};
  xhr.onload=()=>{try{const d=JSON.parse(xhr.responseText||"{}");if(xhr.status>=200&&xhr.status<300&&d.secure_url)resolve(d);else reject(new Error(d.error?.message||"Upload refusé."));}catch{reject(new Error("Réponse invalide."));}};
  xhr.onerror=()=>reject(new Error("Connexion Cloudinary impossible."));
  const f=new FormData();f.append("file",file);f.append("upload_preset",CLOUDINARY_UPLOAD_PRESET);xhr.send(f);
 });
}
export async function loadPublicDocuments(){
 const c=document.getElementById("docsContainer"),e=document.getElementById("docsEmpty");if(!c)return;
 c.innerHTML="<p class='skeleton'>Chargement des documents...</p>";
 try{
  const snap=await getDocs(query(collection(db,"documents"),where("visibility","==","public"),orderBy("createdAt","desc")));c.innerHTML="";
  if(snap.empty){if(e){e.style.display="block";c.appendChild(e);}return;}if(e)e.style.display="none";
  snap.forEach(s=>{const i=s.data(),date=i.createdAt?.toDate?i.createdAt.toDate().toLocaleDateString("fr-FR"):"";c.insertAdjacentHTML("beforeend",`<article class="card"><div class="doc-icon">📄</div><div class="card-subtitle" style="text-align:center">${esc(i.fileType||"Document")} · ${esc(formatBytes(i.size))}</div><h3 class="card-title" style="justify-content:center">${esc(i.title)}</h3><p style="text-align:center;font-size:.9rem;color:var(--text-muted)">${esc(i.description)}</p><p style="text-align:center;font-size:.78rem;color:var(--text-muted)">${esc(date)}</p><div style="display:flex;justify-content:center;gap:.5rem;margin-top:auto"><a href="${esc(i.url)}" target="_blank" rel="noopener" class="btn btn-primary btn-small">Ouvrir</a><a href="${esc(i.url)}" target="_blank" rel="noopener" class="btn btn-outline btn-small">Télécharger</a></div></article>`);});
 }catch(err){console.error(err);c.innerHTML="<p class='skeleton'>Impossible de charger les documents.</p>";}
}
export function uploadDocument({file,title,description,visibility,onProgress,onDone,onError}){
 uploadRaw(file,onProgress).then(async d=>{await addDoc(collection(db,"documents"),{title,description,url:d.secure_url,storagePath:"cloudinary",publicId:d.public_id||"",visibility,size:file.size,fileType:file.type||file.name.split(".").pop(),createdAt:serverTimestamp()});onDone?.(d.secure_url);}).catch(onError);
}
export async function loadAllDocumentsAdmin(){const s=await getDocs(query(collection(db,"documents"),orderBy("createdAt","desc")));return s.docs.map(d=>({id:d.id,...d.data()}));}
export async function toggleDocumentVisibility(id,current){const next=current==="public"?"private":"public";await updateDoc(doc(db,"documents",id),{visibility:next});return next;}
export async function deleteDocument(id){await deleteDoc(doc(db,"documents",id));}
