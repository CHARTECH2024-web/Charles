import { db } from "./firebase-config.js";
import { loginUserWithGoogle, logoutUser, observeUser } from "./auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const loading=document.getElementById("profileLoading"), content=document.getElementById("profileContent");
const prompt=document.getElementById("loginPrompt"), status=document.getElementById("status");
let user=null;
let selectedPhotoURL="";
const photoInput=document.getElementById("profilePhoto");
const avatar=document.getElementById("avatar");
const say=(message,error=false)=>{status.textContent=message;status.style.color=error?"#d33":"var(--text-muted)";};

document.getElementById("loginBtn")?.addEventListener("click",async()=>{try{await loginUserWithGoogle()}catch(e){console.error(e);say("Connexion impossible. Réessayez dans votre navigateur principal.",true)}});
document.getElementById("logoutBtn")?.addEventListener("click",()=>logoutUser());

function compressImage(file){
 return new Promise((resolve,reject)=>{
  if(!file || !file.type.startsWith("image/")){reject(new Error("Choisissez un fichier image."));return;}
  if(file.size>12*1024*1024){reject(new Error("La photo doit faire moins de 12 Mo avant compression."));return;}
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error("Impossible de lire cette image."));
  reader.onload=()=>{
   const image=new Image();
   image.onerror=()=>reject(new Error("Ce format d'image n'est pas lisible."));
   image.onload=()=>{
    const canvas=document.createElement("canvas");
    const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext("2d");
    if(!ctx){reject(new Error("Compression d'image indisponible."));return;}
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    let quality=.78, data=canvas.toDataURL("image/jpeg",quality);
    while(data.length>175000 && quality>.35){quality-=.08;data=canvas.toDataURL("image/jpeg",quality);}
    if(data.length>180000){reject(new Error("Cette photo reste trop volumineuse. Choisissez une image plus petite."));return;}
    resolve(data);
   };
   image.src=String(reader.result);
  };
  reader.readAsDataURL(file);
 });
}

photoInput?.addEventListener("change",async()=>{
 const file=photoInput.files?.[0];if(!file)return;
 try{say("Préparation de la photo…");selectedPhotoURL=await compressImage(file);avatar.src=selectedPhotoURL;avatar.style.display="block";say("Aperçu prêt. Appuyez sur « Changer la photo » pour enregistrer.");}
 catch(e){selectedPhotoURL="";say(e.message||"Impossible de préparer cette photo.",true);}
});

document.getElementById("savePhotoBtn")?.addEventListener("click",async()=>{
 if(!user)return;
 if(!selectedPhotoURL){say("Choisissez d'abord une nouvelle photo.",true);return;}
 const btn=document.getElementById("savePhotoBtn");btn.disabled=true;
 try{
  const stamp=serverTimestamp();
  await setDoc(doc(db,"profiles",user.uid),{uid:user.uid,displayName:user.displayName||"Membre",email:user.email||"",photoURL:selectedPhotoURL,updatedAt:stamp},{merge:true});
  await setDoc(doc(db,"publicProfiles",user.uid),{uid:user.uid,displayName:user.displayName||user.email?.split("@")[0]||"Membre",photoURL:selectedPhotoURL,updatedAt:serverTimestamp()},{merge:true});
  say("Photo de profil mise à jour.");
  selectedPhotoURL="";
  if(photoInput)photoInput.value="";
 }catch(e){console.error(e);say(e?.code==="permission-denied"?"La photo n'a pas été enregistrée : les règles Firestore doivent autoriser la taille de cette image.":"Impossible d'enregistrer la photo. Réessayez.",true);}
 finally{btn.disabled=false;}
});

document.getElementById("saveBtn")?.addEventListener("click",async()=>{
 if(!user)return; const btn=document.getElementById("saveBtn"); btn.disabled=true;
 try{
  await setDoc(doc(db,"profiles",user.uid),{uid:user.uid,displayName:user.displayName||"Membre",email:user.email||"",photoURL:selectedPhotoURL||avatar?.src||user.photoURL||"",bio:document.getElementById("bio").value.trim(),updatedAt:serverTimestamp()},{merge:true});
  say("Profil enregistré.");
 }catch(e){console.error(e);say("Impossible d'enregistrer le profil.",true)}finally{btn.disabled=false}
});

observeUser(async u=>{
 user=u; loading.style.display="none";
 if(!u){prompt.style.display="block";content.style.display="none";return}
 prompt.style.display="none";content.style.display="block";
 document.getElementById("displayName").textContent=u.displayName||"Membre";
 document.getElementById("email").textContent=u.email||"";
 try{
  const snap=await getDoc(doc(db,"profiles",u.uid));
  const profile=snap.exists()?snap.data():{};
  selectedPhotoURL=profile.photoURL||u.photoURL||"";
  if(avatar){avatar.src=selectedPhotoURL;avatar.style.display=selectedPhotoURL?"block":"none";}
  if(profile.bio)document.getElementById("bio").value=profile.bio;
 }catch(e){console.error(e);selectedPhotoURL=u.photoURL||"";if(avatar&&selectedPhotoURL){avatar.src=selectedPhotoURL;avatar.style.display="block";}}
});
