(() => {
  const SESSION_KEY = "nexo_web_session";
  const SECURITY_TIME_ZONE = "America/Sao_Paulo";

  function securityDateKey(date) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: SECURITY_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return values.year + "-" + values.month + "-" + values.day;
    } catch {
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
    }
  }

  function decodeJwtPayload(token) {
    try {
      const payload = String(token || "").split(".")[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  function sessionAuthTime(session) {
    const payload = decodeJwtPayload(session?.idToken);
    const seconds = Number(payload?.auth_time || 0);
    return Number.isFinite(seconds) && seconds > 0
      ? new Date(seconds * 1000)
      : null;
  }

  function assertCurrentSecurityDay(session) {
    const authTime = sessionAuthTime(session);
    if (
      !authTime ||
      securityDateKey(authTime) !== securityDateKey(new Date())
    ) {
      clearSession();
      throw new Error(
        "Sua sessão diária foi encerrada por segurança. Faça login novamente."
      );
    }
    return session;
  }

  // O token do portal existe somente durante a sessão da aba.
  // Qualquer sessão antiga persistida em localStorage é invalidada.
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}

  function config() {
    const value = window.NEXO_PUBLIC_CONFIG || {};
    const missing = [
      ["firebaseApiKey", value.firebaseApiKey],
      ["supabaseUrl", value.supabaseUrl],
      ["supabasePublishableKey", value.supabasePublishableKey],
    ].filter(([, item]) => !String(item || "").trim());

    if (missing.length) {
      throw new Error(
        "O portal ainda não recebeu a configuração pública de autenticação. Tente novamente mais tarde."
      );
    }

    return {
      firebaseApiKey: String(value.firebaseApiKey).trim(),
      supabaseUrl: String(value.supabaseUrl).replace(/\/$/, ""),
      supabasePublishableKey: String(value.supabasePublishableKey).trim(),
    };
  }

  async function readJson(response) {
    let data = null;
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      const firebaseCode = data?.error?.message;
      const supabaseMessage = data?.message || data?.error_description || data?.hint;
      const friendly = {
        EMAIL_EXISTS: "Este e-mail já possui uma conta. Use a tela de login.",
        INVALID_LOGIN_CREDENTIALS: "E-mail ou senha inválidos.",
        EMAIL_NOT_FOUND: "E-mail ou senha inválidos.",
        INVALID_PASSWORD: "E-mail ou senha inválidos.",
        USER_DISABLED: "Esta conta está desativada.",
        WEAK_PASSWORD: "Use uma senha mais forte.",
        TOO_MANY_ATTEMPTS_TRY_LATER: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        INVALID_OOB_CODE: "Este link de autenticação é inválido ou já foi utilizado.",
        EXPIRED_OOB_CODE: "Este link de autenticação expirou. Solicite um novo convite.",
      }[firebaseCode];

      const requestError = new Error(
        friendly || supabaseMessage || firebaseCode || "Não foi possível concluir a solicitação."
      );
      requestError.code = firebaseCode || "";
      throw requestError;
    }

    return data;
  }

  async function firebaseRequest(path, payload) {
    const { firebaseApiKey } = config();
    const response = await fetch(
      "https://identitytoolkit.googleapis.com/v1/" + path + "?key=" + encodeURIComponent(firebaseApiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    return readJson(response);
  }

  async function firebaseV2Request(path, payload) {
    const { firebaseApiKey } = config();
    const response = await fetch(
      "https://identitytoolkit.googleapis.com/v2/" + path + "?key=" + encodeURIComponent(firebaseApiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    return readJson(response);
  }

  function saveSession(data, email) {
    const expiresIn = Number(data.expiresIn || data.expires_in || 3600);
    const session = {
      idToken: data.idToken || data.id_token,
      refreshToken: data.refreshToken || data.refresh_token,
      email: email || data.email || "",
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  async function refreshSession(session = readSession()) {
    if (!session?.refreshToken) throw new Error("Sua sessão expirou. Entre novamente.");
    const { firebaseApiKey } = config();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    });
    const response = await fetch(
      "https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(firebaseApiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );
    const data = await readJson(response);
    return saveSession(data, session.email);
  }

  async function getSession({ forceRefresh = false } = {}) {
    let session = readSession();
    if (!session) throw new Error("Entre novamente para continuar.");

    assertCurrentSecurityDay(session);

    if (forceRefresh || !session.idToken || Date.now() >= Number(session.expiresAt || 0)) {
      session = await refreshSession(session);
      assertCurrentSecurityDay(session);
    }

    return session;
  }

  async function signUp(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    const data = await firebaseRequest("accounts:signUp", {
      email: normalized,
      password,
      returnSecureToken: true,
    });
    return saveSession(data, normalized);
  }

  async function signIn(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    const data = await firebaseRequest("accounts:signInWithPassword", {
      email: normalized,
      password,
      returnSecureToken: true,
    });

    if (data?.mfaPendingCredential && !data?.idToken) {
      const factors = (Array.isArray(data.mfaInfo) ? data.mfaInfo : [])
        .filter(
          (item) =>
            item?.mfaEnrollmentId &&
            Object.prototype.hasOwnProperty.call(item, "totpInfo")
        )
        .map((item) => ({
          mfaEnrollmentId: String(item.mfaEnrollmentId),
          displayName: String(item.displayName || "Aplicativo autenticador"),
        }));

      if (!factors.length) {
        throw new Error(
          "Esta conta exige um segundo fator que ainda não é suportado neste portal."
        );
      }

      return {
        mfaRequired: true,
        email: normalized,
        mfaPendingCredential: String(data.mfaPendingCredential),
        factors,
      };
    }

    return saveSession(data, normalized);
  }

  async function completeTotpSignIn(challenge, verificationCode) {
    const pending = String(challenge?.mfaPendingCredential || "");
    const email = String(challenge?.email || "").trim().toLowerCase();
    const code = String(verificationCode || "").replace(/\D/g, "").slice(0, 6);
    const factor = Array.isArray(challenge?.factors)
      ? challenge.factors.find((item) => item?.mfaEnrollmentId)
      : null;

    if (!pending || !factor?.mfaEnrollmentId) {
      throw new Error("O desafio de autenticação em duas etapas expirou. Entre novamente.");
    }

    if (code.length !== 6) {
      throw new Error("Informe o código de 6 dígitos do aplicativo autenticador.");
    }

    const data = await firebaseV2Request("accounts/mfaSignIn:finalize", {
      mfaPendingCredential: pending,
      mfaEnrollmentId: String(factor.mfaEnrollmentId),
      totpVerificationInfo: {
        verificationCode: code,
      },
    });

    if (!data?.idToken || !data?.refreshToken) {
      throw new Error("O Firebase não confirmou a autenticação em duas etapas.");
    }

    return saveSession(
      {
        ...data,
        expiresIn: data.expiresIn || data.expires_in || 3600,
      },
      email
    );
  }

  async function signInWithEmailLink(email, oobCode) {
    const normalized = String(email || "").trim().toLowerCase();
    const data = await firebaseRequest("accounts:signInWithEmailLink", {
      email: normalized,
      oobCode: String(oobCode || "").trim(),
    });
    return {
      session: saveSession(data, normalized),
      isNewUser: Boolean(data?.isNewUser),
    };
  }

  async function updatePassword(password) {
    const current = await getSession();
    const data = await firebaseRequest("accounts:update", {
      idToken: current.idToken,
      password,
      returnSecureToken: true,
    });

    return saveSession(
      {
        ...data,
        refreshToken:
          data.refreshToken || data.refresh_token || current.refreshToken,
        expiresIn: data.expiresIn || data.expires_in || 3600,
      },
      current.email,
    );
  }

  async function sendEmailVerification(idToken) {
    return firebaseRequest("accounts:sendOobCode", {
      requestType: "VERIFY_EMAIL",
      idToken,
    });
  }

  async function sendPasswordReset(email) {
    return firebaseRequest("accounts:sendOobCode", {
      requestType: "PASSWORD_RESET",
      email: String(email || "").trim().toLowerCase(),
    });
  }

  async function lookup(idToken) {
    const data = await firebaseRequest("accounts:lookup", { idToken });
    return data?.users?.[0] || null;
  }

  async function rpc(name, args, idToken) {
    const { supabaseUrl, supabasePublishableKey } = config();
    const headers = {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
    };
    if (idToken) headers.Authorization = "Bearer " + idToken;

    const response = await fetch(supabaseUrl + "/rest/v1/rpc/" + encodeURIComponent(name), {
      method: "POST",
      headers,
      body: JSON.stringify(args || {}),
    });
    return readJson(response);
  }

  async function rpcPublic(name, args) {
    return rpc(name, args, null);
  }

  async function getPublicPlanCatalog() {
    return rpcPublic("get_public_plan_catalog", {});
  }

  async function bootstrapCompanyWithBranches(payload) {
    const session = await getSession({ forceRefresh: true });
    const account = await lookup(session.idToken);
    if (!account?.emailVerified) {
      throw new Error("Confirme seu e-mail antes de ativar a empresa.");
    }

    const verifiedSession = await refreshSession(session);
    return rpc(
      "bootstrap_saas_owner_with_branches",
      payload,
      verifiedSession.idToken,
    );
  }

  async function bootstrapCompany(payload) {
    const session = await getSession({ forceRefresh: true });
    const account = await lookup(session.idToken);
    if (!account?.emailVerified) {
      throw new Error("Confirme seu e-mail antes de ativar a empresa.");
    }

    // Atualiza o token depois que o Firebase reconhece a verificação,
    // para que a claim email_verified chegue ao Supabase.
    const verifiedSession = await refreshSession(session);
    return rpc("bootstrap_saas_owner", payload, verifiedSession.idToken);
  }

  async function getBranchEntitlement(organizationId) {
    const session = await getSession();
    return rpc(
      "get_branch_entitlement",
      { target_organization_id: organizationId },
      session.idToken,
    );
  }

  async function getOwnerPortalSnapshot() {
    const session = await getSession();
    return rpc("get_owner_portal_snapshot", {}, session.idToken);
  }

  async function cancelTrialSubscription(organizationId) {
    const session = await getSession();
    return rpc(
      "cancel_trial_subscription",
      { target_organization_id: organizationId },
      session.idToken,
    );
  }

  async function reactivateTrialSubscription(organizationId) {
    const session = await getSession();
    return rpc(
      "reactivate_trial_subscription",
      { target_organization_id: organizationId },
      session.idToken,
    );
  }

  async function changeTrialPlan(organizationId, planCode) {
    const session = await getSession();
    return rpc(
      "change_trial_plan",
      {
        target_organization_id: organizationId,
        target_plan_code: planCode,
      },
      session.idToken,
    );
  }

  async function requestAccountDeletion() {
    const session = await getSession();
    return rpc("request_account_deletion", {}, session.idToken);
  }

  async function cancelAccountDeletionRequest() {
    const session = await getSession();
    return rpc("cancel_account_deletion_request", {}, session.idToken);
  }

  async function getAccountDeletionRequests() {
    const session = await getSession();
    const { supabaseUrl, supabasePublishableKey } = config();
    const url =
      supabaseUrl +
      "/rest/v1/account_deletion_requests?select=id,status,requested_at,organization_id,requester_role&status=in.(requested,processing)&order=requested_at.desc&limit=1";
    const response = await fetch(url, {
      headers: {
        apikey: supabasePublishableKey,
        Authorization: "Bearer " + session.idToken,
      },
    });

    const payload = await readJson(response);
    return Array.isArray(payload) && payload[0] ? payload[0] : null;
  }

  async function getPlatformAdminDashboard() {
    const session = await getSession();
    return rpc("get_platform_admin_dashboard", {}, session.idToken);
  }

  async function getPlatformOrganizationDetail(organizationId) {
    const session = await getSession();
    return rpc(
      "get_platform_organization_detail",
      { target_organization_id: organizationId },
      session.idToken,
    );
  }

  async function platformSetOrganizationActive(organizationId, active, reason) {
    const session = await getSession();
    return rpc(
      "platform_set_organization_active",
      {
        target_organization_id: organizationId,
        target_active: Boolean(active),
        target_reason: String(reason || "").trim(),
      },
      session.idToken,
    );
  }

  async function platformSetContractedBranches(organizationId, count, reason) {
    const session = await getSession();
    return rpc(
      "platform_set_contracted_branches",
      {
        target_organization_id: organizationId,
        target_contracted_branches: Number(count),
        target_reason: String(reason || "").trim(),
      },
      session.idToken,
    );
  }

  async function platformSetOrganizationPlan(organizationId, planCode, reason) {
    const session = await getSession();
    return rpc(
      "platform_set_organization_plan",
      {
        target_organization_id: organizationId,
        target_plan_code: String(planCode || "").trim(),
        target_reason: String(reason || "").trim(),
      },
      session.idToken,
    );
  }

  async function platformUpdateBranchPricing(planCode, cents, reason) {
    const session = await getSession();
    return rpc(
      "platform_update_branch_pricing",
      {
        target_plan_code: planCode,
        target_additional_branch_price_cents: Number(cents),
        target_reason: String(reason || "").trim(),
      },
      session.idToken,
    );
  }

  async function platformUpdateOrganizationAdminData(organizationId, data, reason) {
    const session = await getSession();
    return rpc(
      "platform_update_organization_admin_data",
      {
        target_organization_id: organizationId,
        target_data: data && typeof data === "object" ? data : {},
        target_reason: String(reason || "").trim(),
      },
      session.idToken,
    );
  }

  async function platformUpdateBranchData(organizationId, branchId, data, reason) {
    const session = await getSession();
    return rpc(
      "platform_update_branch_data",
      {
        target_organization_id: organizationId,
        target_branch_id: branchId,
        target_data: data && typeof data === "object" ? data : {},
        target_reason: String(reason || "").trim(),
      },
      session.idToken,
    );
  }


  async function platformOpenSupportSession(organizationId, moduleName, reason, minutes = 20) {
    const session = await getSession();
    return rpc(
      "platform_open_support_session",
      {
        target_organization_id: organizationId,
        target_module: String(moduleName || "").trim(),
        target_reason: String(reason || "").trim(),
        target_minutes: Number(minutes || 20),
      },
      session.idToken,
    );
  }

  async function platformOpenSensitiveSupportSession(
    organizationId,
    moduleName,
    reason,
    minutes = 10
  ) {
    const session = await getSession();
    return rpc(
      "platform_open_sensitive_support_session",
      {
        target_organization_id: organizationId,
        target_module: String(moduleName || "").trim(),
        target_reason: String(reason || "").trim(),
        target_minutes: Math.min(10, Math.max(5, Number(minutes || 10))),
      },
      session.idToken,
    );
  }

  async function platformReadSupportSession(sessionId, limit = 25, offset = 0) {
    const session = await getSession();
    return rpc(
      "platform_read_support_session",
      {
        target_session_id: sessionId,
        target_limit: Number(limit || 25),
        target_offset: Number(offset || 0),
      },
      session.idToken,
    );
  }

  async function platformCloseSupportSession(sessionId) {
    const session = await getSession();
    return rpc(
      "platform_close_support_session",
      { target_session_id: sessionId },
      session.idToken,
    );
  }

  function signOut() {
    clearSession();
  }

  function redirectAfterDailySessionExpiry() {
    const page = String(window.location.pathname || "")
      .split("/")
      .filter(Boolean)
      .pop() || "index.html";

    if (page === "gestao.html") {
      window.location.reload();
      return;
    }

    if (["conta.html", "excluir-conta.html"].includes(page)) {
      const target =
        "login.html?next=" +
        encodeURIComponent(page) +
        "&motivo=sessao-diaria";
      window.location.assign(target);
    }
  }

  setInterval(() => {
    const session = readSession();
    if (!session) return;
    try {
      assertCurrentSecurityDay(session);
    } catch {
      window.dispatchEvent(new CustomEvent("nexo:daily-session-expired"));
      redirectAfterDailySessionExpiry();
    }
  }, 15000);

  window.NexoApi = {
    config,
    signUp,
    signIn,
    completeTotpSignIn,
    signInWithEmailLink,
    updatePassword,
    signOut,
    sendEmailVerification,
    sendPasswordReset,
    lookup,
    getSession,
    refreshSession,
    clearSession,
    rpc,
    rpcPublic,
    bootstrapCompany,
    bootstrapCompanyWithBranches,
    getPublicPlanCatalog,
    getBranchEntitlement,
    getOwnerPortalSnapshot,
    cancelTrialSubscription,
    reactivateTrialSubscription,
    changeTrialPlan,
    requestAccountDeletion,
    cancelAccountDeletionRequest,
    getAccountDeletionRequests,
    getPlatformAdminDashboard,
    getPlatformOrganizationDetail,
    platformSetOrganizationActive,
    platformSetContractedBranches,
    platformSetOrganizationPlan,
    platformUpdateBranchPricing,
    platformUpdateOrganizationAdminData,
    platformUpdateBranchData,
    platformOpenSupportSession,
    platformOpenSensitiveSupportSession,
    platformReadSupportSession,
    platformCloseSupportSession,
  };
})();
