const form=document.querySelector("[data-signup-form]");
if(form){
  const DRAFT_KEY="nexo_signup_draft";
  const steps=[...form.querySelectorAll(".form-step")];
  const progress=[...document.querySelectorAll(".progress-item")];
  const verification=document.querySelector("[data-signup-verification]");
  const submitButton=form.querySelector("[data-signup-submit]");
  const toast=document.querySelector("[data-toast]");
  let current=0;
  let submitting=false;
  let planCatalog=[];

  function showToast(message){
    if(!toast)return;
    toast.textContent=message;
    toast.classList.add("show");
    setTimeout(()=>toast.classList.remove("show"),6500);
  }

  function showStep(index){
    current=Math.max(0,Math.min(index,steps.length-1));
    steps.forEach((step,i)=>step.classList.toggle("active",i===current));
    progress.forEach((item,i)=>{
      item.classList.toggle("active",i===current);
      item.classList.toggle("done",i<current);
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function validateStep(){
    const required=[...steps[current].querySelectorAll("[required]")];
    for(const field of required){
      if(!field.checkValidity()){
        field.reportValidity();
        return false;
      }
    }
    const password=form.querySelector("#senha");
    const confirmation=form.querySelector("#confirmarSenha");
    if(current===1&&password&&confirmation&&password.value!==confirmation.value){
      confirmation.setCustomValidity("As senhas precisam ser iguais.");
      confirmation.reportValidity();
      confirmation.setCustomValidity("");
      return false;
    }
    return true;
  }

  function value(id){
    return String(form.querySelector("#"+id)?.value||"").trim();
  }

  function buildDraft(){
    const sameManager=form.querySelector("#responsavelGerente")?.checked!==false;
    const selectedPlan=form.querySelector('input[name="plano"]:checked')?.value||"profissional";

    return {
      target_company_name:value("nomeFantasia"),
      target_legal_name:value("razaoSocial"),
      target_cnpj:value("cnpj"),
      target_company_phone:value("telefoneEmpresa"),
      target_commercial_email:value("emailEmpresa").toLowerCase(),
      target_postal_code:value("cep"),
      target_street:value("logradouro"),
      target_street_number:value("numero"),
      target_complement:value("complemento"),
      target_neighborhood:value("bairro"),
      target_city:value("cidade"),
      target_state:value("uf").toUpperCase(),
      target_segment:value("segmento"),
      target_responsible_name:value("nomeResponsavel"),
      target_responsible_role:value("cargoResponsavel"),
      target_responsible_phone:value("telefoneResponsavel"),
      target_access_email:value("emailAcesso").toLowerCase(),
      target_manager_name:sameManager?"":value("nomeGerente"),
      target_manager_phone:sameManager?"":value("telefoneGerente"),
      target_manager_email:sameManager?"":value("emailGerente").toLowerCase(),
      target_plan_code:selectedPlan,
      target_plan_conditions_accepted:Boolean(form.querySelector("#aceiteCondicoesPlano")?.checked),
      target_truth_declaration_accepted:Boolean(form.querySelector("#declaracaoVerdade")?.checked),
      target_branch_count:Math.max(1,Math.min(10,Number(value("quantidadeUnidades"))||1)),
    };
  }

  function saveDraft(draft){
    sessionStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
  }

  function readDraft(){
    try{return JSON.parse(sessionStorage.getItem(DRAFT_KEY)||"null");}
    catch{return null;}
  }

  function showVerification(draft){
    form.hidden=true;
    verification.hidden=false;
    const copy=verification.querySelector("[data-verification-copy]");
    if(copy&&draft?.target_access_email){
      copy.textContent="Enviamos a confirmação para "+draft.target_access_email+". Depois de clicar no link recebido, volte aqui e toque em “Já confirmei meu e-mail”.";
    }
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function finishBootstrap(){
    const draft=readDraft();
    if(!draft){
      showToast("O rascunho do cadastro não foi encontrado. Preencha o formulário novamente.");
      form.hidden=false;
      verification.hidden=true;
      return;
    }

    const button=verification.querySelector("[data-verify-finish]");
    button.disabled=true;
    button.textContent="Verificando...";

    try{
      const result=await window.NexoApi.bootstrapCompanyWithBranches(draft);
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.setItem("nexo_onboarding_result",JSON.stringify(Array.isArray(result)?result[0]:result));
      showToast("Empresa criada e registrada. Seu período de 14 dias começou.");
      setTimeout(()=>window.location.href="conta.html",900);
    }catch(error){
      showToast(error instanceof Error?error.message:"Não foi possível concluir o cadastro.");
    }finally{
      button.disabled=false;
      button.textContent="Já confirmei meu e-mail";
    }
  }

  form.querySelectorAll("[data-next]").forEach(button=>{
    button.addEventListener("click",()=>{if(validateStep())showStep(current+1);});
  });
  form.querySelectorAll("[data-prev]").forEach(button=>{
    button.addEventListener("click",()=>showStep(current-1));
  });


  function formatMoney(cents){
    return (Number(cents||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  }

  function updateBranchPrice(){
    const selected=form.querySelector('input[name="plano"]:checked')?.value||"profissional";
    const units=Math.max(1,Math.min(10,Number(value("quantidadeUnidades"))||1));
    const plan=planCatalog.find(item=>item.code===selected);
    const totalNode=document.querySelector("[data-branch-price-total]");
    const copyNode=document.querySelector("[data-branch-price-copy]");
    if(!totalNode||!copyNode)return;

    if(!plan){
      totalNode.textContent="Simulação indisponível";
      copyNode.textContent=units+" unidade(s) informada(s).";
      return;
    }

    const included=Number(plan.included_branches||1);
    const addon=Number(plan.additional_branch_price_cents||0);
    const base=Number(plan.monthly_price_cents||0);
    const extras=Math.max(0,units-included);
    const total=base+(extras*addon);
    totalNode.textContent=formatMoney(total)+"/mês";
    copyNode.textContent=units+" unidade(s) • base "+formatMoney(base)+" + "+extras+" adicional(is) de "+formatMoney(addon)+".";
  }

  async function loadPlanCatalog(){
    try{
      const result=await window.NexoApi.getPublicPlanCatalog();
      planCatalog=Array.isArray(result)?result:[];
      updateBranchPrice();
    }catch{
      planCatalog=[];
      updateBranchPrice();
    }
  }

  form.querySelectorAll('input[name="plano"]').forEach(input=>input.addEventListener("change",updateBranchPrice));
  form.querySelector("#quantidadeUnidades")?.addEventListener("input",updateBranchPrice);
  void loadPlanCatalog();


  const selectedPlan=localStorage.getItem("nexo_plan");
  if(selectedPlan){
    const radio=form.querySelector('input[name="plano"][value="'+selectedPlan+'"]');
    if(radio)radio.checked=true;
  }

  const sameManager=form.querySelector("#responsavelGerente");
  const managerFields=document.querySelector("[data-manager-fields]");
  function syncManager(){
    if(!sameManager||!managerFields)return;
    managerFields.hidden=sameManager.checked;
    managerFields.querySelectorAll("input").forEach(input=>{
      input.required=!sameManager.checked&&input.dataset.required==="true";
    });
  }
  sameManager?.addEventListener("change",syncManager);
  syncManager();

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(submitting||!validateStep())return;

    const password=value("senha");
    const draft=buildDraft();
    submitting=true;
    submitButton.disabled=true;
    submitButton.textContent="Criando conta...";

    try{
      const session=await window.NexoApi.signUp(draft.target_access_email,password);
      saveDraft(draft);
      await window.NexoApi.sendEmailVerification(session.idToken);
      form.querySelector("#senha").value="";
      form.querySelector("#confirmarSenha").value="";
      showVerification(draft);
      showToast("Conta criada. Confirme o e-mail para ativar a empresa.");
    }catch(error){
      showToast(error instanceof Error?error.message:"Não foi possível criar a conta.");
    }finally{
      submitting=false;
      submitButton.disabled=false;
      submitButton.textContent="Enviar confirmação de e-mail";
    }
  });

  verification?.querySelector("[data-verify-finish]")?.addEventListener("click",()=>void finishBootstrap());
  verification?.querySelector("[data-verify-resend]")?.addEventListener("click",async()=>{
    try{
      const session=await window.NexoApi.getSession({forceRefresh:true});
      await window.NexoApi.sendEmailVerification(session.idToken);
      showToast("E-mail de confirmação reenviado.");
    }catch(error){
      showToast(error instanceof Error?error.message:"Não foi possível reenviar a confirmação.");
    }
  });

  const pending=readDraft();
  if(pending){
    window.NexoApi.getSession()
      .then(()=>showVerification(pending))
      .catch(()=>sessionStorage.removeItem(DRAFT_KEY));
  }
}
