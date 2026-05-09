/* UFO Release 01 — minimal app */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  let DATA = null;
  let SEARCH_INDEX = null;          // {i, stem, t}[] — populated async
  let SEARCH_HITS = null;            // Set<int> of pdf-indices matching current query (full-text)
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

  const matchQuery = (rec, q, listKind) => {
    if (!q) return true;
    const hay = [
      rec.title, rec.agency, rec.incidentDate, rec.incidentLocation,
      rec.blurb, rec.videoTitle,
    ].join(" ").toLowerCase();
    if (hay.includes(q)) return true;
    // Full-text fallback: only meaningful for PDFs (other tabs already match metadata).
    if (listKind === "pdfs" && SEARCH_HITS && SEARCH_HITS.size) {
      const idx = DATA.pdfs.indexOf(rec);
      if (SEARCH_HITS.has(idx)) return true;
    }
    return false;
  };

  // Walk the search index and rebuild the SEARCH_HITS set whenever the query changes.
  const rebuildSearchHits = () => {
    if (!query || !SEARCH_INDEX) { SEARCH_HITS = null; return; }
    const q = query.toLowerCase();
    const hits = new Set();
    for (const doc of SEARCH_INDEX) {
      if (doc.t.includes(q)) hits.add(doc.i);
    }
    SEARCH_HITS = hits;
  };

  const filtered = (list, listKind) =>
    list.filter(
      (r) =>
        (!activeAgency || r.agency === activeAgency) &&
        matchQuery(r, query, listKind)
    );

  /* ======================= renderers ======================= */
  const renderPdfs = () => {
    const grid = $("#pdf-grid");
    const empty = $("#pdf-empty");
    const list = filtered(DATA.pdfs, "pdfs");
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
    const list = filtered(DATA.images, "images");
    grid.innerHTML = list
      .map(
        (r, i) => {
          const ex = r.extractedFrom;
          const sourceLink = ex
            ? `<a href="${escapeHTML(ex.pdfUrl)}" target="_blank" rel="noopener">SOURCE PDF p${ex.page} →</a>`
            : `<a href="${escapeHTML(r.url)}" target="_blank" rel="noopener">OPEN ORIGINAL →</a>`;
          return `
        <article class="img-card${ex ? " extracted" : ""}" data-i="${i}">
          <button class="img-thumb-wrap" type="button" aria-label="Enlarge ${escapeHTML(r.title)}">
            <img loading="lazy" src="${escapeHTML(r.thumb || r.url)}" alt="${escapeHTML(r.title)}" />
            ${ex ? `<span class="extracted-badge">FROM PDF</span>` : ""}
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
              ${sourceLink}
              ${r.blurb && r.blurb.length > 240 ? `<button class="more" type="button" data-toggle>READ MORE</button>` : ""}
            </div>
          </div>
        </article>`;
        }
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
    const list = filtered(DATA.videos, "videos");
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
    } else if (r.extractedFrom) {
      orig.href = r.extractedFrom.pdfUrl;
      orig.textContent = `OPEN SOURCE PDF (page ${r.extractedFrom.page}) →`;
    } else {
      orig.href = r.url;
      orig.textContent = "OPEN ORIGINAL ON WAR.GOV →";
    }

    const pageUrl  = window.location.origin + window.location.pathname;
    const titleTxt = formatTitle(r.title);
    const shareTxt = `${titleTxt} — UFO Release 01 (war.gov)`;
    const enc = encodeURIComponent;
    $("#lb-share-x").href =
      `https://twitter.com/intent/tweet?text=${enc(shareTxt)}&url=${enc(pageUrl)}`;
    $("#lb-share-reddit").href =
      `https://www.reddit.com/submit?url=${enc(pageUrl)}&title=${enc(shareTxt)}`;
    $("#lb-share-mail").href =
      `mailto:?subject=${enc(shareTxt)}&body=${enc(shareTxt + "\n\n" + pageUrl + "\n\nOriginal: " + (r.dvidsPage || r.url || ""))}`;
  };
  const lbStep = (delta) => {
    lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
    paintLightbox();
  };

  /* ======================= download all ======================= */
  let downloadInProgress = false;

  const collectDownloadUrls = () => {
    const urls = [];
    for (const r of DATA.pdfs)   if (r.url) urls.push(r.url);
    for (const r of DATA.images) if (r.url && !r.extracted) urls.push(r.url);
    return urls;
  };

  const triggerDownload = (proxyUrl, filename) => {
    const a = document.createElement("a");
    a.href = proxyUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = async () => {
    if (downloadInProgress) return;
    const urls = collectDownloadUrls();
    const ok = window.confirm(
      `Download all ${urls.length} files (≈2.3 GB) directly from war.gov?\n\n` +
      `Your browser will ask permission to download multiple files — click ` +
      `"Allow" once. Files save to your default Downloads folder.\n\n` +
      `This may take several minutes.`
    );
    if (!ok) return;

    downloadInProgress = true;
    const btn = $("#download-all");
    const label = btn.querySelector(".dl-label");
    const prog  = btn.querySelector(".dl-progress");
    btn.classList.add("running");
    prog.hidden = false;

    let okCount = 0, failCount = 0;
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      const filename = u.split("/").pop().split("?")[0];
      const proxyUrl =
        `/api/download?url=${encodeURIComponent(u)}&name=${encodeURIComponent(filename)}`;
      try {
        triggerDownload(proxyUrl, filename);
        okCount++;
      } catch {
        failCount++;
      }
      label.textContent = "DOWNLOADING";
      prog.textContent = `${i + 1}/${urls.length}`;
      // Throttle: ~3 downloads/sec keeps the browser happy without dragging on forever
      await new Promise((r) => setTimeout(r, 350));
    }

    btn.classList.remove("running");
    label.textContent = "DOWNLOAD ALL";
    prog.textContent = `done (${okCount}${failCount ? ` · ${failCount} failed` : ""})`;
    setTimeout(() => { prog.hidden = true; prog.textContent = ""; }, 8000);
    downloadInProgress = false;
  };

  /* ======================= boot ======================= */
  const wireEvents = () => {
    $$(".tab").forEach((t) =>
      t.addEventListener("click", () => switchTab(t.dataset.tab))
    );
    $("#search").addEventListener("input", (e) => {
      query = e.target.value.trim().toLowerCase();
      rebuildSearchHits();
      renderActive();
    });
    $("#agency-filter").addEventListener("change", (e) => {
      activeAgency = e.target.value;
      renderActive();
    });
    $(".lb-close").addEventListener("click", closeLightbox);
    $(".lb-prev").addEventListener("click", () => lbStep(-1));
    $(".lb-next").addEventListener("click", () => lbStep(1));
    const downloadBtn = $("#download-all");
    if (downloadBtn) downloadBtn.addEventListener("click", () => downloadAll());
    $("#lb-share-copy").addEventListener("click", async () => {
      const btn = $("#lb-share-copy");
      const label = btn.querySelector(".lb-share-txt");
      const original = label.textContent;
      try {
        await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
        label.textContent = "COPIED";
      } catch {
        label.textContent = "FAILED";
      }
      btn.classList.add("ok");
      setTimeout(() => {
        label.textContent = original;
        btn.classList.remove("ok");
      }, 1400);
    });
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
      // Search index is fetched separately (≈1.3 MB) so the page renders fast.
      const searchInput = $("#search");
      const placeholder = searchInput.placeholder;
      searchInput.placeholder = "search title, agency, blurb…  (full text indexing…)";
      fetch("search-index.json")
        .then((r) => r.json())
        .then((idx) => {
          SEARCH_INDEX = idx.docs;
          searchInput.placeholder = "search title, agency, blurb, OR full PDF text…";
          if (query) { rebuildSearchHits(); renderActive(); }
        })
        .catch((err) => {
          searchInput.placeholder = placeholder;
          console.warn("search index failed to load:", err);
        });
    })
    .catch((err) => {
      $("#counts").textContent = "FAILED TO LOAD MANIFEST";
      console.error(err);
    });
})();
