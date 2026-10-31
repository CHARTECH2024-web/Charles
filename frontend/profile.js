import { db } from "./firebase-config.js";
import { loginUserWithGoogle, logoutUser, observeUser } from "./auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const loading=document.getElementById("profileLoading"), content=document.getElementById("profileContent");
const prompt=document.getElementById("loginPrompt"), status=document.getElementById("status");
let user=null;

document.getElementById("loginBtn")?.addEventListener("click",async()=>{try{await loginUserWithGoogle()}catch(e){console.error(e)}});
document.getElementById("logoutBtn")?.addEventListener("click",()=>logoutUser());
document.getElementById("saveBtn")?.addEventListener("click",async()=>{
 if(!user)return; const btn=document.getElementById("saveBtn"); btn.disabled=true;
 try{await setDoc(doc(db,"profiles",user.uid),{uid:user.uid,displayName:user.displayName||"Membre",email:user.email||"",photoURL:user.photoURL||"",bio:document.getElementById("bio").value.trim(),updatedAt:serverTimestamp()},{merge:true});status.textContent="Profil enregistré."}
 catch(e){console.error(e);status.textContent="Impossible d'enregistrer le profil."}finally{btn.disabled=false}
});

observeUser(async u=>{
 user=u; loading.style.display="none";
 if(!u){prompt.style.display="block";content.style.display="none";return}
 prompt.style.display="none";content.style.display="block";
 document.getElementById("displayName").textContent=u.displayName||"Membre";
 document.getElementById("email").textContent=u.email||"";
 const av=document.getElementById("avatar"); if(u.photoURL){av.src=u.photoURL;av.style.display="block"}
 const snap=await getDoc(doc(db,"profiles",u.uid)); if(snap.exists())document.getElementById("bio").value=snap.data().bio||"";
});