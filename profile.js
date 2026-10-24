import { auth, db } from "./firebase-config.js";
import { logoutUser, observeUser } from "./auth.js";
import { CLOUDINARY_UPLOAD_URL, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const loading=document.getElementById("profileLoading"), content=document.getElementById("profileContent");
const prompt=document.getElementById("loginPrompt"), status=document.getElementById("status");
const photoStatus=document.getElementById("photoStatus");
let user=null;

document.getElementById("loginBtn")?.addEventListener("click",()=>{window.location.href="./auth.html?next=profile.html";});
document.getElementById("logoutBtn")?.addEventListener("click",()=>logoutUser());
document.getElementById("saveBtn")?.addEventListener("click",async()=>{
 if(!user)return;
 const btn=document.getElementById("saveBtn");btn.disabled=true;
 try{
  await setDoc(doc(db,"profiles",user.uid),{uid:user.uid,displayName:user.displayName||"Membre",email:user.email||"",photoURL:user.photoURL||"",bio:document.getElementById("bio").value.trim(),updatedAt:serverTimestamp()},{merge:true});
  status.textContent="Profil enregistré.";
 }catch(e){console.error(e);status.textContent="Impossible d'enregistrer le profil.";}
 finally{btn.disabled=false;}
});

document.getElementById("uploadPhotoBtn")?.addEventListener("click",async()=>{
 const input=document.getElementById("photoInput"),file=input?.files?.[0],btn=document.getElementById("uploadPhotoBtn");
 if(!user){photoStatus.textContent="Connectez-vous d'abord.";return;}
 if(!file){photoStatus.textContent="Choisissez une photo avant de continuer.";return;}
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)){photoStatus.textContent="Choisissez une image JPG, PNG ou WebP.";return;}
 if(file.size>5*1024*1024){photoStatus.textContent="La photo doit peser 5 Mo maximum.";return;}
 if(!CLOUDINARY_UPLOAD_URL||!CLOUDINARY_UPLOAD_PRESET||CLOUDINARY_UPLOAD_PRESET==="YOUR_UNSIGNED_UPLOAD_PRESET"){photoStatus.textContent="Le service photo n'est pas configuré.";return;}
 btn.disabled=true;photoStatus.textContent="Envoi de la photo…";
 try{
  const uploaded=await new Promise((resolve,reject)=>{
   const xhr=new XMLHttpRequest();xhr.open("POST",CLOUDINARY_UPLOAD_URL);
   xhr.onload=()=>{try{const data=JSON.parse(xhr.responseText||"{}");if(xhr.status>=200&&xhr.status<300&&data.secure_url)resolve(data);else reject(new Error(data.error?.message||"Upload refusé."));}catch(err){reject(err);}};
   xhr.onerror=()=>reject(new Error("Connexion au service photo impossible."));
   const form=new FormData();form.append("file",file);form.append("upload_preset",CLOUDINARY_UPLOAD_PRESET);xhr.send(form);
  });
  const photoURL=uploaded.secure_url;
  await updateProfile(auth.currentUser,{photoURL});
  user=auth.currentUser;
  await Promise.all([
   setDoc(doc(db,"publicProfiles",user.uid),{uid:user.uid,displayName:user.displayName||"Membre",photoURL,updatedAt:serverTimestamp()},{merge:true}),
   setDoc(doc(db,"profiles",user.uid),{uid:user.uid,displayName:user.displayName||"Membre",email:user.email||"",photoURL,updatedAt:serverTimestamp()},{merge:true})
  ]);
  const avatar=document.getElementById("avatar");avatar.src=photoURL;avatar.hidden=false;
  photoStatus.textContent="Photo de profil enregistrée.";
 }catch(e){console.error("HORIZON profile photo:",e);photoStatus.textContent="Impossible d'enregistrer la photo. Réessayez.";}
 finally{btn.disabled=false;}
});

observeUser(async u=>{
 user=u;loading.style.display="none";
 if(!u){prompt.style.display="block";content.style.display="none";return;}
 prompt.style.display="none";content.style.display="block";
 document.getElementById("displayName").textContent=u.displayName||"Membre";
 const av=document.getElementById("avatar");
 if(u.photoURL){av.src=u.photoURL;av.hidden=false;}else{av.hidden=true;}
 try{
  const snap=await getDoc(doc(db,"profiles",u.uid));
  if(snap.exists())document.getElementById("bio").value=snap.data().bio||"";
 }catch(e){console.error("HORIZON profile load:",e);status.textContent="Le profil est chargé, mais certains détails n'ont pas pu être récupérés.";}
});