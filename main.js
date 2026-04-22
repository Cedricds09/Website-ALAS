(() => {
    const WHATSAPP_NUMBER = "525531675824";
    const DEFAULT_MESSAGE = "Hola ALAS, me gustaría solicitar una cotización.";

    const waLink = (text) =>
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

    const ctaWhatsApp = document.getElementById("ctaWhatsApp");
    const footerWhatsApp = document.getElementById("footerWhatsApp");
    const waFloat = document.getElementById("waFloat");
    const defaultHref = waLink(DEFAULT_MESSAGE);

    if (ctaWhatsApp) ctaWhatsApp.href = defaultHref;
    if (footerWhatsApp) footerWhatsApp.href = defaultHref;
    if (waFloat) waFloat.href = defaultHref;

    const form = document.getElementById("quoteForm");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const data = new FormData(form);
            const name = data.get("name").trim();
            const phone = data.get("phone").trim();
            const service = data.get("service");
            const message = data.get("message").trim();

            const text =
                `Hola ALAS, soy ${name}.\n` +
                `Teléfono: ${phone}\n` +
                `Servicio: ${service}\n\n` +
                `${message}`;

            window.open(waLink(text), "_blank", "noopener");
        });
    }

    const navToggle = document.getElementById("navToggle");
    const navLinks = document.getElementById("navLinks");
    if (navToggle && navLinks) {
        navToggle.addEventListener("click", () => {
            navLinks.classList.toggle("open");
        });
        navLinks.querySelectorAll("a").forEach((a) => {
            a.addEventListener("click", () => navLinks.classList.remove("open"));
        });
    }

    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
