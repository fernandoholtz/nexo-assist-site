(() => {
  async function loadBranchPrices(){
    if(!window.NexoApi?.getPublicPlanCatalog)return;
    try{
      const plans=await window.NexoApi.getPublicPlanCatalog();
      if(!Array.isArray(plans))return;

      plans.forEach(plan=>{
        const code=String(plan.code||"");
        const value=(Number(plan.additional_branch_price_cents||0)/100)
          .toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

        document.querySelectorAll("[data-branch-addon='"+CSS.escape(code)+"']")
          .forEach(node=>{node.textContent=value+"/mês cada";});

        document.querySelectorAll("[data-plan-base='"+CSS.escape(code)+"']")
          .forEach(node=>{
            node.textContent=(Number(plan.monthly_price_cents||0)/100)
              .toLocaleString("pt-BR",{style:"currency",currency:"BRL"})+"/mês";
          });
      });
    }catch{
      // Mantém os valores de fallback do HTML quando a consulta pública não estiver disponível.
    }
  }

  void loadBranchPrices();
})();