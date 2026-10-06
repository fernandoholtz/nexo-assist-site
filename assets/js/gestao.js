(() => {
  const loginSection=document.querySelector("[data-admin-login]");
  const appSection=document.querySelector("[data-admin-app]");
  const loginForm=document.querySelector("[data-admin-login-form]");
  const loginButton=document.querySelector("[data-admin-login-button]");
  const adminMfaField=document.querySelector("[data-admin-mfa-field]");
  const adminMfaCode=document.querySelector("#adminMfaCode");
  const adminMfaCancel=document.querySelector("[data-admin-mfa-cancel]");
  let adminMfaChallenge=null;
  const logoutButton=document.querySelector("[data-admin-logout]");
  const refreshButton=document.querySelector("[data-admin-refresh]");
  const metrics=document.querySelector("[data-admin-metrics]");
  const list=document.querySelector("[data-admin-companies-list]");
  const detail=document.querySelector("[data-admin-detail]");
  const plans=document.querySelector("[data-admin-plans]");
  const deletionList=document.querySelector("[data-admin-deletions]");
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

  function formatDateTime(value){
    if(!value)return "—";
    const parsed=new Date(value);
    return Number.isNaN(parsed.getTime())
      ?String(value)
      :parsed.toLocaleString("pt-BR");
  }

  async function renderDeletionRequests(){
    if(!deletionList)return;
    clear(deletionList);
    deletionList.append(el("p","account-copy","Carregando pedidos de exclusão..."));

    try{
      const rows=await window.NexoApi.platformListAccountDeletionRequests();
      clear(deletionList);

      if(!Array.isArray(rows)||rows.length===0){
        deletionList.append(el("p","account-copy","Nenhum pedido de exclusão registrado."));
        return;
      }

      rows.forEach(item=>{
        const block=el("div","admin-branch-editor");
        const header=el("div","account-card-head");
        const title=el("div");
        title.append(
          el("strong","",item.organization_name||"Conta sem empresa ativa"),
          el("small","",String(item.requester_role||"usuário")+" • "+String(item.status||"requested"))
        );
        header.append(title);
        block.append(header);

        addDataRow(block,"Solicitado em",formatDateTime(item.requested_at));
        addDataRow(block,"Banco processado",formatDateTime(item.database_processed_at));
        addDataRow(block,"Firebase removido",formatDateTime(item.firebase_deleted_at));

        const actions=el("div","admin-actions");

        if(item.status==="requested"&&!item.database_processed_at){
          const processButton=el("button","btn btn-danger","Processar exclusão no banco");
          processButton.type="button";
          processButton.addEventListener("click",async()=>{
            const reason=window.prompt(
              "Motivo detalhado do processamento (mínimo 10 caracteres):"
            );
            if(!reason)return;
            if(String(reason).trim().length<10){
              showToast("Informe um motivo com pelo menos 10 caracteres.");
              return;
            }
            if(!window.confirm(
              "Esta ação remove os acessos da conta no Nexo Assist e pseudonimiza o identificador. Continuar?"
            ))return;

            processButton.disabled=true;
            try{
              await window.NexoApi.platformProcessAccountDeletion(item.id,reason);
              showToast("Banco processado. A identidade Firebase ainda precisa ser removida.");
              await renderDeletionRequests();
            }catch(error){
              showToast(error instanceof Error?error.message:"Não foi possível processar a exclusão.");
            }finally{
              processButton.disabled=false;
            }
          });
          actions.append(processButton);
        }

        if(item.status==="processing"&&item.database_processed_at&&!item.firebase_deleted_at){
          const firebaseButton=el(
            "button",
            "btn btn-danger",
            "Confirmar remoção no Firebase"
          );
          firebaseButton.type="button";
          firebaseButton.addEventListener("click",async()=>{
            const reason=window.prompt(
              "Confirme no Firebase Authentication que o usuário foi removido e descreva a verificação:"
            );
            if(!reason)return;
            if(String(reason).trim().length<10){
              showToast("Descreva a confirmação com pelo menos 10 caracteres.");
              return;
            }
            if(!window.confirm(
              "Marque como concluído somente se a identidade Firebase já tiver sido realmente removida. Confirmar?"
            ))return;

            firebaseButton.disabled=true;
            try{
              await window.NexoApi.platformMarkFirebaseAccountDeleted(item.id,reason);
              showToast("Pedido de exclusão concluído e auditado.");
              await renderDeletionRequests();
            }catch(error){
              showToast(error instanceof Error?error.message:"Não foi possível concluir o pedido.");
            }finally{
              firebaseButton.disabled=false;
            }
          });
          actions.append(firebaseButton);
        }

        if(actions.childNodes.length)block.append(actions);
        deletionList.append(block);
      });
    }catch(error){
      clear(deletionList);
      deletionList.append(
        el(
          "p",
          "admin-warning",
          error instanceof Error
            ?error.message
            :"Não foi possível carregar os pedidos. Entre com 2FA."
        )
      );
    }
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


  function supportValue(value){
    if(value===null||value===undefined||value==="")return "—";
    if(typeof value==="object"){
      try{return JSON.stringify(value);}
      catch{return String(value);}
    }
    return String(value);
  }

  function renderSupportResult(container,payload){
    clear(container);
    const total=Number(payload?.total||0);
    const items=Array.isArray(payload?.items)?payload.items:[];

    container.append(
      el("p","account-copy",total+" registro(s) encontrado(s). Mostrando até "+String(items.length)+".")
    );

    if(items.length===0){
      container.append(el("p","account-copy","Nenhum registro disponível neste módulo."));
      return;
    }

    items.forEach((item,index)=>{
      const block=el("details","admin-branch-editor");
      const summary=el("summary");
      const label=
        item?.protocol||
        item?.name||
        item?.full_name||
        item?.title||
        item?.email||
        item?.id||
        ("Registro "+String(index+1));
      summary.append(el("strong","",label));
      block.append(summary);

      const body=el("div","admin-edit-form");
      Object.entries(item||{}).forEach(([key,value])=>{
        addDataRow(body,key.replaceAll("_"," "),supportValue(value));
      });
      block.append(body);
      container.append(block);
    });
  }

  function buildSupportPanel(organizationId){
    const wrap=el("section","admin-editor");
    wrap.append(
      el("h4","admin-subtitle","Suporte técnico auditado"),
      el(
        "p",
        "account-copy",
        "Use apenas quando precisar investigar um problema real. O acesso é temporário, limitado a um módulo e cada leitura fica registrada na auditoria da plataforma."
      )
    );

    const form=el("div","admin-edit-grid");
    const moduleField=el("div","field");
    moduleField.append(el("label","","Módulo"));
    const moduleSelect=el("select");
    [
      ["service_orders","Ordens de serviço"],
      ["sales","Vendas"],
      ["customers","Clientes"],
      ["products","Produtos / estoque"],
      ["employees","Funcionários"],
      ["goals","Metas"],
      ["users","Usuários e acessos"],
      ["suppliers","Fornecedores"],
      ["campaigns","Campanhas"],
      ["audit","Auditoria da empresa"],
      ["documents","Documentos de RH • metadados"],
    ].forEach(([value,label])=>{
      const option=el("option","",label);
      option.value=value;
      moduleSelect.append(option);
    });
    moduleField.append(moduleSelect);

    const reasonField=buildField(
      "Motivo do acesso",
      "",
      {required:true,placeholder:"Ex.: investigar falha relatada na OS 123"}
    );

    const timeField=buildField("Duração em minutos","20",{type:"number"});
    timeField.input.min="5";
    timeField.input.max="30";

    form.append(moduleField,reasonField.wrap,timeField.wrap);
    wrap.append(form);

    const actions=el("div","admin-actions");
    const openButton=el("button","btn btn-primary","Abrir suporte temporário");
    openButton.type="button";
    const sensitiveButton=el(
      "button",
      "btn btn-danger",
      "Abrir suporte sensível • exige 2FA"
    );
    sensitiveButton.type="button";
    const refreshSupport=el("button","btn btn-secondary","Atualizar dados");
    refreshSupport.type="button";
    refreshSupport.hidden=true;
    const closeSupport=el("button","btn btn-danger","Encerrar suporte");
    closeSupport.type="button";
    closeSupport.hidden=true;
    actions.append(openButton,sensitiveButton,refreshSupport,closeSupport);
    wrap.append(actions);

    const status=el("p","account-copy","");
    const result=el("div","admin-support-results");
    wrap.append(status,result);

    let currentSession=null;

    async function loadSupportData(){
      if(!currentSession?.id)return;
      try{
        const payload=await window.NexoApi.platformReadSupportSession(currentSession.id,25,0);
        currentSession.expires_at=payload?.expires_at||currentSession.expires_at;
        const expires=currentSession.expires_at
          ?new Date(currentSession.expires_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
          :"";
        const accessLabel=
          String(payload?.access_level||currentSession?.access_level||"minimized")==="sensitive"
            ?"SUPORTE SENSÍVEL"
            :"SUPORTE MINIMIZADO";
        status.textContent=accessLabel+" • "+String(currentSession.module||"módulo")+" • expira às "+expires+".";
        renderSupportResult(result,payload);
      }catch(error){
        currentSession=null;
        refreshSupport.hidden=true;
        closeSupport.hidden=true;
        status.textContent=error instanceof Error?error.message:"A sessão de suporte não está mais disponível.";
        clear(result);
      }
    }

    openButton.addEventListener("click",async()=>{
      const reason=String(reasonField.input.value||"").trim();
      if(reason.length<5){
        showToast("Informe um motivo de acesso com pelo menos 5 caracteres.");
        return;
      }

      openButton.disabled=true;
      try{
        currentSession=await window.NexoApi.platformOpenSupportSession(
          organizationId,
          moduleSelect.value,
          reason,
          Number(timeField.input.value||20),
        );
        refreshSupport.hidden=false;
        closeSupport.hidden=false;
        showToast("Sessão temporária de suporte aberta e auditada.");
        await loadSupportData();
      }catch(error){
        showToast(error instanceof Error?error.message:"Não foi possível abrir o suporte.");
      }finally{
        openButton.disabled=false;
      }
    });


    sensitiveButton.addEventListener("click",async()=>{
      const reason=String(reasonField.input.value||"").trim();
      if(reason.length<10){
        showToast("Para dados sensíveis, informe um motivo detalhado com pelo menos 10 caracteres.");
        return;
      }

      sensitiveButton.disabled=true;
      try{
        currentSession=await window.NexoApi.platformOpenSensitiveSupportSession(
          organizationId,
          moduleSelect.value,
          reason,
          Math.min(10,Number(timeField.input.value||10)),
        );
        refreshSupport.hidden=false;
        closeSupport.hidden=false;
        showToast("Suporte sensível aberto por tempo limitado e registrado na auditoria.");
        await loadSupportData();
      }catch(error){
        showToast(
          error instanceof Error
            ? error.message
            : "Não foi possível abrir o suporte sensível."
        );
      }finally{
        sensitiveButton.disabled=false;
      }
    });

    refreshSupport.addEventListener("click",()=>void loadSupportData());

    closeSupport.addEventListener("click",async()=>{
      if(!currentSession?.id)return;
      try{
        await window.NexoApi.platformCloseSupportSession(currentSession.id);
        showToast("Sessão de suporte encerrada.");
      }catch(error){
        showToast(error instanceof Error?error.message:"Não foi possível encerrar a sessão.");
      }finally{
        currentSession=null;
        refreshSupport.hidden=true;
        closeSupport.hidden=true;
        status.textContent="Sessão encerrada.";
        clear(result);
      }
    });

    return wrap;
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
      detail.append(buildSupportPanel(id));
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
      await renderDeletionRequests();
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

  function setAdminMfaMode(challenge){
    adminMfaChallenge=challenge||null;
    const active=Boolean(adminMfaChallenge);
    if(adminMfaField)adminMfaField.hidden=!active;
    if(adminMfaCancel)adminMfaCancel.hidden=!active;
    if(loginButton)loginButton.textContent=active?"Confirmar código":"Entrar no painel";
    if(active){
      if(adminMfaCode){
        adminMfaCode.value="";
        adminMfaCode.focus();
      }
      showToast("Senha confirmada. Informe o código do aplicativo autenticador.");
    }
  }

  loginForm?.addEventListener("submit",async event=>{
    event.preventDefault();
    loginButton.disabled=true;
    loginButton.textContent=adminMfaChallenge?"Confirmando...":"Entrando...";

    try{
      if(adminMfaChallenge){
        await window.NexoApi.completeTotpSignIn(
          adminMfaChallenge,
          String(adminMfaCode?.value||""),
        );
        adminMfaChallenge=null;
      }else{
        const result=await window.NexoApi.signIn(
          document.querySelector("#adminEmail").value,
          document.querySelector("#adminPassword").value,
        );

        if(result?.mfaRequired){
          setAdminMfaMode(result);
          return;
        }
      }

      await loadDashboard();
    }catch(error){
      if(!adminMfaChallenge)window.NexoApi.clearSession();
      showToast(error instanceof Error?error.message:"Não foi possível entrar.");
    }finally{
      loginButton.disabled=false;
      loginButton.textContent=adminMfaChallenge?"Confirmar código":"Entrar no painel";
    }
  });

  adminMfaCancel?.addEventListener("click",()=>setAdminMfaMode(null));
  adminMfaCode?.addEventListener("input",()=>{
    adminMfaCode.value=String(adminMfaCode.value||"").replace(/\D/g,"").slice(0,6);
  });

  logoutButton?.addEventListener("click",()=>{
    window.NexoApi.signOut();
    location.reload();
  });
  refreshButton?.addEventListener("click",()=>void loadDashboard());
  search?.addEventListener("input",renderCompanies);

  window.NexoApi.getSession().then(()=>loadDashboard()).catch(()=>{});
})();