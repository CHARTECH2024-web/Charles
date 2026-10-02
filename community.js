import { db } from "./firebase-config.js";
import { loginUserWithGoogle, logoutUser, observeUser } from "./auth.js";
import { collection, doc, setDoc, getDocs, query, orderBy, limit, onSnapshot, addDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { t } from "./i18n.js";

const loginGate=document.getElementById("loginGate"), app=document.getElementById("privateApp");
const loginBtn=document.getElementById("loginBtn"), logoutBtn=document.getElementById("logoutBtn");
const userList=document.getElementById("userList"), search=document.getElementById("userSearch");
const list=document.getElementById("privateMessages"), form=document.getElementById("privateForm"), input=document.getElementById("privateInput");
const status=document.getElementById("privateStatus"), nameEl=document.getElementById("chatName"), stateEl=document.getElementById("chatState"), avatar=document.getElementById("chatAvatar");
let me=null, users=[], selected=null, stop=null;
const esc=v=>{const d=document.createElement("div");d.textContent=v??"";return d.innerHTML;};
const pair=(a,b)=>[a,b].sort().join("__");
const msg=v=>{if(status)status.textContent=v;};

loginBtn?.addEventListener("click",async()=>{loginBtn.disabled=true;try{await loginUserWithGoogle();}catch(e){console.error(e);msg("Connexion impossible.");}finally{loginBtn.disabled=false;}});
logoutBtn?.addEventListener("click",()=>logoutUser());

async function register(user){
  await setDoc(doc(db,"publicProfiles",user.uid),{
    uid:user.uid,displayName:user.displayName||user.email?.split("@")[0]||"Membre",photoURL:user.photoURL||"",updatedAt:serverTimestamp()
  },{merge:true});
}
async function loadUsers(){
  userList.innerHTML="<p class='skeleton'>Chargement…</p>";
  try{
    const snap=await getDocs(collection(db,"publicProfiles"));
    users=snap.docs.map(x=>x.data()).filter(x=>x.uid&&x.uid!==me.uid);
    users.sort((a,b)=>(a.displayName||"").localeCompare(b.displayName||""));
    renderUsers();
  }catch(e){console.error(e);userList.innerHTML="<p class='skeleton'>Impossible de charger les utilisateurs.</p>";}
}
function renderUsers(){
  const q=(search?.value||"").toLowerCase().trim();
  const shown=users.filter(u=>(u.displayName||"").toLowerCase().includes(q));
  if(!shown.length){userList.innerHTML="<p class='skeleton'>"+esc(t("noUsers"))+"</p>";return;}
  userList.innerHTML=shown.map(u=>{
    const pic=u.photoURL?"<img src='"+esc(u.photoURL)+"' alt=''>":"<div class='user-avatar' style='display:grid;place-items:center;background:var(--surface-hover)'>👤</div>";
    return "<button class='user-item "+(selected?.uid===u.uid?"active":"")+"' data-uid='"+esc(u.uid)+"'>"+pic+"<span class='user-meta'><strong>"+esc(u.displayName||"Membre")+"</strong><small>Charles</small></span></button>";
  }).join("");
  userList.querySelectorAll("[data-uid]").forEach(b=>b.addEventListener("click",()=>{const u=users.find(x=>x.uid===b.dataset.uid);if(u)openChat(u);}));
}
async function openChat(user){
  selected=user;renderUsers();
  nameEl.textContent=user.displayName||"Membre";stateEl.textContent=t("online");
  if(user.photoURL){avatar.src=user.photoURL;avatar.style.display="block";}else avatar.style.display="none";
  form.style.display="flex";
  if(stop){stop();stop=null;}
  list.innerHTML="<p class='skeleton'>Chargement…</p>";
  const id=pair(me.uid,user.uid);
  try{
    await setDoc(doc(db,"conversations",id),{
      participants:[me.uid,user.uid].sort(),
      participantInfo:{
        [me.uid]:{displayName:me.displayName||"Membre",photoURL:me.photoURL||""},
        [user.uid]:{displayName:user.displayName||"Membre",photoURL:user.photoURL||""}
      },createdAt:serverTimestamp()
    },{merge:true});
    stop=onSnapshot(query(collection(db,"conversations",id,"messages"),orderBy("createdAt","asc"),limit(200)),snap=>{
      list.innerHTML="";
      if(snap.empty){list.innerHTML="<p class='skeleton'>"+esc(t("noMessages"))+"</p>";return;}
      snap.forEach(x=>{
        const m=x.data(), mine=m.senderId===me.uid, item=document.createElement("article");
        item.className="private-message "+(mine?"me":"");
        const when=m.createdAt?.toDate?m.createdAt.toDate().toLocaleString(): "";
        item.innerHTML=esc(m.text||"")+"<time>"+esc(mine?t("you"):(user.displayName||"Membre"))+" • "+esc(when)+"</time>";
        if(mine)item.addEventListener("dblclick",async()=>{try{await deleteDoc(doc(db,"conversations",id,"messages",x.id));}catch(e){console.error(e);}});
        list.appendChild(item);
      });
      list.scrollTop=list.scrollHeight;
    },e=>{console.error(e);list.innerHTML="<p class='skeleton'>Impossible de charger cette conversation.</p>";});
  }catch(e){console.error(e);msg("Impossible d'ouvrir cette conversation.");}
}
form?.addEventListener("submit",async e=>{
  e.preventDefault();if(!me||!selected)return;
  const text=input.value.trim();if(!text)return;
  const id=pair(me.uid,selected.uid), button=form.querySelector("button[type=submit]");button.disabled=true;
  try{
    await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,receiverId:selected.uid,text,createdAt:serverTimestamp()});
    await setDoc(doc(db,"conversations",id),{lastMessage:text.slice(0,120),lastMessageAt:serverTimestamp(),lastSenderId:me.uid},{merge:true});
    input.value="";msg("Message envoyé.");
  }catch(e){console.error(e);msg("Le message n'a pas pu être envoyé.");}finally{button.disabled=false;}
});
search?.addEventListener("input",renderUsers);
document.addEventListener("charles:language",()=>{renderUsers();if(selected)stateEl.textContent=t("online");});

observeUser(async user=>{
  me=user;selected=null;
  if(stop){stop();stop=null;}
  if(!user){loginGate.style.display="block";app.style.display="none";return;}
  loginGate.style.display="none";app.style.display="grid";
  try{await register(user);await loadUsers();}catch(e){console.error(e);}
});