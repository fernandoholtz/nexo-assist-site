const modal=document.querySelector("[data-cancel-modal]");
const toast=document.querySelector("[data-account-toast]");
let snapshot=null;

function toastMessage(message){
  if(!toast)return;
  toast.textContent=message;
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"),6500);
}
function openCancel(){modal?.classList.add("open");document.body.classList.add("no-scroll");}
function closeCancel(){modal?.classList.remove("open");document.body.classList.remove("no-scroll");}
function money(cents){return (Number(cents||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function date(value){return value?new Date(value).toLocaleDateString("pt-BR"):"—";}
function bytes(value){
  const n=Number(value||0);
  if(n>=1e9)return (n/1e9).toLocaleString("pt-BR",{maximumFractionDigits:2})+" GB";
  return (n/1e6).toLocaleString("pt-BR",{maximumFractionDigits:1})+" MB";
}
function text(selector,value){const el=document.querySelector(selector);if(el)el.textContent=value;}
function bar(selector,used,limit){
  const el=document.querySelector(selector)?.closest(".quota-item")?.querySelector(".quota-bar i");
  if(el)el.style.width=Math.min(100,Math.max(0,(Number(used||0)/Math.max(1,Number(limit||1)))*100))+"%";
}
function statusLabel(status){
  return {trialing:"Teste grátis",active:"Ativa",past_due:"Pagamento pendente",canceled:"Cancelada",expired:"Expirada"}[status]||status||"—";
}
function renderBranches(entitlement){
  const row=Array.isArray(entitlement)?entitlement[0]:entitlement;
  if(!row)return;
  text("[data-branches-usage]",String(row.active_branches||0)+" de "+String(row.contracted_branches||0));
  text("[data-branch-monthly-price]",money(row.estimated_monthly_price_cents));
  const barNode=document.querySelector("[data-branches-bar]");
  if(barNode){
    const used=Number(row.active_branches||0);
    const limit=Math.max(1,Number(row.contracted_branches||1));
    barNode.style.width=Math.min(100,Math.max(0,(used/limit)*100))+"%";
  }
}

function render(data,session){
  snapshot=data;
  const usage=data.usage||{};
  const sub=data.subscription||{};
  const payments=Array.isArray(data.payments)?data.payments:[];
  text("[data-subscription-status]",statusLabel(sub.status));
  text("[data-status-value]",statusLabel(sub.status));
  text("[data-plan-name]",usage.plan_name||sub.plan_code||"Plano");
  text("[data-plan-price]",money(usage.monthly_price_cents));
  text("[data-subscription-copy]",sub.status==="trialing"?"Seu teste grátis está ativo. Você pode cancelar pelo portal antes da cobrança externa ser ativada.":"A situação exibida vem do backend da sua organização.");
  text("[data-access-date]",date(sub.trial_ends_at||sub.current_period_end||sub.access_ends_at));
  text("[data-next-payment]",date(sub.next_payment_at));
  text("[data-provider]",sub.provider==="mercado_pago"?"Mercado Pago":"Manual");
  text("[data-payment-count]",payments.length+" pagamento"+(payments.length===1?"":"s"));
  text("[data-last-payment]",payments[0]?money(payments[0].amount_cents)+" • "+payments[0].status:"Nenhum");
  text("[data-storage-usage]",bytes(usage.storage_bytes)+" de "+bytes(usage.max_storage_bytes));
  text("[data-products-usage]",String(usage.active_products||0)+" de "+String(usage.max_active_products||0));
  text("[data-members-usage]",String(usage.active_members||0)+" de "+String(usage.max_active_members||0));
  text("[data-photo-limit]","até "+String(usage.max_photos_per_service_order||0));
  text("[data-company-name]",data.organization?.name||"—");
  text("[data-account-email]",session?.email||"Mesmo login do aplicativo");
  bar("[data-storage-usage]",usage.storage_bytes,usage.max_storage_bytes);
  bar("[data-products-usage]",usage.active_products,usage.max_active_products);
  bar("[data-members-usage]",usage.active_members,usage.max_active_members);
}
async function load(){
  try{
    const session=await window.NexoApi.getSession();
    const data=await window.NexoApi.getOwnerPortalSnapshot();
    render(data,session);
    const organizationId=data?.organization?.id;
    if(organizationId){
      try{
        renderBranches(await window.NexoApi.getBranchEntitlement(organizationId));
      }catch(error){
        text("[data-branches-usage]","Não disponível");
      }
    }
  }catch(error){
    window.NexoApi.clearSession();
    window.location.href="login.html";
  }
}
document.querySelectorAll("[data-cancel-open]").forEach(b=>b.addEventListener("click",openCancel));
document.querySelectorAll("[data-cancel-close]").forEach(b=>b.addEventListener("click",closeCancel));
modal?.addEventListener("click",event=>{if(event.target===modal)closeCancel();});
document.querySelector("[data-cancel-confirm]")?.addEventListener("click",async()=>{
  const orgId=snapshot?.organization?.id;
  if(!orgId)return;
  try{
    await window.NexoApi.cancelTrialSubscription(orgId);
    closeCancel();
    toastMessage("Cancelamento do teste registrado.");
    await load();
  }catch(error){toastMessage(error instanceof Error?error.message:"Não foi possível cancelar.");}
});
document.querySelector("[data-export-backup]")?.addEventListener("click",async(event)=>{
  const button=event.currentTarget;
  const orgId=snapshot?.organization?.id;
  if(!orgId)return;

  button.disabled=true;
  const original=button.textContent;
  button.textContent="Preparando exportação...";

  try{
    const payload=await window.NexoApi.exportOrganizationOperationalData(orgId);
    const company=String(snapshot?.organization?.name||"empresa")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-zA-Z0-9]+/g,"-")
      .replace(/^-+|-+$/g,"")
      .toLowerCase()||"empresa";
    const day=new Date().toISOString().slice(0,10);
    const blob=new Blob(
      [JSON.stringify(payload,null,2)],
      {type:"application/json;charset=utf-8"}
    );
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="nexo-assist-"+company+"-"+day+".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toastMessage("Exportação operacional gerada. Guarde o arquivo em local protegido.");
  }catch(error){
    toastMessage(
      error instanceof Error
        ?error.message
        :"Não foi possível gerar a exportação."
    );
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});

document.querySelector("[data-logout]")?.addEventListener("click",event=>{
  event.preventDefault();
  window.NexoApi.signOut();
  window.location.href="login.html";
});
void load();
