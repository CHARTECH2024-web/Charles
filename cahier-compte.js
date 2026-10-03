import { auth, db } from "./firebase-config.js";
import { loginUserWithGoogle, logoutUser, observeUser } from "./auth.js";
import {
  doc, getDoc, setDoc, addDoc, collection, query, orderBy, getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const state = { user:null, products:[], sales:[] };

const $ = (id) => document.getElementById(id);
const money = (value) => `${Number(value || 0).toLocaleString("fr-FR")} FC`;

function setStatus(message, error=false) {
  const el=$("cahier-status");
  if(!el)return;
  el.textContent=message;
  el.className=error ? "cahier-status error" : "cahier-status";
}

function showApp(user) {
  $("cahier-login").hidden=true;
  $("cahier-app").hidden=false;
  $("cahier-user").textContent=user.displayName || user.email || "";
}

function showLogin() {
  $("cahier-login").hidden=false;
  $("cahier-app").hidden=true;
}

async function ensureBusiness(user) {
  const ref=doc(db,"businesses",user.uid);
  const snap=await getDoc(ref);
  if(!snap.exists()) {
    await setDoc(ref,{
      ownerId:user.uid,
      name:"",
      phone:"",
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
  }
  const fresh=await getDoc(ref);
  const data=fresh.data() || {};
  $("business-input").value=data.name || "";
  $("business-phone").value=data.phone || "";
  $("business-name").textContent=data.name || "Mon entreprise";
}

async function loadProducts() {
  const snap=await getDocs(query(collection(db,"businesses",state.user.uid,"products"),orderBy("name")));
  state.products=snap.docs.map(d=>({id:d.id,...d.data()}));
  $("stat-products").textContent=state.products.length;
  $("product-count").textContent=`${state.products.length} produit(s)`;
  $("product-list").innerHTML=state.products.length
    ? state.products.map(p=>`<div class="cahier-list-row"><strong>${escapeHtml(p.name)}</strong><span>${money(p.price)} • Stock: ${Number(p.stock||0)}</span></div>`).join("")
    : "<p class='text-muted'>Aucun produit pour le moment.</p>";
  $("sale-product").innerHTML='<option value="">Sélectionner</option>' +
    state.products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
}

async function loadSales() {
  const snap=await getDocs(query(collection(db,"businesses",state.user.uid,"sales"),orderBy("createdAt","desc")));
  state.sales=snap.docs.map(d=>({id:d.id,...d.data()}));
  const total=state.sales.reduce((sum,s)=>sum+Number(s.amount||0),0);
  $("stat-sales").textContent=money(total);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

$("cahier-login-btn").onclick=async()=>{
  try { await loginUserWithGoogle(); }
  catch(e) { $("cahier-login-error").hidden=false; $("cahier-login-error").textContent="Connexion impossible. Réessayez."; }
};

$("cahier-logout").onclick=()=>logoutUser();

$("business-form").onsubmit=async(e)=>{
  e.preventDefault();
  if(!state.user)return;
  try {
    const name=$("business-input").value.trim();
    const phone=$("business-phone").value.trim();
    await setDoc(doc(db,"businesses",state.user.uid),{ownerId:state.user.uid,name,phone,updatedAt:serverTimestamp()},{merge:true});
    $("business-name").textContent=name || "Mon entreprise";
    setStatus("Profil de l'entreprise enregistré.");
  } catch(e) { setStatus("Impossible d'enregistrer le profil.",true); }
};

$("product-form").onsubmit=async(e)=>{
  e.preventDefault();
  if(!state.user)return;
  try {
    await addDoc(collection(db,"businesses",state.user.uid,"products"),{
      name:$("product-name").value.trim(),
      price:Number($("product-price").value),
      stock:Number($("product-stock").value),
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    e.target.reset();
    $("product-stock").value=0;
    await loadProducts();
    setStatus("Produit ajouté.");
  } catch(e) { setStatus("Impossible d'ajouter le produit.",true); }
};

$("sale-form").onsubmit=async(e)=>{
  e.preventDefault();
  if(!state.user)return;
  const productId=$("sale-product").value;
  const product=state.products.find(p=>p.id===productId);
  if(!product)return;
  const qty=Number($("sale-qty").value);
  const amount=Number($("sale-amount").value);
  if(qty<1 || amount<0)return;
  try {
    await addDoc(collection(db,"businesses",state.user.uid,"sales"),{
      productId, productName:product.name, quantity:qty, amount,
      createdAt:serverTimestamp()
    });
    e.target.reset();
    $("sale-qty").value=1;
    await loadSales();
    setStatus("Vente enregistrée.");
  } catch(e) { setStatus("Impossible d'enregistrer la vente.",true); }
};

observeUser(async(user)=>{
  state.user=user;
  if(!user){showLogin();return;}
  try {
    showApp(user);
    await ensureBusiness(user);
    await Promise.all([loadProducts(),loadSales()]);
  } catch(e) {
    setStatus("Impossible de charger votre espace Cahier de Compte.",true);
  }
});
