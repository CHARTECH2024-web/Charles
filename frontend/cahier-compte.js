import { auth, db } from "./firebase-config.js";
import { loginUserWithGoogle, logoutUser, observeUser } from "./auth.js";
import {
  doc, getDoc, setDoc, addDoc, collection, query, orderBy, getDocs, runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const state = { user:null, products:[], sales:[], customers:[], debts:[], stockMoves:[], expenses:[], debtPayments:[], losses:[] };

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
  const today=new Date(); today.setHours(0,0,0,0);
  const expiring=state.products.filter(p=>p.expiryDate && !Number.isNaN(Date.parse(p.expiryDate)) && (new Date(p.expiryDate+"T00:00:00")-today)/(24*60*60*1000)<=30 && new Date(p.expiryDate+"T00:00:00")>=today);
  const expired=state.products.filter(p=>p.expiryDate && !Number.isNaN(Date.parse(p.expiryDate)) && new Date(p.expiryDate+"T00:00:00")<today);
  $("stat-low-stock").textContent=low.length;
  const alerts=[...expired.map(p=>({p,label:"EXPIRÉ"})),...expiring.map(p=>({p,label:"Expire bientôt"})),...low.map(p=>({p,label:"Stock faible"}))];
  $("low-stock-list").innerHTML=alerts.length
    ? alerts.map(({p,label})=>`<div class="cahier-list-row"><strong>${escapeHtml(p.name)} — ${label}</strong><span>Stock: ${Number(p.stock||0)} • Seuil: ${Number(p.lowStockThreshold ?? 5)}${p.expiryDate ? " • Expiration: "+escapeHtml(p.expiryDate) : ""}</span></div>`).join("")
    : "<p class='text-muted'>Aucune alerte de stock ou d'expiration.</p>";
  $("product-count").textContent=`${state.products.length} produit(s)`;
  $("product-list").innerHTML=state.products.length
    ? state.products.map(p=>`<div class="cahier-list-row"><strong>${escapeHtml(p.name)}</strong><span>Achat: ${money(p.costPrice)} • Vente: ${money(p.price)} • Stock: ${Number(p.stock||0)}${p.manufactureDate ? " • Fab.: "+escapeHtml(p.manufactureDate) : ""}${p.expiryDate ? " • Exp.: "+escapeHtml(p.expiryDate) : ""}</span></div>`).join("")
    : "<p class='text-muted'>Aucun produit pour le moment.</p>";
  $("sale-product").innerHTML='<option value="">Sélectionner</option>' +
    state.products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  $("stock-product").innerHTML='<option value="">Sélectionner</option>' +
    state.products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if($("loss-product")) $("loss-product").innerHTML='<option value="">Sélectionner</option>'+state.products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} (stock ${Number(p.stock||0)})</option>`).join("");
}

async function loadSales() {
  const snap=await getDocs(query(collection(db,"businesses",state.user.uid,"sales"),orderBy("createdAt","desc")));
  state.sales=snap.docs.map(d=>({id:d.id,...d.data()}));
  const total=state.sales.reduce((sum,s)=>sum+Number(s.amount||0),0);
  $("stat-sales").textContent=money(total);
  updateFinancialSummary();
  updateReport();
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
  const [debtSnap,paySnap]=await Promise.all([
    getDocs(query(collection(db,"businesses",state.user.uid,"debts"),orderBy("createdAt","desc"))),
    getDocs(query(collection(db,"businesses",state.user.uid,"debtPayments"),orderBy("createdAt","desc")))
  ]);
  state.debts=debtSnap.docs.map(d=>({id:d.id,...d.data()}));
  state.debtPayments=paySnap.docs.map(d=>({id:d.id,...d.data()}));
  const paidByDebt={};
  state.debtPayments.forEach(p=>{paidByDebt[p.debtId]=(paidByDebt[p.debtId]||0)+Number(p.amount||0);});
  state.debts=state.debts.map(d=>{
    const paid=Math.min(Number(d.amount||0),paidByDebt[d.id]||0);
    return {...d,paid,remaining:Math.max(0,Number(d.amount||0)-paid)};
  });
  const outstanding=state.debts.reduce((sum,d)=>sum+d.remaining,0);
  const paidTotal=state.debtPayments.reduce((sum,p)=>sum+Number(p.amount||0),0);
  $("stat-debts").textContent=money(outstanding);
  $("stat-debt-paid").textContent=money(paidTotal);
  $("debt-list").innerHTML=state.debts.length
    ? state.debts.map(d=>`<div class="cahier-list-row"><strong>${escapeHtml(d.customerName)}</strong><span>Dette: ${money(d.amount)} • Payé: ${money(d.paid)} • Reste: ${money(d.remaining)} • ${d.remaining===0?"Réglé":"Ouvert"}</span></div>`).join("")
    : "<p class='text-muted'>Aucun crédit enregistré.</p>";
  $("payment-debt").innerHTML='<option value="">Sélectionner</option>' +
    state.debts.filter(d=>d.remaining>0).map(d=>`<option value="${d.id}">${escapeHtml(d.customerName)} — reste ${money(d.remaining)}</option>`).join("");
  $("debt-payment-list").innerHTML=state.debtPayments.length
    ? state.debtPayments.map(p=>`<div class="cahier-list-row"><strong>${escapeHtml(p.customerName)}</strong><span>+${money(p.amount)} • ${escapeHtml(p.note||"Paiement")}</span></div>`).join("")
    : "<p class='text-muted'>Aucun paiement de crédit.</p>";
  updateReport();
}


async function loadLosses() {
  const snap=await getDocs(query(collection(db,"businesses",state.user.uid,"losses"),orderBy("createdAt","desc")));
  state.losses=snap.docs.map(d=>({id:d.id,...d.data()}));
  const total=state.losses.reduce((sum,x)=>sum+Number(x.totalCost||0),0);
  if($("stat-losses")) $("stat-losses").textContent=money(total);
  if($("loss-list")) $("loss-list").innerHTML=state.losses.length ? state.losses.map(x=>"<div class=\"cahier-list-row\"><strong>"+escapeHtml(x.productName)+" — "+escapeHtml(x.reason)+"</strong><span>"+Number(x.quantity||0)+" unité(s) • "+money(x.totalCost)+" • "+escapeHtml(x.note||"")+"</span></div>").join("") : "<p class=\"text-muted\">Aucune perte enregistrée.</p>";
  updateFinancialSummary();
  updateReport();
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

function timestampMs(item) {
  return item.createdAt?.toMillis?.() || 0;
}

function inReportPeriod(item, period) {
  if(period==="all") return true;
  const t=timestampMs(item);
  if(!t) return true;
  const now=Date.now();
  if(period==="today") {
    const d=new Date(t), n=new Date(now);
    return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
  }
  return t >= now - Number(period)*24*60*60*1000;
}

function updateReport() {
  const period=$("report-period")?.value || "all";
  const sales=state.sales.filter(x=>inReportPeriod(x,period));
  const expenses=state.expenses.filter(x=>inReportPeriod(x,period));
  const debts=state.debts.filter(x=>inReportPeriod(x,period));
  const payments=state.debtPayments.filter(x=>inReportPeriod(x,period));
  const revenue=sales.reduce((s,x)=>s+Number(x.amount||0),0);
  const expenseTotal=expenses.reduce((s,x)=>s+Number(x.amount||0),0);
  const debtTotal=debts.reduce((s,x)=>s+Number(x.amount||0),0);
  const paymentTotal=payments.reduce((s,x)=>s+Number(x.amount||0),0);
  $("report-sales").textContent=money(revenue);
  $("report-expenses").textContent=money(expenseTotal);
  $("report-debts").textContent=money(debtTotal);
  $("report-payments").textContent=money(paymentTotal);
  const knownSales=sales.filter(x=>typeof x.costTotal==="number");
  const grossProfit=knownSales.reduce((sum,x)=>sum+Number(x.amount||0)-Number(x.costTotal||0),0);
  const lossTotal=(state.losses||[]).filter(x=>inReportPeriod(x,period)).reduce((sum,x)=>sum+Number(x.totalCost||0),0);
  $("report-profit").textContent=knownSales.length ? money(grossProfit-expenseTotal-lossTotal) : "Coûts à renseigner";
  if ($("report-losses")) $("report-losses").textContent=money(lossTotal);
  if ($("report-gross-profit")) $("report-gross-profit").textContent=knownSales.length ? money(grossProfit) : "Non calculable";
  const rows=[
    ...sales.map(x=>({t:timestampMs(x),label:"Vente",value:x.amount,detail:x.productName})),
    ...expenses.map(x=>({t:timestampMs(x),label:"Dépense",value:-x.amount,detail:x.label})),
    ...payments.map(x=>({t:timestampMs(x),label:"Paiement crédit",value:x.amount,detail:x.customerName}))
  ].sort((a,b)=>b.t-a.t).slice(0,50);
  $("report-history").innerHTML=rows.length
    ? rows.map(x=>`<div class="cahier-list-row"><strong>${escapeHtml(x.label)}</strong><span>${x.value>=0?"+":""}${money(x.value)} • ${escapeHtml(x.detail||"")}</span></div>`).join("")
    : "<p class='text-muted'>Aucune opération sur cette période.</p>";
}

function updateFinancialSummary() {
  const revenue=state.sales.reduce((sum,s)=>sum+Number(s.amount||0),0);
  const expenses=state.expenses.reduce((sum,e)=>sum+Number(e.amount||0),0);
  const knownSales=state.sales.filter(s=>typeof s.costTotal==="number");
  const gross=knownSales.reduce((sum,s)=>sum+Number(s.amount||0)-Number(s.costTotal||0),0);
  const losses=(state.losses||[]).reduce((sum,l)=>sum+Number(l.totalCost||0),0);
  $("stat-profit").textContent=knownSales.length ? money(gross-expenses-losses) : "Coûts à renseigner";
  renderBusinessInsights();
}

function renderBusinessInsights(){
  const el=$("business-insights"); if(!el)return;
  const low=state.products.filter(p=>Number(p.stock||0)<=Number(p.lowStockThreshold??5));
  const messages=[];
  if(low.length) messages.push("⚠️ Stock faible : vérifiez "+low.slice(0,3).map(p=>escapeHtml(p.name)).join(", ")+".");
  const now=Date.now(), week=7*24*60*60*1000;
  const dated=state.sales.filter(s=>timestampMs(s)>0);
  const sums=[2,1,0].map(o=>dated.filter(s=>timestampMs(s)>=now-(o+1)*week&&timestampMs(s)<now-o*week).reduce((sum,s)=>sum+Number(s.amount||0),0));
  if(sums.every(v=>v>0)&&sums[0]>sums[1]&&sums[1]>sums[2]){
    const byProduct={}; dated.filter(s=>timestampMs(s)>=now-3*week).forEach(s=>{const k=s.productName||"Produit";byProduct[k]=(byProduct[k]||0)+Number(s.amount||0);});
    const top=Object.entries(byProduct).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
    messages.push("📉 Les ventes baissent depuis trois semaines. Vérifiez le stock des produits les plus vendus : "+(top.map(escapeHtml).join(", ")||"données insuffisantes")+".");
  }
  if(state.sales.some(s=>typeof s.costTotal!=="number")) messages.push("💡 Certaines ventes anciennes ne disposent pas de coût d’achat enregistré : leur bénéfice exact reste inconnu.");
  if(!messages.length) messages.push("✅ Pas d’alerte évidente dans les données disponibles. Continuez à enregistrer ventes, achats et pertes.");
  el.innerHTML=messages.map(m=>"<p class=\"cahier-insight\">"+m+"</p>").join("");
  renderSalesChart();
}
function renderSalesChart(){
  const el=$("sales-chart"); if(!el)return;
  const now=Date.now(), week=7*24*60*60*1000;
  const vals=[5,4,3,2,1,0].map(o=>state.sales.filter(s=>timestampMs(s)>=now-(o+1)*week&&timestampMs(s)<now-o*week).reduce((sum,s)=>sum+Number(s.amount||0),0));
  const max=Math.max.apply(null,vals.concat([1])), w=600,h=180,p=24;
  const points=vals.map((v,i)=>(p+i*(w-2*p)/5)+","+(h-p-(v/max)*(h-2*p))).join(" ");
  const labels=["S-5","S-4","S-3","S-2","S-1","Cette sem."];
  let marks="";
  vals.forEach((v,i)=>{const x=p+i*(w-2*p)/5,y=h-p-(v/max)*(h-2*p);marks+="<circle cx=\""+x+"\" cy=\""+y+"\" r=\"5\" fill=\"var(--accent,#f4c430)\"><title>"+labels[i]+" : "+money(v)+"</title></circle><text x=\""+x+"\" y=\""+(h-4)+"\" text-anchor=\"middle\" font-size=\"12\" fill=\"currentColor\">"+labels[i]+"</text>";});
  el.innerHTML="<svg viewBox=\"0 0 "+w+" "+h+"\" role=\"img\" aria-label=\"Évolution des ventes sur six semaines\" style=\"width:100%;height:auto\"><line x1=\""+p+"\" y1=\""+(h-p)+"\" x2=\""+(w-p)+"\" y2=\""+(h-p)+"\" stroke=\"currentColor\" opacity=\".3\"/><polyline points=\""+points+"\" fill=\"none\" stroke=\"var(--accent,#f4c430)\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"+marks+"</svg><p class=\"text-muted\">Ventes par semaine • "+vals.map(money).join(" · ")+"</p>";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function authErrorMessage(error) {
  const code=error?.code || "";
  if(code==="auth/unauthorized-domain" || code==="auth/unauthorized-continue-uri") {
    const host = window.location.hostname;
    return "Firebase refuse ce domaine (" + host + "). Il est déjà prévu pour Charles ; vérifiez maintenant la clé API Web/Browser key du projet et ses restrictions de domaine, puis rechargez la page.";
  }
  if(code==="auth/invalid-api-key" || code==="auth/api-key-not-valid") {
    return "La clé API Firebase utilisée par Charles n'est pas valide pour cette application. Vérifiez la clé Web du projet Firebase.";
  }
  if(code==="auth/popup-blocked") return "Le navigateur bloque la fenêtre Google. Charles va utiliser la connexion par redirection.";
  if(code==="auth/popup-closed-by-user") return "La fenêtre Google a été fermée avant la fin de la connexion.";
  if(code==="auth/network-request-failed") return "Connexion réseau impossible. Vérifiez votre connexion Internet puis réessayez.";
  if(code==="auth/operation-not-allowed") return "La connexion Google n'est pas activée dans Firebase Authentication.";
  return "Connexion Google impossible (" + (code || "erreur inconnue") + "). Réessayez.";
}

$("cahier-login-btn").onclick=async()=>{
  const btn=$("cahier-login-btn"); btn.disabled=true; $("cahier-login-error").hidden=true;
  try { await loginUserWithGoogle(); }
  catch(e) { console.error("Cahier de Compte Google login:",e); $("cahier-login-error").hidden=false; $("cahier-login-error").textContent=authErrorMessage(e); btn.disabled=false; }
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
    const manufactureDate=$("product-manufacture-date").value;
    const expiryDate=$("product-expiry-date").value;
    if(manufactureDate && expiryDate && expiryDate < manufactureDate) {
      setStatus("La date d'expiration ne peut pas précéder la date de fabrication.",true);
      return;
    }
    await addDoc(collection(db,"businesses",state.user.uid,"products"),{
      name:$("product-name").value.trim(),
      costPrice:Number($("product-cost").value),
      price:Number($("product-price").value),
      stock:Number($("product-stock").value),
      manufactureDate:manufactureDate || "",
      expiryDate:expiryDate || "",
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
    const productRef=doc(db,"businesses",state.user.uid,"products",productId);
    const saleRef=doc(collection(db,"businesses",state.user.uid,"sales"));
    const stockMoveRef=doc(collection(db,"businesses",state.user.uid,"stockMoves"));
    await runTransaction(db,async(tx)=>{
      const freshProduct=await tx.get(productRef);
      if(!freshProduct.exists()) throw new Error("Produit introuvable");
      const fresh=freshProduct.data();
      const currentStock=Number(fresh.stock || 0);
      if(qty > currentStock) throw new Error("Stock insuffisant");
      tx.update(productRef,{
        stock:currentStock-qty,
        lastStockMoveId:stockMoveRef.id,
        updatedAt:serverTimestamp()
      });
      const costKnown=typeof fresh.costPrice==="number" && Number.isFinite(fresh.costPrice);
      const unitCost=costKnown ? fresh.costPrice : null;
      const costTotal=costKnown ? qty*unitCost : null;
      tx.set(saleRef,{
        productId, productName:fresh.name || product.name, quantity:qty, amount,
        costKnown, ...(costKnown ? {unitCost,costTotal,grossProfit:amount-costTotal} : {}),
        stockMoveId:stockMoveRef.id,
        createdAt:serverTimestamp()
      });
      tx.set(stockMoveRef,{
        productId, productName:fresh.name || product.name, type:"sale", quantity:-qty,
        saleId:saleRef.id,
        ...(costKnown?{unitCost,totalCost:costTotal}:{}), note:"Sortie liée à une vente", createdAt:serverTimestamp()
      });
    });
    e.target.reset();
    $("sale-qty").value=1;
    await Promise.all([loadProducts(), loadSales()]);
    setStatus("Vente enregistrée.");
  } catch(e) {
    const message=e.message==="Stock insuffisant" ? "Stock insuffisant pour cette vente." : "Impossible d'enregistrer la vente.";
    setStatus(message,true);
  }
};




$("loss-form").onsubmit=async(e)=>{
  e.preventDefault(); if(!state.user)return;
  const productId=$("loss-product").value, product=state.products.find(p=>p.id===productId);
  const qty=Number($("loss-qty").value), reason=$("loss-reason").value, note=$("loss-note").value.trim();
  if(!product || !Number.isInteger(qty) || qty<1){setStatus("Choisissez un produit et une quantité valide.",true);return;}
  try {
    const productRef=doc(db,"businesses",state.user.uid,"products",productId);
    const lossRef=doc(collection(db,"businesses",state.user.uid,"losses"));
    const moveRef=doc(collection(db,"businesses",state.user.uid,"stockMoves"));
    await runTransaction(db,async(tx)=>{
      const snap=await tx.get(productRef); if(!snap.exists())throw new Error("Produit introuvable");
      const fresh=snap.data(), stock=Number(fresh.stock||0); if(qty>stock)throw new Error("Stock insuffisant");
      const costKnown=typeof fresh.costPrice==="number" && Number.isFinite(fresh.costPrice);
      const unitCost=costKnown?fresh.costPrice:0, totalCost=qty*unitCost;
      tx.update(productRef,{stock:stock-qty,lastStockMoveId:moveRef.id,updatedAt:serverTimestamp()});
      tx.set(lossRef,{productId:productId,productName:fresh.name||product.name,quantity:qty,unitCost:unitCost,totalCost:totalCost,costKnown:costKnown,reason:reason,note:note,stockMoveId:moveRef.id,createdAt:serverTimestamp()});
      tx.set(moveRef,{productId:productId,productName:fresh.name||product.name,type:"loss",quantity:-qty,lossId:lossRef.id,unitCost:unitCost,totalCost:totalCost,note:reason+(note?": "+note:""),createdAt:serverTimestamp()});
    });
    e.target.reset(); $("loss-qty").value=1;
    await Promise.all([loadProducts(),loadLosses()]); setStatus("Perte enregistrée et stock mis à jour.");
  } catch(err){setStatus(err.message==="Stock insuffisant"?"La perte dépasse le stock disponible.":"Échec de sauvegarde de la perte.",true);}
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
  const costRaw=$("stock-unit-cost")?.value ?? "";
  const purchaseUnitCost=costRaw==="" ? null : Number(costRaw);
  if(!product || qty<1 || (purchaseUnitCost!==null && (!Number.isFinite(purchaseUnitCost)||purchaseUnitCost<0)))return;
  try {
    const productRef=doc(db,"businesses",state.user.uid,"products",productId);
    const stockMoveRef=doc(collection(db,"businesses",state.user.uid,"stockMoves"));
    await runTransaction(db,async(tx)=>{
      const freshSnap=await tx.get(productRef);
      if(!freshSnap.exists()) throw new Error("Produit introuvable");
      const fresh=freshSnap.data();
      const oldStock=Number(fresh.stock||0);
      const update={stock:oldStock+qty,lastStockMoveId:stockMoveRef.id,updatedAt:serverTimestamp()};
      if(purchaseUnitCost!==null){const oldCost=typeof fresh.costPrice==="number"?fresh.costPrice:purchaseUnitCost;update.costPrice=oldStock>0?((oldStock*oldCost)+(qty*purchaseUnitCost))/(oldStock+qty):purchaseUnitCost;}
      tx.update(productRef,update);
      tx.set(stockMoveRef,{productId,productName:fresh.name||product.name,type:"purchase",quantity:qty,...(purchaseUnitCost!==null?{unitCost:purchaseUnitCost,totalCost:qty*purchaseUnitCost}:{}),note:$("stock-note").value.trim(),createdAt:serverTimestamp()});
    });
    e.target.reset();
    $("stock-qty").value=1;
    await loadProducts();
    setStatus("Stock approvisionné.");
  } catch(e) { setStatus("Impossible de mettre à jour le stock.",true); }
};

$("debt-payment-form").onsubmit=async(e)=>{
  e.preventDefault();
  if(!state.user)return;
  const debt=state.debts.find(d=>d.id===$("payment-debt").value);
  const amount=Number($("payment-amount").value);
  if(!debt || amount<=0)return;
  if(amount>debt.remaining){setStatus("Le paiement dépasse le reste à payer.",true);return;}
  try {
    const debtRef=doc(db,"businesses",state.user.uid,"debts",debt.id);
    const paymentRef=doc(collection(db,"businesses",state.user.uid,"debtPayments"));
    await runTransaction(db,async(tx)=>{
      const fresh=await tx.get(debtRef);
      if(!fresh.exists()) throw new Error("Dette introuvable");
      const current=fresh.data();
      const remaining=Number(current.amount||0)-Number(current.paidAmount||0);
      if(amount>remaining) throw new Error("Paiement supérieur au solde");
      const newPaid=Number(current.paidAmount||0)+amount;
      tx.update(debtRef,{paidAmount:newPaid,status:newPaid>=Number(current.amount||0)?"paid":"partial",lastPaymentId:paymentRef.id,updatedAt:serverTimestamp()});
      tx.set(paymentRef,{debtId:debt.id,customerId:debt.customerId,customerName:debt.customerName,amount,note:$("payment-note").value.trim(),createdAt:serverTimestamp()});
    });
    e.target.reset();
    await loadDebts();
    setStatus("Paiement enregistré.");
  } catch(e){setStatus(e.message==="Paiement supérieur au solde"?"Le paiement dépasse le reste à payer.":"Impossible d'enregistrer le paiement.",true);}
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
      paidAmount:0,
      note:$("debt-note").value.trim(),
      status:"open",
      createdAt:serverTimestamp()
    });
    e.target.reset();
    await loadDebts();
    setStatus("Crédit client enregistré.");
  } catch(e) { setStatus("Impossible d'enregistrer le crédit.",true); }
};

$("report-period").onchange=updateReport;
$("report-refresh").onclick=updateReport;


function setupCahierNavigation(){
  const app=$("cahier-app");
  if(!app || $("cahier-bottom-nav")) return;
  const definitions=[
    {id:"home",label:"Accueil",icon:'<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>'},
    {id:"sales",label:"Ventes",icon:'<path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'},
    {id:"stock",label:"Stock",icon:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/>'},
    {id:"ledger",label:"Cahier",icon:'<path d="M5 3h13a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 17h15M9 7h7M9 11h7"/><path d="M3 6v13a2 2 0 0 0 2 2"/>'},
    {id:"reports",label:"Rapports",icon:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'},
    {id:"more",label:"Plus",icon:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'}
  ];
  const panelsRoot=document.createElement("div");
  panelsRoot.className="cahier-tab-panels";
  panelsRoot.id="cahier-tab-panels";
  const firstContent=app.querySelector(".cahier-topbar");
  app.insertBefore(panelsRoot,firstContent||app.firstChild);
  const panels={};
  definitions.forEach(item=>{
    const panel=document.createElement("div");
    panel.className="cahier-tab-panel";
    panel.dataset.tabPanel=item.id;
    panel.hidden=item.id!=="home";
    panels[item.id]=panel;
    panelsRoot.appendChild(panel);
  });
  const move=(node,panelId)=>{if(node)panels[panelId].appendChild(node);};
  move(app.querySelector(".cahier-topbar"),"home");
  move(app.querySelector(":scope > .cahier-grid"),"home");
  const cardFor=id=>$(id)?.closest("section.cahier-card");
  move(cardFor("sale-form"),"sales");
  ["product-form","stock-form","loss-form","product-list"].forEach(id=>move(cardFor(id),"stock"));
  ["customer-form","debt-form","debt-payment-form","expense-form"].forEach(id=>move(cardFor(id),"ledger"));
  move(cardFor("report-period"),"reports");
  move(cardFor("business-form"),"more");
  app.querySelectorAll(".cahier-columns").forEach(wrapper=>{
    if(!wrapper.querySelector("section,form,article")) wrapper.remove();
  });
  const nav=document.createElement("nav");
  nav.className="cahier-bottom-nav";
  nav.id="cahier-bottom-nav";
  nav.setAttribute("aria-label","Navigation du Cahier de Compte");
  definitions.forEach(item=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="cahier-tab";
    button.dataset.tab=item.id;
    button.setAttribute("aria-controls","cahier-tab-panels");
    button.setAttribute("aria-label",item.label);
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+item.icon+'</svg><span>'+item.label+'</span>';
    button.addEventListener("click",()=>{
      Object.entries(panels).forEach(([id,panel])=>{panel.hidden=id!==item.id;});
      nav.querySelectorAll(".cahier-tab").forEach(tab=>{
        if(tab.dataset.tab===item.id) tab.setAttribute("aria-current","page");
        else tab.removeAttribute("aria-current");
      });
      if(item.id!=="home") panels[item.id].scrollIntoView({block:"start",behavior:"smooth"});
      else window.scrollTo({top:0,behavior:"smooth"});
    });
    if(item.id==="home") button.setAttribute("aria-current","page");
    nav.appendChild(button);
  });
  app.appendChild(nav);
}

observeUser(async(user)=>{
  state.user=user;
  if(!user){showLogin();return;}
  try {
    showApp(user);
    setupCahierNavigation();
    await ensureBusiness(user);
    await Promise.all([loadProducts(),loadSales(),loadCustomers(),loadDebts(),loadExpenses(),loadLosses()]);
  } catch(e) {
    setStatus("Impossible de charger votre espace Cahier de Compte.",true);
  }
});
