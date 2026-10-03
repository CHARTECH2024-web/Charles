import { auth, db } from "./firebase-config.js";
import { loginUserWithGoogle, logoutUser, observeUser } from "./auth.js";
import {
  doc, getDoc, setDoc, addDoc, collection, query, orderBy, getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const state = { user:null, products:[], sales:[], customers:[], debts:[], stockMoves:[], expenses:[] };

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
  const low=state.products.filter(p=>Number(p.stock||0)<=Number(p.lowStockThreshold ?? 5));
  $("stat-low-stock").textContent=low.length;
  $("low-stock-list").innerHTML=low.length
    ? low.map(p=>`<div class="cahier-list-row"><strong>${escapeHtml(p.name)}</strong><span>Stock: ${Number(p.stock||0)} • Seuil: ${Number(p.lowStockThreshold ?? 5)}</span></div>`).join("")
    : "<p class='text-muted'>Aucun stock faible.</p>";
  $("product-count").textContent=`${state.products.length} produit(s)`;
  $("product-list").innerHTML=state.products.length
    ? state.products.map(p=>`<div class="cahier-list-row"><strong>${escapeHtml(p.name)}</strong><span>${money(p.price)} • Stock: ${Number(p.stock||0)}</span></div>`).join("")
    : "<p class='text-muted'>Aucun produit pour le moment.</p>";
  $("sale-product").innerHTML='<option value="">Sélectionner</option>' +
    state.products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  $("stock-product").innerHTML='<option value="">Sélectionner</option>' +
    state.products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
}

async function loadSales() {
  const snap=await getDocs(query(collection(db,"businesses",state.user.uid,"sales"),orderBy("createdAt","desc")));
  state.sales=snap.docs.map(d=>({id:d.id,...d.data()}));
  const total=state.sales.reduce((sum,s)=>sum+Number(s.amount||0),0);
  $("stat-sales").textContent=money(total);
  updateFinancialSummary();
}


async function loadCustomers() {
  const snap=await getDocs(query(collection(db,"businesses",state.user.uid,"customers"),orderBy("name")));
  state.customers=snap.docs.map(d=>({id:d.id,...d.data()}));
  $("stat-customers").textContent=state.customers.length;
  $("customer-count").textContent=`${state.customers.length} client(s)`;
  $("customer-list").innerHTML=state.customers.length
    ? state.customers.map(c=>`<div class="cahier-list-row"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.phone || "Sans téléphone")}</span></div>`).join("")
    : "<p class='text-muted'>Aucun client pour le moment.</p>";
  $("debt-customer").innerHTML='<option value="">Sélectionner</option>' +
    state.customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

async function loadDebts() {
  const snap=await getDocs(query(collection(db,"businesses",state.user.uid,"debts"),orderBy("createdAt","desc")));
  state.debts=snap.docs.map(d=>({id:d.id,...d.data()}));
  const total=state.debts.reduce((sum,d)=>sum+Number(d.amount||0),0);
  $("stat-debts").textContent=money(total);
  updateFinancialSummary();
  $("debt-list").innerHTML=state.debts.length
    ? state.debts.map(d=>`<div class="cahier-list-row"><strong>${escapeHtml(d.customerName)}</strong><span>${money(d.amount)} • ${escapeHtml(d.note || "Crédit")}</span></div>`).join("")
    : "<p class='text-muted'>Aucun crédit enregistré.</p>";
}


async function loadExpenses() {
  const snap=await getDocs(query(collection(db,"businesses",state.user.uid,"expenses"),orderBy("createdAt","desc")));
  state.expenses=snap.docs.map(d=>({id:d.id,...d.data()}));
  const total=state.expenses.reduce((sum,e)=>sum+Number(e.amount||0),0);
  $("stat-expenses").textContent=money(total);
  $("expense-count").textContent=`${state.expenses.length} dépense(s)`;
  $("expense-list").innerHTML=state.expenses.length
    ? state.expenses.map(e=>`<div class="cahier-list-row"><strong>${escapeHtml(e.label)}</strong><span>${money(e.amount)} • ${escapeHtml(e.note || "Dépense")}</span></div>`).join("")
    : "<p class='text-muted'>Aucune dépense enregistrée.</p>";
  updateFinancialSummary();
}

function updateFinancialSummary() {
  const revenue=state.sales.reduce((sum,s)=>sum+Number(s.amount||0),0);
  const expenses=state.expenses.reduce((sum,e)=>sum+Number(e.amount||0),0);
  $("stat-profit").textContent=money(revenue-expenses);
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
      lowStockThreshold:5,
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
    if(qty > Number(product.stock || 0)){ setStatus("Stock insuffisant pour cette vente.",true); return; }
    await addDoc(collection(db,"businesses",state.user.uid,"sales"),{
      productId, productName:product.name, quantity:qty, amount,
      createdAt:serverTimestamp()
    });
    await setDoc(doc(db,"businesses",state.user.uid,"products",productId),{
      stock:Math.max(0,Number(product.stock||0)-qty),
      updatedAt:serverTimestamp()
    },{merge:true});
    await addDoc(collection(db,"businesses",state.user.uid,"stockMoves"),{
      productId, productName:product.name, type:"sale", quantity:-qty,
      note:"Sortie liée à une vente", createdAt:serverTimestamp()
    });
    e.target.reset();
    $("sale-qty").value=1;
    await loadSales();
    setStatus("Vente enregistrée.");
  } catch(e) { setStatus("Impossible d'enregistrer la vente.",true); }
};




