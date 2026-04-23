(() => {
    const STORAGE_KEY = "alas_notes";

    const SEED = [
        {
            id: "ALAS-0001",
            date: "15/04/2026",
            name: "María García",
            phone: "5551234567",
            service: "Plomería",
            message: "Cambio de mezcladora en baño principal y revisión de fugas.",
            items: [
                { concept: "Mano de obra", amount: 850 },
                { concept: "Mezcladora monomando", amount: 1250 }
            ]
        },
        {
            id: "ALAS-0002",
            date: "18/04/2026",
            name: "Carlos Ruiz",
            phone: "5559876543",
            service: "Gas LP / Natural",
            message: "Detección y reparación de fuga en conexión principal.",
            items: [
                { concept: "Diagnóstico de fuga", amount: 450 },
                { concept: "Cambio de conexión", amount: 680 }
            ]
        }
    ];

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
                return SEED.slice();
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function normalizePhone(s) {
        return (s || "").replace(/\D+/g, "");
    }

    function search(customer, key) {
        const notes = load();
        const c = normalizePhone(customer);
        const kRaw = (key || "").trim();
        const kPhone = normalizePhone(kRaw);
        const kId = kRaw.toUpperCase();
        if (!c || !kRaw) return [];
        return notes.filter(n => {
            const np = normalizePhone(n.phone);
            const customerMatch = np === c;
            const keyMatch = (kPhone && np === kPhone) || (n.id || "").toUpperCase() === kId;
            return customerMatch && keyMatch;
        });
    }

    function escape(s) {
        return String(s ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function totalOf(note) {
        return (note.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
    }

    function render(list) {
        const root = document.getElementById("notesResults");
        if (!root) return;

        if (!list.length) {
            root.innerHTML = '<p class="notes-empty">No se encontraron notas con esos datos. Verifica tu número de cliente y clave.</p>';
            return;
        }

        root.innerHTML = `
            <p class="notes-count">${list.length} nota${list.length === 1 ? "" : "s"} encontrada${list.length === 1 ? "" : "s"}</p>
            <ul class="notes-list">
                ${list.map(n => `
                    <li class="note-item">
                        <div class="note-meta">
                            <span class="note-id">${escape(n.id)}</span>
                            <span class="note-date">${escape(n.date)}</span>
                        </div>
                        <div class="note-info">
                            <p class="note-service">${escape(n.service)}</p>
                            <p class="note-total">Total: $${totalOf(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <button type="button" class="btn btn-primary note-dl" data-id="${escape(n.id)}">Descargar PDF</button>
                    </li>
                `).join("")}
            </ul>
        `;

        root.querySelectorAll(".note-dl").forEach(btn => {
            btn.addEventListener("click", () => {
                const note = list.find(n => n.id === btn.dataset.id);
                if (note && window.AlasPDF) window.AlasPDF.generate(note);
            });
        });
    }

    const form = document.getElementById("notesForm");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const data = new FormData(form);
            const results = search(data.get("customer"), data.get("key"));
            render(results);
        });
    }

    // Seed on first load
    load();

    // Public helper for adding notes from console
    window.AlasNotes = {
        add(note) {
            const all = load();
            all.push(note);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        },
        list: load,
        clear() { localStorage.removeItem(STORAGE_KEY); }
    };
})();
