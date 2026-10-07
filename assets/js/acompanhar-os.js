(() => {
  const loading = document.querySelector("[data-loading]");
  const errorBox = document.querySelector("[data-error]");
  const errorMessage = document.querySelector("[data-error-message]");
  const orderBox = document.querySelector("[data-order]");
  const decisionBox = document.querySelector("[data-decision-box]");
  const decisionResult = document.querySelector("[data-decision-result]");
  const approveButton = document.querySelector("[data-approve]");
  const rejectButton = document.querySelector("[data-reject]");
  const noteInput = document.querySelector("#customerDecisionNote");
  const timeline = document.querySelector("[data-timeline]");
  const toast = document.querySelector("[data-toast]");

  const params = new URLSearchParams(window.location.search);
  const token = String(params.get("t") || "").trim();

  if (token) {
    window.history.replaceState(null, "", "acompanhar-os.html");
  }

  function setText(selector, value, fallback = "Não informado") {
    const node = document.querySelector(selector);
    if (node) node.textContent = String(value || fallback);
  }

  function money(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Orçamento não informado";
    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function dateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Data não informada"
      : date.toLocaleString("pt-BR");
  }

  function toastMessage(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function approvalCopy(status) {
    if (status === "approved") return "Orçamento aprovado pelo cliente.";
    if (status === "rejected") return "Orçamento recusado pelo cliente.";
    if (status === "pending") return "Aguardando sua decisão.";
    return "A assistência ainda não solicitou uma decisão por este link.";
  }

  function render(payload) {
    loading.hidden = true;
    errorBox.hidden = true;
    orderBox.hidden = false;

    setText("[data-organization]", payload.organization_name, "Assistência");
    setText("[data-protocol]", payload.protocol, "Ordem de serviço");
    setText("[data-device]", payload.device, "Equipamento");
    setText("[data-status]", payload.status, "Status não informado");
    setText("[data-branch]", payload.branch_name);
    setText("[data-problem]", payload.problem);
    setText("[data-diagnosis]", payload.diagnosis, "Aguardando diagnóstico");
    setText("[data-service]", payload.recommended_service, "Aguardando definição");
    setText("[data-estimate]", payload.estimate);
    setText("[data-warranty]", payload.warranty);
    setText("[data-budget]", money(payload.budget));
    setText("[data-approval-copy]", approvalCopy(payload.approval_status));

    decisionBox.hidden = !payload.approval_allowed;

    if (payload.approval_status === "approved" || payload.approval_status === "rejected") {
      decisionResult.hidden = false;
      decisionResult.textContent =
        (payload.approval_status === "approved"
          ? "Decisão registrada: orçamento aprovado"
          : "Decisão registrada: orçamento recusado") +
        (payload.approval_at ? " em " + dateTime(payload.approval_at) : "") +
        (payload.approval_note ? ". Observação: " + payload.approval_note : ".");
    } else {
      decisionResult.hidden = true;
      decisionResult.textContent = "";
    }

    const items = Array.isArray(payload.timeline) ? payload.timeline : [];
    timeline.replaceChildren();

    if (!items.length) {
      const empty = document.createElement("p");
      empty.textContent = "Nenhuma atualização pública registrada ainda.";
      timeline.appendChild(empty);
    } else {
      items.forEach((item) => {
        const row = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = String(item.status || "Atualização");
        row.appendChild(strong);
        row.appendChild(
          document.createTextNode(" — " + dateTime(item.created_at))
        );
        timeline.appendChild(row);
      });
    }
  }

  async function load() {
    if (!/^[0-9a-f]{64}$/.test(token)) {
      loading.hidden = true;
      errorBox.hidden = false;
      errorMessage.textContent = "O endereço informado é inválido.";
      return;
    }

    try {
      const payload = await window.NexoApi.rpcPublic(
        "get_public_service_order_status",
        { raw_token: token }
      );
      render(payload || {});
    } catch (error) {
      loading.hidden = true;
      orderBox.hidden = true;
      errorBox.hidden = false;
      errorMessage.textContent =
        error instanceof Error
          ? error.message
          : "O link pode ter expirado, sido revogado ou estar incorreto.";
    }
  }

  async function decide(decision) {
    const verb = decision === "approved" ? "aprovar" : "recusar";
    if (!window.confirm("Confirma que deseja " + verb + " este orçamento?")) {
      return;
    }

    approveButton.disabled = true;
    rejectButton.disabled = true;

    try {
      const payload = await window.NexoApi.rpcPublic(
        "submit_service_order_customer_decision",
        {
          raw_token: token,
          target_decision: decision,
          target_note: String(noteInput?.value || "").trim(),
        }
      );
      render(payload || {});
      toastMessage("Sua decisão foi registrada com sucesso.");
    } catch (error) {
      toastMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar sua decisão."
      );
    } finally {
      approveButton.disabled = false;
      rejectButton.disabled = false;
    }
  }

  approveButton?.addEventListener("click", () => void decide("approved"));
  rejectButton?.addEventListener("click", () => void decide("rejected"));

  void load();
})();