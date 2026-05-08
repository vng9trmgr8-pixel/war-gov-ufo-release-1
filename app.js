/* UFO Release 01 — minimal app */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  let DATA = null;
  let activeTab = "pdfs";
  let activeAgency = "";
  let query = "";
  let lbItems = [];
  let lbIndex = 0;

  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  const formatTitle = (t) => {
    const s = (t || "").trim();
    if (!s) return "—";
    return s
      .replace(/^([0-9]+_)/, "$1 ")
      .replace(/_/g, " · ")
      .toUpperCase();
  };

  const matchQuery = (rec, q) => {
    if (!q) return true;
    const hay = [
      rec.title, rec.agency, rec.incidentDate, rec.incidentLocation,
      rec.blurb, rec.videoTitle,
    ].join(" ").toLowerCase();
    return hay.includes(q);
  };

  const filtered = (list) =>
    list.filter(
      (r) =>
        (!activeAgency || r.agency === activeAgency) &&
        matchQuery(r, query)
    );

  /* ======================= renderers ======================= */
  const renderPdfs = () => {
    const grid = $("#pdf-grid");
    const empty = $("#pdf-empty");
    const list = filtered(DATA.pdfs);
    grid.innerHTML = list
      .map(
        (r, i) => `
        <article class="pdf-card" data-i="${i}">
          <a href="${escapeHTML(r.url)}" target="_blank" rel="noopener" aria-label="Open PDF on war.gov">
            <img class="pdf-thumb" loading="lazy" src="${escapeHTML(r.thumb)}" alt="" />
          </a>
          <div class="pdf-card-body">
            <div class="pdf-meta">
              ${r.agency ? `<span class="pill agency">${escapeHTML(r.agency)}</span>` : ""}
              ${r.incidentDate && r.incidentDate !== "N/A" ? `<span class="pill">${escapeHTML(r.incidentDate)}</span>` : ""}
              ${r.incidentLocation && r.incidentLocation !== "N/A" ? `<span class="pill">${escapeHTML(r.incidentLocation)}</span>` : ""}
            </div>
            <h3 class="pdf-title">${escapeHTML(formatTitle(r.title))}</h3>
            <p class="pdf-blurb">${escapeHTML(r.blurb || "—")}</p>
            <div class="pdf-actions">
              <a href="${escapeHTML(r.url)}" target="_blank" rel="noopener">OPEN PDF →</a>
              ${r.blurb && r.blurb.length > 240 ? `<button class="more" type="button" data-toggle>READ MORE</button>` : ""}
            </div>
          </div>
        </article>`
      )
      .join("");
    empty.classList.toggle("hidden", list.length > 0);

    grid.querySelectorAll("[data-toggle]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const card = e.currentTarget.closest(".pdf-card");
        const expanded = card.classList.toggle("expanded");
        btn.textContent = expanded ? "COLLAPSE" : "READ MORE";
      })
    );
  };

  const renderImages = () => {
    const grid = $("#img-grid");
    const empty = $("#img-empty");
    const list = filtered(DATA.images);
    grid.innerHTML = list
      .map(
        (r, i) => `
        <article class="img-card" data-i="${i}">
          <button class="img-thumb-wrap" type="button" aria-label="Enlarge ${escapeHTML(r.title)}">
            <img loading="lazy" src="${escapeHTML(r.thumb || r.url)}" alt="${escapeHTML(r.title)}" />
          </button>
          <div class="img-body">
            <div class="pdf-meta">
              ${r.agency ? `<span class="pill agency">${escapeHTML(r.agency)}</span>` : ""}
              ${r.incidentDate && r.incidentDate !== "N/A" ? `<span class="pill">${escapeHTML(r.incidentDate)}</span>` : ""}
              ${r.incidentLocation && r.incidentLocation !== "N/A" ? `<span class="pill">${escapeHTML(r.incidentLocation)}</span>` : ""}
            </div>
            <h3 class="pdf-title">${escapeHTML(formatTitle(r.title))}</h3>
            <p class="pdf-blurb">${escapeHTML(r.blurb || "—")}</p>
            <div class="pdf-actions">
              <a href="${escapeHTML(r.url)}" target="_blank" rel="noopener">OPEN ORIGINAL →</a>
              ${r.blurb && r.blurb.length > 240 ? `<button class="more" type="button" data-toggle>READ MORE</button>` : ""}
            </div>
          </div>
        </article>`
      )
      .join("");
    empty.classList.toggle("hidden", list.length > 0);

    grid.querySelectorAll("[data-toggle]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const card = e.currentTarget.closest(".img-card");
        const expanded = card.classList.toggle("expanded");
        btn.textContent = expanded ? "COLLAPSE" : "READ MORE";
      })
    );
    grid.querySelectorAll(".img-thumb-wrap").forEach((el) =>
      el.addEventListener("click", () => {
        const i = Number(el.closest(".img-card").dataset.i);
        openLightbox(list, i, "image");
      })
    );
  };

  const renderVideos = () => {
    const grid = $("#vid-grid");
    const empty = $("#vid-empty");
    const list = filtered(DATA.videos);
    grid.innerHTML = list
      .map(
        (r, i) => `
        <article class="vid-card" data-i="${i}">
          <button class="vid-thumb-wrap" type="button" aria-label="Play ${escapeHTML(r.title)}">
            <img loading="lazy" src="${escapeHTML(r.thumb)}" alt="${escapeHTML(r.title)}" />
            <span class="vid-play" aria-hidden="true">▶</span>
          </button>
          <div class="vid-body">
            <div class="pdf-meta">
              ${r.agency ? `<span class="pill agency">${escapeHTML(r.agency)}</span>` : ""}
              ${r.incidentDate && r.incidentDate !== "N/A" ? `<span class="pill">${escapeHTML(r.incidentDate)}</span>` : ""}
              ${r.incidentLocation && r.incidentLocation !== "N/A" ? `<span class="pill">${escapeHTML(r.incidentLocation)}</span>` : ""}
            </div>
            <h3 class="pdf-title">${escapeHTML(formatTitle(r.title))}</h3>
            <p class="pdf-blurb">${escapeHTML(r.blurb || "—")}</p>
            <div class="pdf-actions">
              <a href="${escapeHTML(r.dvidsPage)}" target="_blank" rel="noopener">OPEN ON DVIDS →</a>
              ${r.blurb && r.blurb.length > 240 ? `<button class="more" type="button" data-toggle>READ MORE</button>` : ""}
            </div>
          </div>
        </article>`
      )
      .join("");
    empty.classList.toggle("hidden", list.length > 0);

    grid.querySelectorAll("[data-toggle]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const card = e.currentTarget.closest(".vid-card");
        const expanded = card.classList.toggle("expanded");
        btn.textContent = expanded ? "COLLAPSE" : "READ MORE";
      })
    );
    grid.querySelectorAll(".vid-thumb-wrap").forEach((el) =>
      el.addEventListener("click", () => {
        const i = Number(el.closest(".vid-card").dataset.i);
        openLightbox(list, i, "video");
      })
    );
  };

  const renderActive = () => {
    if (activeTab === "pdfs") renderPdfs();
    else if (activeTab === "images") renderImages();
    else if (activeTab === "videos") renderVideos();
  };

  /* ======================= tabs / filters ======================= */
  const switchTab = (name) => {
    activeTab = name;
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".panel").forEach((p) => {
      const on = p.id === `panel-${name}`;
      p.classList.toggle("active", on);
      p.hidden = !on;
    });
    rebuildAgencyFilter();
    renderActive();
  };

  const rebuildAgencyFilter = () => {
    const list =
      activeTab === "pdfs" ? DATA.pdfs :
      activeTab === "images" ? DATA.images :
      DATA.videos;
    const agencies = Array.from(new Set(list.map((r) => r.agency).filter(Boolean))).sort();
    const sel = $("#agency-filter");
    const current = sel.value;
    sel.innerHTML =
      `<option value="">all agencies</option>` +
      agencies.map((a) => `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`).join("");
    if (agencies.includes(current)) sel.value = current;
    else { sel.value = ""; activeAgency = ""; }
  };

  /* ======================= lightbox ======================= */
  const openLightbox = (items, index, mode) => {
    lbItems = items.map((r) => ({ ...r, _mode: mode }));
    lbIndex = index;
    paintLightbox();
    $("#lightbox").hidden = false;
    document.body.style.overflow = "hidden";
  };
  const closeLightbox = () => {
    $("#lightbox").hidden = true;
    $("#lb-media").innerHTML = "";
    document.body.style.overflow = "";
  };
  const paintLightbox = () => {
    const r = lbItems[lbIndex];
    if (!r) return;
    const media = $("#lb-media");
    if (r._mode === "video") {
      media.innerHTML =
        `<iframe src="${escapeHTML(r.embed)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>`;
    } else {
      media.innerHTML =
        `<img src="${escapeHTML(r.url || r.thumb)}" alt="${escapeHTML(r.title)}" />`;
    }
    $("#lb-title").textContent = formatTitle(r.title);
    const meta = [];
    if (r.agency) meta.push(`<span class="pill agency">${escapeHTML(r.agency)}</span>`);
    if (r.incidentDate && r.incidentDate !== "N/A") meta.push(`<span class="pill">${escapeHTML(r.incidentDate)}</span>`);
    if (r.incidentLocation && r.incidentLocation !== "N/A") meta.push(`<span class="pill">${escapeHTML(r.incidentLocation)}</span>`);
    meta.push(`<span class="pill">${lbIndex + 1} / ${lbItems.length}</span>`);
    $("#lb-meta").innerHTML = meta.join("");
    $("#lb-blurb").textContent = r.blurb || "";
    const orig = $("#lb-original");
    if (r._mode === "video") {
      orig.href = r.dvidsPage;
      orig.textContent = "OPEN ON DVIDS →";
    } else {
      orig.href = r.url;
      orig.textContent = "OPEN ORIGINAL ON WAR.GOV →";
    }
  };
  const lbStep = (delta) => {
    lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
    paintLightbox();
  };

  /* ======================= boot ======================= */
  const wireEvents = () => {
    $$(".tab").forEach((t) =>
      t.addEventListener("click", () => switchTab(t.dataset.tab))
    );
    $("#search").addEventListener("input", (e) => {
      query = e.target.value.trim().toLowerCase();
      renderActive();
    });
    $("#agency-filter").addEventListener("change", (e) => {
      activeAgency = e.target.value;
      renderActive();
    });
    $(".lb-close").addEventListener("click", closeLightbox);
    $(".lb-prev").addEventListener("click", () => lbStep(-1));
    $(".lb-next").addEventListener("click", () => lbStep(1));
    $("#lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if ($("#lightbox").hidden) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lbStep(-1);
      if (e.key === "ArrowRight") lbStep(1);
    });
  };

  const paintCounts = () => {
    $("#pdf-count").textContent = DATA.pdfs.length;
    $("#img-count").textContent = DATA.images.length;
    $("#vid-count").textContent = DATA.videos.length;
    $("#counts").textContent =
      `${DATA.pdfs.length} PDFs · ${DATA.images.length} IMAGES · ${DATA.videos.length} VIDEOS`;
  };

  fetch("data.json")
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      paintCounts();
      rebuildAgencyFilter();
      wireEvents();
      renderActive();
    })
    .catch((err) => {
      $("#counts").textContent = "FAILED TO LOAD MANIFEST";
      console.error(err);
    });
})();
