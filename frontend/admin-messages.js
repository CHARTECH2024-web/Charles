import { db } from "./firebase-config.js";
import { requireAdmin, logoutAdmin } from "./auth.js";
import { collection,query,orderBy,limit,onSnapshot,doc,deleteDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
window.logoutAdmin=logoutAdmin;
const list=document.getElementById("messageAdminList");
const esc=v=>{const d=document.createElement("div");d.textContent=v||"";return d.innerHTML};
requireAdmin(()=>{
 const q=query(collection(db,"messages"),orderBy("createdAt","desc"),limit(200));
 onSnapshot(q,snap=>{
  list.innerHTML="";
  if(snap.empty){list.innerHTML="<p>Aucun message.</p>";return}
  snap.forEach(s=>{
   const m=s.data(), date=m.createdAt?.toDate?m.createdAt.toDate().toLocaleString("fr-FR"):"à l'instant";
   const el=document.createElement("article");el.className="card";el.style.marginBottom=".8rem";
   el.innerHTML=`<div style="display:flex;justify-content:space-between;gap:1rem"><strong>${esc(m.displayName||"Membre")}</strong><small>${esc(date)}</small></div><p style="white-space:pre-wrap">${esc(m.text)}</p><button class="btn btn-outline btn-small">Supprimer</button>`;
   el.querySelector("button").onclick=async()=>{if(confirm("Supprimer ce message ?"))await deleteDoc(doc(db,"messages",s.id))};
   list.appendChild(el);
  });
 },e=>{console.error(e);list.innerHTML="<p>Impossible de charger les messages.</p>"});
});