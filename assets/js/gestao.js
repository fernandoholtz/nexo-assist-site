(() => {
  const loginSection=document.querySelector("[data-admin-login]");
  const appSection=document.querySelector("[data-admin-app]");
  const loginForm=document.querySelector("[data-admin-login-form]");
  const loginButton=document.querySelector("[data-admin-login-button]");
  const logoutButton=document.querySelector("[data-admin-logout]");
  const refreshButton=document.querySelector("[data-admin-refresh]");
  const metrics=document.querySelector("[data-admin-metrics]");
  const list=document.querySelector("[data-admin-companies-list]");
  const detail=document.querySelector("[data-admin-detail]");
  const plans=document.querySelector("[data-admin-plans]");
  const search=document.querySelector("#adminSearch");
  const toast=document.querySelector("[data-admin-toast]");
  let dashboard=null;

  function showToast(message){
    if(!toast)return;
    toast.textContent=String(message||"");
    toast.classList.add("show");
    setTimeout(()=>toast.classList.remove("show"),5000);
  }

  function money(cents){
    return (Number(cents||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  }

  function clear(node){
    while(node?.firstChild)node.removeChild(node.firstChild);
  }

  function el(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }

  function addDataRow(parent,label,value){
    const row=el("div","account-data-row");
    row.append(el("span","",label),el("strong","",value));
    parent.append(row);
  }

  function buildField(label,value,options={}){
    const wrap=el("div","field");
    const labelNode=el("label","",label);
    const input=el(options.multiline?"textarea":"input");
    if(!options.multiline)input.type=options.type||"text";
    input.value=String(value??"");
    if(options.placeholder)input.placeholder=options.placeholder;
    if(options.required)input.required=true;
    if(options.maxLength)input.maxLength=options.maxLength;
    wrap.append(labelNode,input);
    return {wrap,input};
  }

  function renderMetrics(summary={}){
    clear(metrics);
    const cards=[
      ["Empresas",summary.organizations_total||0],
      ["Ativas",summary.organizations_active||0],
      ["Produção",summary.organizations_production||0],
      ["Teste",summary.organizations_test||0],
      ["Filiais ativas",summary.branches_active||0],
      ["Usuários ativos",summary.members_active||0],
    ];

    cards.forEach(([label,value])=>{
      const card=el("div","admin-metric");
      card.append(el("span","",label),el("strong","",value));
      metrics.append(card);
    });
  }

  function renderCompanies(){
    clear(list);
    const q=String(search?.value||"").trim().toLowerCase();
    const rows=(dashboard?.organizations||[]).filter(item=>
      !q||[item.name,item.plan_code,item.environment,item.subscription_status]
        .some(value=>String(value||"").toLowerCase().includes(q))
    );

    if(rows.length===0){
      list.append(el("p","account-copy","Nenhuma empresa encontrada."));
      return;
    }

    rows.forEach(item=>{
      const button=el("button","admin-company-row");
      button.type="button";
      button.dataset.orgId=String(item.id||"");

      const left=el("span");
      left.append(
        el("strong","",item.name||"Empresa"),
        el("small","",(item.plan_code||"sem plano")+" • "+(item.environment||"production"))
      );

      const right=el("span");
      right.append(
        el("b","",(item.active_branches||0)+"/"+(item.contracted_branches||1)),
        el("small","","unidades")
      );

      button.append(left,right);
      button.addEventListener("click",()=>void openOrganization(button.dataset.orgId));
      list.append(button);
    });
  }

  function renderPlans(){
    clear(plans);

    (dashboard?.plans||[]).forEach(plan=>{
      const row=el("div","admin-plan-row");
      const copy=el("div");
      copy.append(
        el("strong","",plan.name||plan.code||"Plano"),
        el("small","",
          "Base "+money(plan.monthly_price_cents)+
          " • "+String(plan.included_branches||1)+" unidade incluída"
        )
      );

      const form=el("form");
      form.dataset.planForm=String(plan.code||"");
      const input=el("input");
      input.type="number";
      input.min="0";
      input.step="1";
      input.value=String(Number(plan.additional_branch_price_cents||0)/100);
      input.setAttribute("aria-label","Valor adicional da filial");

      const button=el("button","btn btn-secondary","Salvar adicional");
      button.type="submit";
      form.append(input,button);

      form.addEventListener("submit",async event=>{
        event.preventDefault();
        const reason=window.prompt("Motivo da alteração de preço:");
        if(!reason)return;

        try{
          await window.NexoApi.platformUpdateBranchPricing(
            form.dataset.planForm,
            Math.round(Number(input.value||0)*100),
            reason,
          );
          showToast("Preço de filial atualizado e auditado.");
          await loadDashboard();
        }catch(error){
          showToast(error instanceof Error?error.message:"Não foi possível atualizar.");
        }
      });

      row.append(copy,form);
      plans.append(row);
    });
  }

  async function openOrganization(id){
    clear(detail);
    detail.append(el("p","account-copy","Carregando empresa..."));

    try{
      const data=await window.NexoApi.getPlatformOrganizationDetail(id);
      const org=data?.organization||{};
      const sub=data?.subscription||{};
      const plan=data?.plan||{};
      const usage=data?.usage||{};
      const profile=data?.profile||null;
      const branches=Array.isArray(data?.branches)?data.branches:[];

      clear(detail);
      detail.append(
        el("span","card-kicker",org.environment==="test"?"AMBIENTE DE TESTE":"EMPRESA"),
        el("h3","",org.name||"Empresa")
      );

      addDataRow(detail,"Status",org.active?"Ativa":"Suspensa");
      addDataRow(detail,"Plano",plan.name||org.plan_code||"—");
      const contracted=Number(sub.contracted_branches||1);
      const included=Number(plan.included_branches||1);
      const addon=Number(sub.branch_addon_price_cents_snapshot ?? plan.additional_branch_price_cents ?? 0);
      const estimated=Number(plan.monthly_price_cents||0)+Math.max(contracted-included,0)*addon;
      addDataRow(detail,"Mensalidade estimada",money(estimated));
      addDataRow(detail,"Unidades",branches.filter(branch=>branch.active).length+" de "+String(contracted));
      addDataRow(detail,"Usuários ativos",usage.members_active||0);
      addDataRow(detail,"Produtos ativos",usage.products_active||0);
      addDataRow(detail,"OS",usage.service_orders||0);
      addDataRow(detail,"Vendas",usage.sales||0);

      const companyEditor=el("details","admin-editor");
      companyEditor.append(el("summary","","Editar dados da empresa"));
      const companyForm=el("form","admin-edit-form");
      const companyName=buildField("Nome comercial",org.name||"",{required:true,maxLength:120});
      companyForm.append(companyName.wrap);

      const profileFields={};
      if(profile){
        const definitions=[
          ["legal_name","Razão social",profile.legal_name||"",{}],
          ["cnpj","CNPJ",profile.cnpj||"",{}],
          ["phone","Telefone",profile.phone||"",{required:true}],
          ["commercial_email","E-mail comercial",profile.commercial_email||"",{type:"email",required:true}],
          ["postal_code","CEP",profile.postal_code||"",{required:true}],
          ["street","Rua / avenida",profile.street||"",{required:true}],
          ["street_number","Número",profile.street_number||"",{required:true}],
          ["complement","Complemento",profile.complement||"",{}],
          ["neighborhood","Bairro",profile.neighborhood||"",{required:true}],
          ["city","Cidade",profile.city||"",{required:true}],
          ["state","UF",profile.state||"",{required:true,maxLength:2}],
          ["segment","Segmento",profile.segment||"",{required:true}],
          ["responsible_name","Responsável",profile.responsible_name||"",{required:true}],
          ["responsible_role","Cargo do responsável",profile.responsible_role||"",{required:true}],
          ["responsible_phone","Telefone do responsável",profile.responsible_phone||"",{required:true}],
          ["manager_name","Gestor",profile.manager_name||"",{}],
          ["manager_phone","Telefone do gestor",profile.manager_phone||"",{}],
          ["manager_email","E-mail do gestor",profile.manager_email||"",{type:"email"}],
        ];

        const grid=el("div","admin-edit-grid");
        definitions.forEach(([key,label,value,options])=>{
          const field=buildField(label,value,options);
          profileFields[key]=field.input;
          grid.append(field.wrap);
        });
        companyForm.append(grid);
      }else{
        companyForm.append(
          el(
            "p",
            "admin-warning",
            "Esta organização de teste é anterior ao cadastro comercial formal. O painel permite alterar o nome, mas não cria aceite contratual retroativo."
          )
        );
      }

      const companySave=el("button","btn btn-secondary","Salvar dados da empresa");
      companySave.type="submit";
      companyForm.append(companySave);
      companyEditor.append(companyForm);
      detail.append(companyEditor);

      companyForm.addEventListener("submit",async event=>{
        event.preventDefault();
        const reason=window.prompt("Motivo da alteração dos dados da empresa:");
        if(!reason)return;

        const payload={company_name:String(companyName.input.value||"").trim()};
        Object.entries(profileFields).forEach(([key,inputNode])=>{
          payload[key]=String(inputNode.value||"").trim();
        });

        try{
          await window.NexoApi.platformUpdateOrganizationAdminData(id,payload,reason);
          showToast("Dados da empresa atualizados e auditados.");
          await loadDashboard();
          await openOrganization(id);
        }catch(error){
          showToast(error instanceof Error?error.message:"Não foi possível atualizar a empresa.");
        }
      });

      const branchesTitle=el("h4","admin-subtitle","Filiais e unidades");
      detail.append(branchesTitle);

      const branchesBox=el("div","admin-branches");
      branches.forEach(branch=>{
        const editor=el("details","admin-branch-editor");
        const summary=el("summary");
        const summaryCopy=el("span");
        summaryCopy.append(
          el("strong","",(branch.name||"Unidade")+(branch.is_primary?" • Matriz":"")),
          el("small","",[branch.city,branch.state].filter(Boolean).join(" / ")||"Endereço não informado")
        );
        summary.append(summaryCopy,el("b","",branch.active?"Ativa":"Inativa"));
        editor.append(summary);

        const form=el("form","admin-edit-form");
        const defs=[
          ["name","Nome da unidade",branch.name||"",{required:true}],
          ["postal_code","CEP",branch.postal_code||"",{}],
          ["street","Rua / avenida",branch.street||"",{}],
          ["street_number","Número",branch.street_number||"",{}],
          ["complement","Complemento",branch.complement||"",{}],
          ["neighborhood","Bairro",branch.neighborhood||"",{}],
          ["city","Cidade",branch.city||"",{}],
          ["state","UF",branch.state||"",{maxLength:2}],
          ["phone","Telefone",branch.phone||"",{}],
          ["email","E-mail",branch.email||"",{type:"email"}],
        ];
        const inputs={};
        const grid=el("div","admin-edit-grid");
        defs.forEach(([key,label,value,options])=>{
          const field=buildField(label,value,options);
          inputs[key]=field.input;
          grid.append(field.wrap);
        });
        form.append(grid);
        const save=el("button","btn btn-secondary","Salvar filial");
        save.type="submit";
        form.append(save);

        form.addEventListener("submit",async event=>{
          event.preventDefault();
          const reason=window.prompt("Motivo da alteração desta filial:");
          if(!reason)return;

          const payload={};
          Object.entries(inputs).forEach(([key,inputNode])=>{
            payload[key]=String(inputNode.value||"").trim();
          });

          try{
            await window.NexoApi.platformUpdateBranchData(id,branch.id,payload,reason);
            showToast("Dados da filial atualizados e auditados.");
            await openOrganization(id);
          }catch(error){
            showToast(error instanceof Error?error.message:"Não foi possível atualizar a filial.");
          }
        });

        editor.append(form);
        branchesBox.append(editor);
      });
      detail.append(branchesBox);

      const field=el("div","field");
      const label=el("label","","Unidades contratadas");
      const input=el("input");
      input.type="number";
      input.min="1";
      input.max="500";
      input.value=String(sub.contracted_branches||1);
      field.append(label,input);
      detail.append(field);

      const planControl=el("div","field");
      planControl.append(el("label","","Plano da empresa"));
      const planSelect=el("select");
      (dashboard?.plans||[]).forEach(option=>{
        const node=el("option","",option.name||option.code);
        node.value=String(option.code||"");
        node.selected=String(option.code||"")===String(org.plan_code||"");
        planSelect.append(node);
      });
      planControl.append(planSelect);
      detail.append(planControl);

      const actions=el("div","admin-actions");
      const planButton=el("button","btn btn-secondary","Salvar plano");
      planButton.type="button";
      const saveButton=el("button","btn btn-secondary","Salvar limite");
      saveButton.type="button";
      const toggleButton=el("button",org.active?"btn btn-danger":"btn btn-primary",org.active?"Suspender empresa":"Reativar empresa");
      toggleButton.type="button";

      planButton.addEventListener("click",async()=>{
        const nextPlan=String(planSelect.value||"");
        if(!nextPlan||nextPlan===String(org.plan_code||"")){
          showToast("Selecione um plano diferente para alterar.");
          return;
        }

        const reason=window.prompt("Motivo da alteração do plano:");
        if(!reason)return;

        try{
          await window.NexoApi.platformSetOrganizationPlan(id,nextPlan,reason);
          showToast("Plano atualizado e registrado na auditoria.");
          await loadDashboard();
          await openOrganization(id);
        }catch(error){
          showToast(error instanceof Error?error.message:"Não foi possível alterar o plano.");
        }
      });

      saveButton.addEventListener("click",async()=>{
        const count=Number(input.value||1);
        const reason=window.prompt("Motivo da alteração do limite de unidades:");
        if(!reason)return;

        try{
          await window.NexoApi.platformSetContractedBranches(id,count,reason);
          showToast("Limite de unidades atualizado e auditado.");
          await loadDashboard();
          await openOrganization(id);
        }catch(error){
          showToast(error instanceof Error?error.message:"Não foi possível atualizar.");
        }
      });

      toggleButton.addEventListener("click",async()=>{
        const reason=window.prompt(org.active?"Motivo da suspensão:":"Motivo da reativação:");
        if(!reason)return;

        try{
          await window.NexoApi.platformSetOrganizationActive(id,!org.active,reason);
          showToast(org.active?"Empresa suspensa.":"Empresa reativada.");
          await loadDashboard();
          await openOrganization(id);
        }catch(error){
          showToast(error instanceof Error?error.message:"Não foi possível atualizar.");
        }
      });

      actions.append(planButton,saveButton,toggleButton);
      detail.append(actions);
    }catch(error){
      clear(detail);
      detail.append(
        el("h3","","Acesso negado ou falha"),
        el("p","account-copy",error instanceof Error?error.message:"Não foi possível carregar a empresa.")
      );
    }
  }

  async function loadDashboard(){
    try{
      dashboard=await window.NexoApi.getPlatformAdminDashboard();
      loginSection.hidden=true;
      appSection.hidden=false;
      logoutButton.hidden=false;
      renderMetrics(dashboard?.summary||{});
      renderCompanies();
      renderPlans();
    }catch(error){
      window.NexoApi.clearSession();
      loginSection.hidden=false;
      appSection.hidden=true;
      logoutButton.hidden=true;
      if(error instanceof Error&&!/Entre novamente/.test(error.message)){
        showToast("Acesso administrativo não autorizado.");
      }
    }
  }

  loginForm?.addEventListener("submit",async event=>{
    event.preventDefault();
    loginButton.disabled=true;
    loginButton.textContent="Entrando...";

    try{
      await window.NexoApi.signIn(
        document.querySelector("#adminEmail").value,
        document.querySelector("#adminPassword").value,
      );
      await loadDashboard();
    }catch(error){
      showToast(error instanceof Error?error.message:"Não foi possível entrar.");
    }finally{
      loginButton.disabled=false;
      loginButton.textContent="Entrar no painel";
    }
  });

  logoutButton?.addEventListener("click",()=>{
    window.NexoApi.signOut();
    location.reload();
  });
  refreshButton?.addEventListener("click",()=>void loadDashboard());
  search?.addEventListener("input",renderCompanies);

  window.NexoApi.getSession().then(()=>loadDashboard()).catch(()=>{});
})();