$("expense-form").onsubmit=async(e)=>{
  e.preventDefault();
  if(!state.user)return;
  const label=$("expense-label").value.trim();
  const amount=Number($("expense-amount").value);
  if(!label || amount<0)return;
  try {
    await addDoc(collection(db,"businesses",state.user.uid,"expenses"),{
      label, amount, note:$("expense-note").value.trim(), createdAt:serverTimestamp()
    });
    e.target.reset();
    await loadExpenses();
    setStatus("Dépense enregistrée.");
  } catch(e) { setStatus("Impossible d'enregistrer la dépense.",true); }
};

$("stock-form").onsubmit=async(e)=>{
  e.preventDefault();
  if(!state.user)return;
  const productId=$("stock-product").value;
  const product=state.products.find(p=>p.id===productId);
  const qty=Number($("stock-qty").value);
  if(!product || qty<1)return;
  try {
    await setDoc(doc(db,"businesses",state.user.uid,"products",productId),{
      stock:Number(product.stock||0)+qty,
      updatedAt:serverTimestamp()
    },{merge:true});
    await addDoc(collection(db,"businesses",state.user.uid,"stockMoves"),{
      productId, productName:product.name, type:"purchase", quantity:qty,
      note:$("stock-note").value.trim(), createdAt:serverTimestamp()
    });
    e.target.reset();
    $("stock-qty").value=1;
    await loadProducts();
    setStatus("Stock approvisionné.");
  } catch(e) { setStatus("Impossible de mettre à jour le stock.",true); }
};

$("customer-form").onsubmit=async(e)=>{
  e.preventDefault();
  if(!state.user)return;
  try {
    await addDoc(collection(db,"businesses",state.user.uid,"customers"),{
      name:$("customer-name").value.trim(),
      phone:$("customer-phone").value.trim(),
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    e.target.reset();
    await loadCustomers();
    setStatus("Client ajouté.");
  } catch(e) { setStatus("Impossible d'ajouter le client.",true); }
};

$("debt-form").onsubmit=async(e)=>{
  e.preventDefault();
  if(!state.user)return;
  const customer=state.customers.find(c=>c.id===$("debt-customer").value);
  const amount=Number($("debt-amount").value);
  if(!customer || amount<=0)return;
  try {
    await addDoc(collection(db,"businesses",state.user.uid,"debts"),{
      customerId:customer.id,
      customerName:customer.name,
      amount,
      note:$("debt-note").value.trim(),
      status:"open",
      createdAt:serverTimestamp()
    });
    e.target.reset();
    await loadDebts();
    setStatus("Crédit client enregistré.");
  } catch(e) { setStatus("Impossible d'enregistrer le crédit.",true); }
};

observeUser(async(user)=>{
  state.user=user;
  if(!user){showLogin();return;}
  try {
    showApp(user);
    await ensureBusiness(user);
    await Promise.all([loadProducts(),loadSales(),loadCustomers(),loadDebts(),loadExpenses()]);
  } catch(e) {
    setStatus("Impossible de charger votre espace Cahier de Compte.",true);
  }
});
