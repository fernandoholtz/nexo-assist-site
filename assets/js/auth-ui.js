(() => {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    const inputId = button.dataset.passwordToggle;
    const input = inputId ? document.getElementById(inputId) : null;
    if (!input) return;

    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Ocultar" : "Mostrar";
      button.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      button.setAttribute("aria-pressed", String(show));
      input.focus({ preventScroll: true });
    });
  });
})();
