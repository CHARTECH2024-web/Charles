import { db } from "./firebase-config.js";
import { loginUserWithGoogle, logoutUser, observeUser } from "./auth.js";
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const list=document.getElementById("messageList");
const form=document.getElementById("messageForm");
const input=document.getElementById("messageInput");
const status=document.getElementById("communityStatus");
const banner=document.getElementById("authBanner");
const profile=document.getElementById("profileBox");
const loginBtn=document.getElementById("loginBtn");
const logoutBtn=document.getElementById("logoutBtn");
const charCount=document.getElementById("charCount");
let currentUser=null;
let stopMessages=null;

function esc(value=""){const d=document.createElement("div");d.textContent=value;return d.innerHTML;}
function setStatus(msg){if(status)status.textContent=msg;}

loginBtn?.addEventListener("click",async()=>{
 loginBtn.disabled=true;setStatus("Connexion Google en cours…");
 try{await loginUserWithGoogle();}catch(e){console.error(e);setStatus("Connexion annulée ou impossible.");}
 finally{loginBtn.disabled=false;}
});
logoutBtn?.addEventListener("click",()=>logoutUser());
input?.addEventListener("input",()=>{if(charCount)charCount.textContent=input.value.length+"/1000";});

function renderMessages(snapshot){
 if(!list)return;
 list.innerHTML="";
 if(snapshot.empty){list.innerHTML='<p class="skeleton">Aucun message pour le moment. Soyez le premier à écrire.</p>';return;}
 snapshot.docs.slice().reverse().forEach(s=>{
  const m=s.data(),mine=currentUser&&m.uid===currentUser.uid;
  const when=m.createdAt?.toDate?m.createdAt.toDate().toLocaleString("fr-FR"):"à l'instant";
  const avatar=m.photoURL?'<img class="message-avatar" src="'+esc(m.photoURL)+'" alt="">':'<div class="message-avatar" style="display:grid;place-items:center;background:var(--surface-hover)">👤</div>';
  const remove=mine?'<button class="message-delete" data-delete="'+s.id+'" title="Supprimer">Supprimer</button>':"";
  list.insertAdjacentHTML("beforeend",'<article class="message-row">'+(mine?"":avatar)+'<div class="message '+(mine?"me":"")+'"><div class="message-head"><strong>'+esc(m.displayName||"Membre")+'</strong><span>'+esc(when)+'</span></div><div class="message-body">'+esc(m.text||"")+'</div>'+remove+'</div>'+(mine?avatar:"")+'</article>');
  const del=list.querySelector('[data-delete="'+s.id+'"]');
  del?.addEventListener("click",async()=>{
   del.disabled=true;
   try{await deleteDoc(doc(db,"messages",s.id));setStatus("Message supprimé.");}
   catch(e){console.error(e);setStatus("Impossible de supprimer ce message.");del.disabled=false;}
  });
 });
 list.scrollTop=list.scrollHeight;
}

function subscribeMessages(){
 if(stopMessages)stopMessages();
 const q=query(collection(db,"messages"),orderBy("createdAt","desc"),limit(100));
 stopMessages=onSnapshot(q,renderMessages,e=>{console.error(e);list.innerHTML='<p class="skeleton">Impossible de charger le chat. Connectez-vous avec Google.</p>';});
}

form?.addEventListener("submit",async e=>{
 e.preventDefault();if(!currentUser)return;
 const text=input.value.trim();if(!text||text.length>1000)return;
 const btn=document.getElementById("sendBtn");btn.disabled=true;
 try{
  await addDoc(collection(db,"messages"),{uid:currentUser.uid,displayName:currentUser.displayName||"Membre",photoURL:currentUser.photoURL||"",text,createdAt:serverTimestamp()});
  input.value="";if(charCount)charCount.textContent="0/1000";setStatus("Message envoyé en temps réel.");
 }catch(e){console.error(e);setStatus("Le message n'a pas pu être envoyé.");}
 finally{btn.disabled=false;}
});

observeUser(user=>{
 currentUser=user;
 const logged=!!user;
 banner.style.display=logged?"none":"block";
 profile.style.display=logged?"flex":"none";
 form.style.display=logged?"flex":"none";
 if(logged){
  document.getElementById("profileName").textContent=user.displayName||user.email||"Membre";
  const avatar=document.getElementById("profileAvatar");
  if(user.photoURL){avatar.src=user.photoURL;avatar.style.display="block";}
  setStatus("Connecté. Le salon est synchronisé en temps réel.");
 }else { setStatus("Connectez-vous avec Google pour voir et rejoindre le chat."); if(stopMessages) stopMessages(); if(list) list.innerHTML="<p class=\"skeleton\">Connectez-vous pour accéder au salon.</p>"; }
 if(logged) subscribeMessages();
});