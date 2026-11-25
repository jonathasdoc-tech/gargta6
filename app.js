/* ==========================================================================
   Leonida Garage — Aplicação Principal (GTA VI HUD)
   ========================================================================== */

(function () {
  const CATEGORIES = [
    { id: 'ALL', label: 'Todos' },
    { id: 'Super', label: 'Super' },
    { id: 'Esportivo', label: 'Esportivo' },
    { id: 'Clássico', label: 'Clássico' },
    { id: 'Muscle', label: 'Muscle' },
    { id: 'Off-Road', label: 'Off-Road' },
    { id: 'SUV / Luxo', label: 'SUV / Luxo' },
    { id: 'Moto', label: 'Moto' },
    { id: 'Aeronave / Barco', label: 'Aeronave / Barco' }
  ];

  const TRUNK_RANK = {
    'Sem Porta-Malas': 0,
    'Pequeno': 1,
    'Médio': 2,
    'Grande': 3,
    'Extra Grande': 4
  };

  let vehicles = [];
  let garageConfigs = {};
  let filterState = {
    search: '',
    category: 'ALL',
    garage: 'ALL',
    ownership: 'ALL',
    onlyFavorites: false,
    tacticalFilter: 'ALL',
    sortBy: 'recent',
    viewMode: 'grid'
  };

  let modalGallery = [];
  let modalTags = [];
  let modalSpawns = [];
  let activeInspectId = null;
  let activeMapTab = 'spawns';
  let mapRegionFilter = 'ALL';
  let deferredInstallPrompt = null;
  let pendingSpawnPasteId = null;
  let pendingConfirmAction = null;

  // -------------------------------------------------------------------------
  // UTILITÁRIOS DE SEGURANÇA, TEXTO E FALLBACK SVG
  // -------------------------------------------------------------------------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeText(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function sanitizeImageUrl(url, fallback) {
    if (!url || typeof url !== 'string') return fallback;
    const trimmed = url.trim();
    if (/^(https?:\/\/|data:image\/(png|jpeg|jpg|webp|gif|svg\+xml)|\.\/|\/)/i.test(trimmed)) {
      return trimmed;
    }
    return fallback;
  }

  function sanitizeExternalUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return '';
  }

  function encodeBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  function getFallbackSVG(name = 'GTA VI Vehicle', category = 'Super') {
    const colors = {
      'Super': ['#ff2a85', '#9d4edd'],
      'Esportivo': ['#00f0ff', '#3a86ff'],
      'Clássico': ['#ff006e', '#ffbe0b'],
      'Muscle': ['#fb5607', '#ff006e'],
      'Off-Road': ['#38b000', '#00f0ff'],
      'SUV / Luxo': ['#9d4edd', '#4361ee'],
      'Moto': ['#ff2a85', '#00f0ff'],
      'Aeronave / Barco': ['#00b4d8', '#0077b6']
    };
    const [c1, c2] = colors[category] || ['#ff2a85', '#00f0ff'];
    const safeName = escapeHtml(String(name).substring(0, 26));
    const safeCat = escapeHtml(String(category).toUpperCase());

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#12121e"/>
          <stop offset="100%" stop-color="#1e1b38"/>
        </linearGradient>
        <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="100%" stop-color="${c2}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="450" fill="url(#g)"/>
      <circle cx="400" cy="210" r="120" fill="url(#neon)" opacity="0.18"/>
      <path d="M180 270 L230 205 L330 185 L490 185 L590 215 L635 255 L635 280 L175 280 Z" fill="none" stroke="url(#neon)" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="265" cy="282" r="34" fill="#0b0b12" stroke="url(#neon)" stroke-width="5"/>
      <circle cx="545" cy="282" r="34" fill="#0b0b12" stroke="url(#neon)" stroke-width="5"/>
      <text x="400" y="355" font-family="sans-serif" font-weight="800" font-size="26" fill="white" text-anchor="middle">${safeName}</text>
      <text x="400" y="385" font-family="sans-serif" font-weight="600" font-size="14" fill="#00f0ff" letter-spacing="3" text-anchor="middle">${safeCat}</text>
    </svg>`;

    return `data:image/svg+xml;base64,${encodeBase64Utf8(svg)}`;
  }

  function bindImageFallbacks(root) {
    const imgs = root.querySelectorAll('img[data-fallback]');
    imgs.forEach((img) => {
      img.addEventListener(
        'error',
        () => {
          if (img.dataset.fallbackApplied) return;
          img.dataset.fallbackApplied = '1';
          img.src = img.dataset.fallback;
        },
        { once: true }
      );
    });
  }

  function getCategoryPresetKey(category) {
    if (category === 'Super') return 'super';
    if (category === 'Clássico') return 'classic';
    if (category === 'Muscle') return 'muscle';
    if (category === 'Off-Road') return 'offroad';
    if (category === 'SUV / Luxo') return 'suv';
    if (category === 'Moto') return 'moto';
    if (category === 'Aeronave / Barco') return 'boat';
    return 'sports';
  }

  function isPresetImageUrl(url) {
    if (!url) return false;
    return Object.values(window.STYLE_PRESETS || {}).includes(url.trim());
  }

  function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'glass-panel border border-vice-cyan/40 text-white px-4 py-3 rounded-2xl shadow-neon-cyan text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0';
    const span = document.createElement('span');
    span.textContent = String(message);
    toast.appendChild(span);
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function lockBodyScroll() {
    document.body.style.overflow = 'hidden';
  }

  function unlockBodyScrollIfNoModalOpen() {
    const ids = ['inspect-modal', 'vehicle-modal', 'confirm-modal', 'backup-modal', 'map-modal', 'image-lightbox'];
    const anyOpen = ids.some((id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
    if (!anyOpen) {
      document.body.style.overflow = '';
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  // -------------------------------------------------------------------------
  // COMPRESSÃO DE IMAGENS (WEBP COM FALLBACK JPEG)
  // -------------------------------------------------------------------------
  function compressImageFile(fileOrBlob, maxWidth = 960, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!fileOrBlob || !String(fileOrBlob.type || '').startsWith('image/')) {
        reject(new Error('Arquivo não é uma imagem válida'));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Não foi possível decodificar a imagem'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          let out = canvas.toDataURL('image/webp', quality);
          if (!out.startsWith('data:image/webp')) {
            out = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(out);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(fileOrBlob);
    });
  }

  // -------------------------------------------------------------------------
  // INICIALIZAÇÃO E PREFERÊNCIAS
  // -------------------------------------------------------------------------
  async function initApp() {
    const dbStatus = await window.GarageDB.init();
    if (dbStatus.usingFallback) {
      showToast('⚠️ IndexedDB bloqueado; usando armazenamento local reduzido.');
    }

    vehicles = await window.GarageDB.getAllVehicles();
    garageConfigs = (await window.GarageDB.getMeta('garageConfigs', {})) || {};

    const prefs = (await window.GarageDB.getMeta('preferences', {})) || {};
    if (prefs.viewMode === 'list' || prefs.viewMode === 'grid') {
      filterState.viewMode = prefs.viewMode;
    }
    if (prefs.sortBy) {
      filterState.sortBy = prefs.sortBy;
      const sortEl = document.getElementById('sort-select');
      if (sortEl) sortEl.value = prefs.sortBy;
    }
    applyViewModeButtons();

    populateRegionFilter();
    renderCategoryPills();
    renderTacticalFilterPills();
    renderAll();
    registerEvents();
    registerServiceWorker();
  }

  async function savePreferences() {
    await window.GarageDB.setMeta('preferences', {
      viewMode: filterState.viewMode,
      sortBy: filterState.sortBy
    });
  }

  async function saveVehiclesAndRender() {
    try {
      await window.GarageDB.saveAllVehicles(vehicles);
    } catch (err) {
      showToast(`❌ Erro ao salvar: ${err.message || 'espaço insuficiente'}`);
    }
    renderAll();
  }

  // -------------------------------------------------------------------------
  // RENDERIZAÇÃO PRINCIPAL (STATS, FILTROS, CARDS)
  // -------------------------------------------------------------------------
  function renderAll() {
    updateStats();
    updateGarageDropdown();
    updateGarageDatalist();
    renderVehicles();
    updateFilterResetVisibility();
    updateStatCardHighlights();
  }

  function updateStats() {
    const ownedCount = vehicles.filter((v) => v.ownership !== 'wishlist').length;
    document.getElementById('stat-total').textContent = ownedCount;
    document.getElementById('stat-favorites').textContent = vehicles.filter((v) => v.favorite).length;
    const uniqueGarages = new Set(vehicles.map((v) => v.garage.trim()).filter(Boolean));
    document.getElementById('stat-garages').textContent = uniqueGarages.size;
    document.getElementById('stat-tuned').textContent = vehicles.filter((v) => v.tuning === 'Full Tunado').length;
  }

  function updateStatCardHighlights() {
    const favCard = document.getElementById('stat-card-fav');
    const tunedCard = document.getElementById('stat-card-tuned');
    favCard.classList.toggle('stat-card-active', filterState.onlyFavorites);
    tunedCard.classList.toggle('stat-card-active', filterState.tacticalFilter === 'FULL_TUNED');
  }

  function renderCategoryPills() {
    const container = document.getElementById('category-pills');
    container.innerHTML = CATEGORIES.map((cat) => {
      const active = filterState.category === cat.id;
      return `
        <button
          type="button"
          data-category="${escapeHtml(cat.id)}"
          class="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer ${
            active
              ? 'bg-vice-cyan text-vice-bg shadow-neon-cyan'
              : 'bg-vice-bg/80 text-gray-300 hover:text-white border border-white/10 hover:border-white/25'
          }">
          ${escapeHtml(cat.label)}
        </button>
      `;
    }).join('');
  }

  function renderTacticalFilterPills() {
    const container = document.getElementById('tactical-filter-pills');
    const options = [
      { id: 'ALL', label: 'Todos' },
      { id: 'FULL_TUNED', label: '⚡ Full Tunado' },
      { id: 'BIG_TRUNK', label: '🧳 Porta-Malas Grande' },
      { id: 'HAS_SPAWN', label: '📍 Com Spawn Salvo' },
      { id: '4 Lugares', label: '👥 4+ Lugares' },
      { id: 'Blindado', label: '🛡️ Blindado' },
      { id: 'Off-Road', label: '🏜️ Off-Road' },
      { id: 'Corrida', label: '🏎️ Corrida' },
      { id: 'Drift', label: '🌴 Drift' },
      { id: 'Fuga / Discreto', label: '🕶️ Fuga' }
    ];

    container.innerHTML = options.map((opt) => {
      const active = filterState.tacticalFilter === opt.id;
      return `
        <button
          type="button"
          data-tactical="${escapeHtml(opt.id)}"
          class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
            active
              ? 'bg-vice-pink text-white shadow-neon-pink'
              : 'bg-vice-bg text-gray-300 hover:text-white border border-white/10'
          }">
          ${escapeHtml(opt.label)}
        </button>
      `;
    }).join('');
  }

  function updateGarageDropdown() {
    const select = document.getElementById('garage-filter');
    const garages = [...new Set(vehicles.map((v) => v.garage.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );

    if (filterState.garage !== 'ALL' && !garages.includes(filterState.garage)) {
      filterState.garage = 'ALL';
    }

    select.innerHTML =
      `<option value="ALL">📍 Todas as Garagens (${garages.length})</option>` +
      garages
        .map(
          (g) =>
            `<option value="${escapeHtml(g)}" ${filterState.garage === g ? 'selected' : ''}>🏢 ${escapeHtml(g)}</option>`
        )
        .join('');
  }

  function updateGarageDatalist() {
    const datalist = document.getElementById('garages-list');
    const baseGarages = [
      'Garagem Principal',
      'Garagem Vice Beach',
      'Mansão Starfish Island',
      'Galpão Port Gellhorn',
      'Garagem Leonida Keys',
      'Cobertura Ocean Drive',
      'Clubhouse Kelly County',
      'Marina Vice Port',
      'Shore Court Garage'
    ];
    const fromVehicles = vehicles.map((v) => v.garage.trim()).filter(Boolean);
    const merged = [...new Set([...fromVehicles, ...baseGarages])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    datalist.innerHTML = merged.map((g) => `<option value="${escapeHtml(g)}">`).join('');
  }

  function getFilteredAndSortedVehicles() {
    const q = normalizeText(filterState.search);
    const filtered = vehicles.filter((v) => {
      const haystack = normalizeText(
        [
          v.name,
          v.realModel,
          v.manufacturer,
          v.garage,
          v.plate,
          v.color,
          v.notes,
          v.trunkNotes,
          v.owner,
          (v.tags || []).join(' ')
        ].join(' ')
      );
      const matchesSearch = !q || haystack.includes(q);
      const matchesCategory = filterState.category === 'ALL' || v.category === filterState.category;
      const matchesGarage = filterState.garage === 'ALL' || v.garage.trim() === filterState.garage;
      const matchesOwnership = filterState.ownership === 'ALL' || (v.ownership || 'owned') === filterState.ownership;
      const matchesFav = !filterState.onlyFavorites || v.favorite;

      let matchesTactical = true;
      const tf = filterState.tacticalFilter;
      if (tf === 'FULL_TUNED') matchesTactical = v.tuning === 'Full Tunado';
      else if (tf === 'BIG_TRUNK') matchesTactical = v.trunkSize === 'Grande' || v.trunkSize === 'Extra Grande';
      else if (tf === 'HAS_SPAWN') matchesTactical = Array.isArray(v.spawns) && v.spawns.length > 0;
      else if (tf === '4 Lugares') matchesTactical = Number(v.seats) >= 4 || (v.tags || []).includes('4 Lugares');
      else if (tf !== 'ALL') matchesTactical = (v.tags || []).includes(tf);

      return matchesSearch && matchesCategory && matchesGarage && matchesOwnership && matchesFav && matchesTactical;
    });

    const sorted = [...filtered];
    switch (filterState.sortBy) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name, 'pt-BR'));
        break;
      case 'fav':
        sorted.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR'));
        break;
      case 'garage':
        sorted.sort((a, b) => a.garage.localeCompare(b.garage, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
        break;
      case 'speed':
        sorted.sort((a, b) => (b.stats?.speed || 0) - (a.stats?.speed || 0));
        break;
      case 'trunk':
        sorted.sort((a, b) => (TRUNK_RANK[b.trunkSize] || 0) - (TRUNK_RANK[a.trunkSize] || 0));
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
    }
    return sorted;
  }

  function renderVehicles() {
    const container = document.getElementById('vehicles-container');
    const emptyState = document.getElementById('empty-state');
    const resultsCount = document.getElementById('results-count');

    const filtered = getFilteredAndSortedVehicles();
    resultsCount.innerHTML = `Exibindo <span class="text-white font-bold">${filtered.length}</span> de ${vehicles.length} veículos`;

    if (filtered.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    container.classList.remove('hidden');

    if (filterState.viewMode === 'grid') {
      container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5';
      container.innerHTML = filtered.map((v) => createGridCard(v)).join('');
    } else {
      container.className = 'flex flex-col gap-3';
      container.innerHTML = filtered.map((v) => createListCard(v)).join('');
    }

    bindImageFallbacks(container);
  }

  function getTrunkShortLabel(trunkSize) {
    if (!trunkSize || trunkSize === 'Sem Porta-Malas') return 'Sem mala';
    if (trunkSize === 'Extra Grande') return 'Mala XG';
    return `Mala ${trunkSize}`;
  }

  function createGridCard(v) {
    const fallback = getFallbackSVG(v.name, v.category);
    const imgSrc = sanitizeImageUrl(v.image, fallback);
    const tuningBadgeColor =
      v.tuning === 'Full Tunado'
        ? 'text-amber-300 border-amber-400/40 bg-amber-500/15'
        : v.tuning === 'Semi-Tunado'
          ? 'text-vice-cyan border-vice-cyan/40 bg-vice-cyan/15'
          : 'text-gray-300 border-white/20 bg-black/60';
    const hasSpawns = Array.isArray(v.spawns) && v.spawns.length > 0;

    return `
      <article data-vehicle-id="${escapeHtml(v.id)}" class="glass-panel rounded-2xl overflow-hidden card-hover flex flex-col group">
        <!-- Vehicle Image (Click to Inspect) -->
        <div data-action="inspect" class="relative aspect-video bg-vice-bg overflow-hidden cursor-pointer">
          <img
            src="${escapeHtml(imgSrc)}"
            data-fallback="${escapeHtml(fallback)}"
            alt="${escapeHtml(v.name)}"
            loading="lazy"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-vice-card via-transparent to-black/30 opacity-90"></div>

          <!-- Category & Wishlist Badges -->
          <div class="absolute top-3 left-3 flex items-center gap-1.5">
            <span class="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-vice-bg/85 text-vice-pink border border-vice-pink/40 backdrop-blur-md">
              ${escapeHtml(v.category)}
            </span>
            ${v.ownership === 'wishlist' ? `<span class="px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-amber-400/90 text-black">Desejo</span>` : ''}
          </div>

          <!-- Favorite Star Button -->
          <button
            type="button"
            data-action="favorite"
            title="${v.favorite ? 'Remover dos favoritos' : 'Marcar como favorito'}"
            class="absolute top-2.5 right-2.5 p-2 rounded-xl bg-black/65 hover:bg-black/90 backdrop-blur-md border border-white/15 transition cursor-pointer">
            <svg class="w-4 h-4 ${v.favorite ? 'text-amber-400 fill-amber-400' : 'text-gray-400'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>

          <!-- Bottom Manufacturer & Tuning -->
          <div class="absolute bottom-2.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
            <span class="text-[11px] font-bold uppercase tracking-widest text-vice-cyan drop-shadow truncate">
              ${escapeHtml(v.manufacturer)}
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border backdrop-blur-md shrink-0 ${tuningBadgeColor}">
              ${escapeHtml(v.tuning)}
            </span>
          </div>
        </div>

        <!-- Card Content -->
        <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <h3 data-action="inspect" class="font-display font-extrabold text-lg text-white group-hover:text-vice-cyan transition cursor-pointer leading-snug">
              ${escapeHtml(v.name)}
            </h3>
            ${v.realModel ? `<p class="text-[11px] text-gray-400 truncate mt-0.5">${escapeHtml(v.realModel)}</p>` : ''}
            <p class="text-xs text-gray-400 mt-1.5 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-vice-pink shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span class="truncate">${escapeHtml(v.garage)}${v.garageSlot ? ` • ${escapeHtml(v.garageSlot)}` : ''}</span>
            </p>
            <div class="flex flex-wrap items-center gap-1.5 mt-2">
              <span class="px-2 py-0.5 rounded-md bg-vice-bg/90 border border-white/10 text-[10px] font-semibold text-gray-300">👥 ${escapeHtml(v.seats)}</span>
              <span class="px-2 py-0.5 rounded-md bg-vice-bg/90 border border-white/10 text-[10px] font-semibold text-gray-300">🎒 ${escapeHtml(getTrunkShortLabel(v.trunkSize))}</span>
              ${hasSpawns ? `<span class="px-2 py-0.5 rounded-md bg-vice-pink/15 border border-vice-pink/30 text-[10px] font-semibold text-vice-pink">📍 ${v.spawns.length} spawn</span>` : ''}
            </div>
          </div>

          <!-- Color / Plate & Quick Actions -->
          <div class="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              ${v.plate ? `<span class="px-2 py-0.5 rounded bg-vice-bg border border-white/15 font-mono text-[11px] font-bold text-gray-200 shrink-0">${escapeHtml(v.plate)}</span>` : ''}
              <span class="text-[11px] text-gray-400 truncate">${escapeHtml(v.color || 'Cor Padrão')}</span>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button type="button" data-action="edit" title="Editar" class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button type="button" data-action="delete" title="Remover" class="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function createListCard(v) {
    const fallback = getFallbackSVG(v.name, v.category);
    const imgSrc = sanitizeImageUrl(v.image, fallback);
    return `
      <article data-vehicle-id="${escapeHtml(v.id)}" class="glass-panel rounded-2xl p-3 flex items-center gap-3.5 sm:gap-4 card-hover">
        <!-- Thumbnail -->
        <div data-action="inspect" class="relative w-28 sm:w-40 aspect-video rounded-xl overflow-hidden bg-vice-bg shrink-0 cursor-pointer">
          <img
            src="${escapeHtml(imgSrc)}"
            data-fallback="${escapeHtml(fallback)}"
            alt="${escapeHtml(v.name)}"
            loading="lazy"
            class="w-full h-full object-cover"
          />
        </div>

        <!-- Info -->
        <div data-action="inspect" class="flex-1 min-w-0 cursor-pointer">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-vice-cyan">${escapeHtml(v.manufacturer)}</span>
            <span class="text-[10px] px-2 py-0.5 rounded bg-vice-pink/20 text-vice-pink font-bold">${escapeHtml(v.category)}</span>
            ${v.ownership === 'wishlist' ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-black font-bold">Desejo</span>` : ''}
            ${v.plate ? `<span class="hidden sm:inline-block px-1.5 py-0.5 rounded bg-vice-bg border border-white/10 font-mono text-[10px] text-gray-300">${escapeHtml(v.plate)}</span>` : ''}
          </div>
          <h3 class="font-display font-bold text-base sm:text-lg text-white truncate mt-0.5">
            ${escapeHtml(v.name)}
            ${v.realModel ? `<span class="text-xs font-normal text-gray-400 ml-1.5">(${escapeHtml(v.realModel)})</span>` : ''}
          </h3>
          <p class="text-xs text-gray-400 truncate mt-0.5">
            📍 ${escapeHtml(v.garage)} • <span class="text-gray-300">${escapeHtml(v.tuning)}</span> • 👥 ${escapeHtml(v.seats)} • 🎒 ${escapeHtml(getTrunkShortLabel(v.trunkSize))}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button type="button" data-action="favorite" class="p-2 rounded-xl hover:bg-white/10 transition cursor-pointer" title="Favorito">
            <svg class="w-5 h-5 ${v.favorite ? 'text-amber-400 fill-amber-400' : 'text-gray-500'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          <button type="button" data-action="edit" class="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer" title="Editar">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button type="button" data-action="delete" class="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer" title="Remover">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </article>
    `;
  }

  // -------------------------------------------------------------------------
  // FILTROS E CONTROLES DA TOOLBAR
  // -------------------------------------------------------------------------
  function handleSearch(val) {
    filterState.search = val;
    const clearBtn = document.getElementById('clear-search-btn');
    clearBtn.classList.toggle('hidden', !val.trim());
    renderVehicles();
    updateFilterResetVisibility();
  }

  function clearSearch() {
    document.getElementById('search-input').value = '';
    handleSearch('');
  }

  function applyViewModeButtons() {
    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');
    if (filterState.viewMode === 'grid') {
      gridBtn.className = 'p-2 rounded-lg bg-vice-pink text-white transition cursor-pointer';
      listBtn.className = 'p-2 rounded-lg text-gray-400 hover:text-white transition cursor-pointer';
    } else {
      listBtn.className = 'p-2 rounded-lg bg-vice-pink text-white transition cursor-pointer';
      gridBtn.className = 'p-2 rounded-lg text-gray-400 hover:text-white transition cursor-pointer';
    }
  }

  function updateFilterResetVisibility() {
    const hasActiveFilters =
      filterState.search.trim() !== '' ||
      filterState.category !== 'ALL' ||
      filterState.garage !== 'ALL' ||
      filterState.ownership !== 'ALL' ||
      filterState.onlyFavorites ||
      filterState.tacticalFilter !== 'ALL';

    document.getElementById('reset-filters-btn').classList.toggle('hidden', !hasActiveFilters);
  }

  function resetAllFilters() {
    filterState.search = '';
    filterState.category = 'ALL';
    filterState.garage = 'ALL';
    filterState.ownership = 'ALL';
    filterState.onlyFavorites = false;
    filterState.tacticalFilter = 'ALL';

    document.getElementById('search-input').value = '';
    document.getElementById('clear-search-btn').classList.add('hidden');
    document.getElementById('garage-filter').value = 'ALL';
    document.getElementById('ownership-filter').value = 'ALL';
    document.getElementById('fav-filter-btn').classList.remove('border-amber-400', 'bg-amber-400/15', 'text-white');

    renderCategoryPills();
    renderTacticalFilterPills();
    renderVehicles();
    updateFilterResetVisibility();
    updateStatCardHighlights();
  }

  // -------------------------------------------------------------------------
  // MODAL 1: INSPEÇÃO VISUAL DO VEÍCULO
  // -------------------------------------------------------------------------
  function openInspectModal(id) {
    const v = vehicles.find((item) => item.id === id);
    if (!v) return;
    activeInspectId = id;

    const modal = document.getElementById('inspect-modal');
    const fallback = getFallbackSVG(v.name, v.category);
    const mainSrc = sanitizeImageUrl(v.image, fallback);

    const imgEl = document.getElementById('inspect-img');
    delete imgEl.dataset.fallbackApplied;
    imgEl.src = mainSrc;
    imgEl.dataset.fallback = fallback;
    bindImageFallbacks(modal);

    // Gallery thumbnails strip
    const galleryStrip = document.getElementById('inspect-gallery-strip');
    const allPhotos = [mainSrc, ...(v.gallery || []).map((g) => sanitizeImageUrl(g, fallback))].filter(Boolean);
    if (allPhotos.length > 1) {
      galleryStrip.classList.remove('hidden');
      galleryStrip.innerHTML = allPhotos
        .map(
          (src, idx) => `
          <button type="button" data-gallery-src="${escapeHtml(src)}" class="w-20 aspect-video rounded-lg overflow-hidden border ${idx === 0 ? 'border-vice-cyan' : 'border-white/15'} hover:border-vice-pink transition shrink-0 cursor-pointer">
            <img src="${escapeHtml(src)}" alt="Foto ${idx + 1}" class="w-full h-full object-cover" />
          </button>
        `
        )
        .join('');
    } else {
      galleryStrip.classList.add('hidden');
      galleryStrip.innerHTML = '';
    }

    document.getElementById('inspect-category').textContent = v.category;
    document.getElementById('inspect-tuning').textContent = v.tuning;
    document.getElementById('inspect-owner-badge').textContent = v.owner || 'Compartilhado';
    document.getElementById('inspect-wishlist-badge').classList.toggle('hidden', v.ownership !== 'wishlist');

    document.getElementById('inspect-manufacturer').textContent = v.manufacturer;
    document.getElementById('inspect-name').textContent = v.name;

    const realModelEl = document.getElementById('inspect-realmodel');
    if (v.realModel) {
      realModelEl.textContent = `Inspiração real: ${v.realModel}`;
      realModelEl.classList.remove('hidden');
    } else {
      realModelEl.classList.add('hidden');
    }

    document.getElementById('inspect-garage').innerHTML = `<span>🏢</span> <span>${escapeHtml(v.garage)}${v.garageSlot ? ` (${escapeHtml(v.garageSlot)})` : ''}</span>`;
    document.getElementById('inspect-color').textContent = v.color || 'Padrão de Fábrica';
    document.getElementById('inspect-plate').textContent = v.plate || 'SEM PLACA';

    document.getElementById('inspect-trunk-size').textContent = v.trunkSize || 'Médio';
    document.getElementById('inspect-seats').textContent = `${v.seats || 2} ${Number(v.seats) === 1 ? 'Lugar' : 'Lugares'}`;
    document.getElementById('inspect-drivetrain').textContent = v.drivetrain || 'N/D';
    document.getElementById('inspect-price').textContent = v.price || 'Não informado';

    const trunkBox = document.getElementById('inspect-trunk-notes-box');
    if (v.trunkNotes) {
      trunkBox.classList.remove('hidden');
      document.getElementById('inspect-trunk-notes').textContent = v.trunkNotes;
    } else {
      trunkBox.classList.add('hidden');
    }

    // Performance Stats Bars
    const stats = v.stats || {};
    const statRows = [
      { label: 'Velocidade', val: stats.speed ?? 5 },
      { label: 'Aceleração', val: stats.acceleration ?? 5 },
      { label: 'Asfalto', val: stats.asphalt ?? 5 },
      { label: 'Off-Road', val: stats.offroad ?? 3.5 },
      { label: 'Resistência', val: stats.durability ?? 5 }
    ];
    document.getElementById('inspect-stats-bars').innerHTML = statRows
      .map((s) => {
        const pct = Math.min(100, Math.max(0, Number(s.val) * 10));
        return `
          <div>
            <div class="flex justify-between text-[11px] mb-1">
              <span class="text-gray-300 font-medium">${escapeHtml(s.label)}</span>
              <span class="text-vice-cyan font-mono font-bold">${Number(s.val).toFixed(1)}/10</span>
            </div>
            <div class="stat-bar-track">
              <div class="stat-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');

    // Tags
    const tagsBox = document.getElementById('inspect-tags-box');
    if (Array.isArray(v.tags) && v.tags.length > 0) {
      tagsBox.classList.remove('hidden');
      tagsBox.innerHTML = v.tags
        .map(
          (t) => `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-vice-surface text-vice-cyan border border-vice-cyan/30">${escapeHtml(t)}</span>`
        )
        .join('');
    } else {
      tagsBox.classList.add('hidden');
      tagsBox.innerHTML = '';
    }

    // Notes
    const notesBox = document.getElementById('inspect-notes-box');
    if (v.notes) {
      notesBox.classList.remove('hidden');
      document.getElementById('inspect-notes').textContent = v.notes;
    } else {
      notesBox.classList.add('hidden');
    }

    // Spawns
    const spawnsBox = document.getElementById('inspect-spawns-box');
    const spawnsList = document.getElementById('inspect-spawns-list');
    if (Array.isArray(v.spawns) && v.spawns.length > 0) {
      spawnsBox.classList.remove('hidden');
      spawnsList.innerHTML = v.spawns
        .map((sp) => {
          const safeUrl = sanitizeExternalUrl(sp.mapUrl);
          const safePrint = sp.mapImage ? sanitizeImageUrl(sp.mapImage, '') : '';
          return `
            <div class="bg-vice-bg/80 p-3.5 rounded-2xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded-md bg-vice-pink/20 text-vice-pink text-[10px] font-bold uppercase">${escapeHtml(sp.region || 'Leonida')}</span>
                  ${sp.condition ? `<span class="text-[11px] text-amber-300 font-semibold">🕒 ${escapeHtml(sp.condition)}</span>` : ''}
                </div>
                <p class="text-xs sm:text-sm text-gray-200 leading-snug">${escapeHtml(sp.location || 'Localização salva no mapa')}</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                ${
                  safePrint
                    ? `<button type="button" data-lightbox-src="${escapeHtml(safePrint)}" data-lightbox-caption="${escapeHtml(`${v.name} — Spawn em ${sp.region}`)}" class="w-16 aspect-video rounded-lg overflow-hidden border border-vice-cyan/40 hover:border-vice-pink transition cursor-zoom-in shrink-0" title="Ampliar print do mapa">
                         <img src="${escapeHtml(safePrint)}" alt="Print do mapa" class="w-full h-full object-cover" />
                       </button>`
                    : ''
                }
                ${
                  safeUrl
                    ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="px-3 py-2 rounded-xl bg-vice-surface hover:bg-vice-cyan hover:text-vice-bg text-vice-cyan border border-vice-cyan/30 text-xs font-bold transition whitespace-nowrap">
                         Abrir no Mapa ↗
                       </a>`
                    : ''
                }
              </div>
            </div>
          `;
        })
        .join('');
    } else {
      spawnsBox.classList.add('hidden');
      spawnsList.innerHTML = '';
    }

    // Favorite Button
    const favBtn = document.getElementById('inspect-fav-btn');
    favBtn.innerHTML = `
      <svg class="w-6 h-6 ${v.favorite ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    `;

    document.getElementById('inspect-quick-garage-input').value = v.garage;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lockBodyScroll();
  }

  function closeInspectModal() {
    const modal = document.getElementById('inspect-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    activeInspectId = null;
    unlockBodyScrollIfNoModalOpen();
  }

  // -------------------------------------------------------------------------
  // MODAL 2: ADICIONAR / EDITAR VEÍCULO + AUTOCOMPLETAR + SPAWNS
  // -------------------------------------------------------------------------
  function openVehicleModal(editId = null) {
    const modal = document.getElementById('vehicle-modal');
    const form = document.getElementById('vehicle-form');
    const title = document.getElementById('modal-title');
    form.reset();
    hideCatalogAutocomplete();
    pendingSpawnPasteId = null;

    if (editId) {
      const v = vehicles.find((item) => item.id === editId);
      if (!v) return;
      title.textContent = 'Editar Veículo';
      document.getElementById('form-id').value = v.id;
      document.getElementById('form-name').value = v.name;
      document.getElementById('form-manufacturer').value = v.manufacturer;
      document.getElementById('form-real-model').value = v.realModel || '';
      document.getElementById('form-category').value = v.category;
      document.getElementById('form-ownership').value = v.ownership || 'owned';
      document.getElementById('form-owner').value = v.owner || 'Compartilhado';
      document.getElementById('form-garage').value = v.garage;
      document.getElementById('form-garage-slot').value = v.garageSlot || '';
      document.getElementById('form-color').value = v.color || '';
      document.getElementById('form-plate').value = v.plate || '';
      document.getElementById('form-tuning').value = v.tuning || 'Original';
      document.getElementById('form-price').value = v.price || '';
      document.getElementById('form-trunk-size').value = v.trunkSize || 'Médio';
      document.getElementById('form-trunk-notes').value = v.trunkNotes || '';
      document.getElementById('form-seats').value = String(v.seats || 2);
      document.getElementById('form-drivetrain').value = v.drivetrain || '';
      document.getElementById('form-notes').value = v.notes || '';
      document.getElementById('form-favorite').checked = !!v.favorite;

      setFormStats(v.stats || {});
      modalTags = [...(v.tags || [])];
      modalGallery = [...(v.gallery || [])];
      modalSpawns = window.GarageDB.cloneData(v.spawns || []);

      const fallback = getFallbackSVG(v.name, v.category);
      const previewUrl = sanitizeImageUrl(v.image, fallback);
      document.getElementById('form-image-url').value = previewUrl.startsWith('data:') ? '' : previewUrl;
      const preview = document.getElementById('form-img-preview');
      preview.src = previewUrl;
      preview.dataset.currentImage = previewUrl;
      document.getElementById('wiki-search-input').value = v.realModel || v.name || '';
    } else {
      title.textContent = 'Adicionar Novo Veículo';
      document.getElementById('form-id').value = '';
      document.getElementById('form-ownership').value = 'owned';
      document.getElementById('form-owner').value = 'Compartilhado';
      document.getElementById('form-garage').value = 'Garagem Principal';
      document.getElementById('form-tuning').value = 'Original';
      document.getElementById('form-trunk-size').value = 'Pequeno';
      document.getElementById('form-seats').value = '2';
      document.getElementById('wiki-search-input').value = '';

      setFormStats({ speed: 5.0, acceleration: 5.0, asphalt: 5.0, offroad: 3.5, durability: 5.0 });
      modalTags = [];
      modalGallery = [];
      modalSpawns = [];

      const defaultImg = window.STYLE_PRESETS.super;
      const preview = document.getElementById('form-img-preview');
      preview.src = defaultImg;
      preview.dataset.currentImage = defaultImg;
    }

    document.getElementById('wiki-search-panel').classList.add('hidden');
    document.getElementById('wiki-search-results').innerHTML = '';
    document.getElementById('wiki-search-status').textContent = '';

    renderFormTags();
    renderFormGallery();
    renderFormSpawns();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lockBodyScroll();
  }

  function closeVehicleModal() {
    const modal = document.getElementById('vehicle-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    hideCatalogAutocomplete();
    pendingSpawnPasteId = null;
    unlockBodyScrollIfNoModalOpen();
  }

  function setFormStats(stats) {
    const map = [
      ['speed', stats.speed ?? 5.0],
      ['acceleration', stats.acceleration ?? 5.0],
      ['asphalt', stats.asphalt ?? 5.0],
      ['offroad', stats.offroad ?? 3.5],
      ['durability', stats.durability ?? 5.0]
    ];
    map.forEach(([key, val]) => {
      const num = Number(val).toFixed(1);
      document.getElementById(`form-stat-${key}`).value = num;
      document.getElementById(`val-stat-${key}`).textContent = num;
    });
  }

  function renderFormTags() {
    const container = document.getElementById('form-tags-container');
    container.innerHTML = (window.TACTICAL_TAGS || [])
      .map((tag) => {
        const active = modalTags.includes(tag.id);
        return `
          <button
            type="button"
            data-form-tag="${escapeHtml(tag.id)}"
            class="px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
              active
                ? 'bg-vice-cyan text-vice-bg shadow-neon-cyan'
                : 'bg-vice-bg text-gray-300 hover:text-white border border-white/15'
            }">
            ${escapeHtml(tag.label)}
          </button>
        `;
      })
      .join('');
  }

  function renderFormGallery() {
    const container = document.getElementById('form-gallery-preview');
    if (modalGallery.length === 0) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }
    container.classList.remove('hidden');
    container.innerHTML = modalGallery
      .map(
        (src, idx) => `
        <div class="relative w-24 aspect-video rounded-xl overflow-hidden border border-white/20 bg-vice-bg">
          <img src="${escapeHtml(src)}" alt="Extra ${idx + 1}" class="w-full h-full object-cover" />
          <button type="button" data-remove-gallery="${idx}" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 hover:bg-red-600 text-white text-xs flex items-center justify-center cursor-pointer" title="Remover foto extra">×</button>
        </div>
      `
      )
      .join('');
  }

  function renderFormSpawns() {
    const container = document.getElementById('form-spawns-list');
    if (modalSpawns.length === 0) {
      container.innerHTML = `<p class="text-xs text-gray-500 italic">Nenhum spawn cadastrado. Clique em "+ Novo Local" para registrar onde este carro aparece.</p>`;
      return;
    }

    const regions = window.LEONIDA_REGIONS || ['Vice City'];
    container.innerHTML = modalSpawns
      .map((sp) => {
        const regionOpts = regions
          .map((r) => `<option value="${escapeHtml(r)}" ${sp.region === r ? 'selected' : ''}>${escapeHtml(r)}</option>`)
          .join('');
        return `
          <div data-spawn-id="${escapeHtml(sp.id)}" class="bg-vice-bg/90 p-3 rounded-xl border border-white/10 space-y-2.5">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select data-spawn-field="region" class="bg-vice-surface border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none">
                ${regionOpts}
              </select>
              <input data-spawn-field="condition" type="text" value="${escapeHtml(sp.condition || '')}" placeholder="Horário / Condição (ex: Dia, ~17h)" class="bg-vice-surface border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none" />
              <div class="flex items-center justify-end">
                <button type="button" data-remove-spawn="${escapeHtml(sp.id)}" class="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-bold cursor-pointer">
                  Remover Local
                </button>
              </div>
            </div>
            <input data-spawn-field="location" type="text" value="${escapeHtml(sp.location || '')}" placeholder="Ponto de referência exato (ex: Garagem Del Rio Blvd, código 92665)" class="w-full bg-vice-surface border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white outline-none" />
            <div class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <input data-spawn-field="mapUrl" type="url" value="${escapeHtml(sp.mapUrl || '')}" placeholder="Link do pino (https://gta6-maps.net/pt-br... ou gtabase.com)" class="flex-1 bg-vice-surface border border-white/15 rounded-lg px-3 py-1.5 text-xs text-vice-cyan outline-none" />
              <div class="flex items-center gap-1.5 shrink-0">
                <label class="cursor-pointer px-2.5 py-1.5 rounded-lg bg-vice-surface hover:bg-white/10 border border-white/15 text-[11px] font-semibold text-gray-200">
                  📸 Print Mapa
                  <input type="file" accept="image/*" data-spawn-file="${escapeHtml(sp.id)}" class="hidden" />
                </label>
                <button type="button" data-spawn-paste="${escapeHtml(sp.id)}" class="px-2.5 py-1.5 rounded-lg bg-vice-surface hover:bg-vice-cyan/20 border border-vice-cyan/30 text-[11px] font-semibold text-vice-cyan cursor-pointer" title="Clique aqui e aperte Ctrl+V para colar um print do mapa">
                  ${pendingSpawnPasteId === sp.id ? 'Aguardando Ctrl+V...' : 'Ctrl+V Print'}
                </button>
                ${
                  sp.mapImage
                    ? `<button type="button" data-spawn-clear-img="${escapeHtml(sp.id)}" class="px-2 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-[11px] font-bold cursor-pointer" title="Remover print">✕</button>`
                    : ''
                }
              </div>
            </div>
            ${
              sp.mapImage
                ? `<div class="pt-1">
                     <img src="${escapeHtml(sp.mapImage)}" alt="Preview print spawn" class="h-20 rounded-lg border border-vice-cyan/30 object-cover cursor-zoom-in" data-lightbox-src="${escapeHtml(sp.mapImage)}" data-lightbox-caption="Print do mapa (${escapeHtml(sp.region)})" />
                   </div>`
                : ''
            }
          </div>
        `;
      })
      .join('');
  }

  function showCatalogAutocomplete(query) {
    const box = document.getElementById('catalog-autocomplete');
    const q = normalizeText(query);
    if (!q || q.length < 2) {
      hideCatalogAutocomplete();
      return;
    }

    const catalog = window.GTA6_CATALOG || [];
    const matches = catalog
      .filter((item) => {
        const hay = normalizeText(`${item.name} ${item.manufacturer} ${item.realModel}`);
        return hay.includes(q);
      })
      .slice(0, 8);

    if (matches.length === 0) {
      hideCatalogAutocomplete();
      return;
    }

    box.innerHTML = matches
      .map(
        (m) => `
        <button type="button" data-catalog-id="${escapeHtml(m.id)}" class="w-full text-left px-3.5 py-2.5 hover:bg-white/10 transition flex items-center justify-between gap-2 cursor-pointer">
          <div class="min-w-0">
            <p class="text-xs font-bold text-white truncate">${escapeHtml(m.name)}</p>
            <p class="text-[10px] text-gray-400 truncate">${escapeHtml(m.manufacturer)}${m.realModel ? ` • ${escapeHtml(m.realModel)}` : ''}</p>
          </div>
          <span class="px-2 py-0.5 rounded bg-vice-pink/20 text-vice-pink text-[10px] font-bold shrink-0">${escapeHtml(m.category)}</span>
        </button>
      `
      )
      .join('');
    box.classList.remove('hidden');
  }

  function hideCatalogAutocomplete() {
    const box = document.getElementById('catalog-autocomplete');
    if (box) {
      box.classList.add('hidden');
      box.innerHTML = '';
    }
  }

  function applyCatalogMatch(catalogId) {
    const item = (window.GTA6_CATALOG || []).find((c) => c.id === catalogId);
    if (!item) return;

    document.getElementById('form-name').value = item.name;
    if (item.manufacturer) document.getElementById('form-manufacturer').value = item.manufacturer;
    if (item.realModel) document.getElementById('form-real-model').value = item.realModel;
    if (item.category) {
      document.getElementById('form-category').value = item.category;
      syncPresetWithCategoryIfNeeded(item.category);
    }
    if (item.trunkSize) document.getElementById('form-trunk-size').value = item.trunkSize;
    if (item.seats) document.getElementById('form-seats').value = String(item.seats);
    if (item.drivetrain) document.getElementById('form-drivetrain').value = item.drivetrain;
    if (item.price) document.getElementById('form-price').value = item.price;
    if (item.stats) setFormStats(item.stats);

    document.getElementById('wiki-search-input').value = item.realModel || item.name || '';

    if (item.spawnHint && modalSpawns.length === 0) {
      modalSpawns.push({
        id: `sp-${Date.now()}`,
        region: 'Vice City',
        location: item.spawnHint,
        condition: 'Qualquer hora',
        mapUrl: 'https://gta6-maps.net/pt-br',
        mapImage: ''
      });
      renderFormSpawns();
    }

    hideCatalogAutocomplete();
    showToast(`✨ Dados de ${item.name} preenchidos pelo catálogo!`);
  }

  function syncPresetWithCategoryIfNeeded(category) {
    const id = document.getElementById('form-id').value;
    const urlInput = document.getElementById('form-image-url').value.trim();
    const preview = document.getElementById('form-img-preview');
    const current = preview.dataset.currentImage || '';
    if (!id && !urlInput && isPresetImageUrl(current)) {
      const presetKey = getCategoryPresetKey(category);
      const nextUrl = window.STYLE_PRESETS[presetKey];
      if (nextUrl) {
        preview.src = nextUrl;
        preview.dataset.currentImage = nextUrl;
      }
    }
  }

  async function handleMainImageUpload(file) {
    try {
      const compressed = await compressImageFile(file, 960, 0.82);
      const preview = document.getElementById('form-img-preview');
      preview.src = compressed;
      preview.dataset.currentImage = compressed;
      document.getElementById('form-image-url').value = '';
      showToast('📸 Foto carregada e otimizada!');
    } catch (err) {
      showToast(`❌ ${err.message || 'Falha ao carregar foto.'}`);
    }
  }

  async function searchWikimediaImages(rawQuery) {
    const panel = document.getElementById('wiki-search-panel');
    const statusEl = document.getElementById('wiki-search-status');
    const resultsEl = document.getElementById('wiki-search-results');

    const query = (rawQuery || '').trim();
    if (!query) {
      showToast('Digite o nome ou modelo real do carro para buscar fotos livres.');
      document.getElementById('wiki-search-input').focus();
      return;
    }

    panel.classList.remove('hidden');
    statusEl.textContent = `Buscando fotos livres para "${query}" na Wikimedia Commons...`;
    resultsEl.innerHTML = '';

    const badWords = [
      'interior', 'dashboard', 'engine', 'logo', 'emblem', 'badge',
      'wheel', 'seat', 'cockpit', 'rear_light', 'sketch', 'toy',
      'scale', 'model_car', 'diecast', 'hot_wheels', 'taillight', 'headlight'
    ];

    try {
      const apiUrl =
        'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=18&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=900&format=json&origin=*&gsrsearch=' +
        encodeURIComponent(query + ' filetype:bitmap');

      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const pages = Object.values(data?.query?.pages || {});
      pages.sort((a, b) => (a.index || 0) - (b.index || 0));

      const filtered = [];
      for (const p of pages) {
        const titleLower = (p.title || '').toLowerCase();
        if (badWords.some((w) => titleLower.includes(w))) continue;
        const info = p.imageinfo && p.imageinfo[0];
        if (!info) continue;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) continue;
        if (!info.width || !info.height || info.width < 500 || info.width < info.height) continue;
        const thumb = info.thumburl || info.url;
        if (!thumb) continue;
        filtered.push({
          title: (p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
          url: thumb
        });
        if (filtered.length >= 8) break;
      }

      if (filtered.length === 0) {
        statusEl.textContent = `Nenhuma foto de carro encontrada para "${query}". Tente outro termo (ex: nome do carro real em inglês).`;
        return;
      }

      statusEl.textContent = `${filtered.length} fotos livres encontradas para "${query}":`;
      resultsEl.innerHTML = filtered
        .map(
          (img) => `
          <button type="button" data-wiki-img-url="${escapeHtml(img.url)}" title="${escapeHtml(img.title)}" class="group relative aspect-video rounded-xl overflow-hidden bg-vice-bg border border-white/15 hover:border-vice-cyan transition cursor-pointer">
            <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.title)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div class="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-0.5 text-[9px] text-gray-200 truncate opacity-0 group-hover:opacity-100 transition">
              ${escapeHtml(img.title)}
            </div>
          </button>
        `
        )
        .join('');
    } catch {
      statusEl.textContent = 'Sem conexão ou limite temporário da Wikimedia Commons. Tente novamente em instantes.';
    }
  }

  async function saveVehicleForm(event) {
    event.preventDefault();
    const id = document.getElementById('form-id').value;
    const name = document.getElementById('form-name').value.trim();
    const manufacturer = document.getElementById('form-manufacturer').value.trim();
    const realModel = document.getElementById('form-real-model').value.trim();
    const category = document.getElementById('form-category').value;
    const ownership = document.getElementById('form-ownership').value;
    const owner = document.getElementById('form-owner').value;
    const garage = document.getElementById('form-garage').value.trim();
    const garageSlot = document.getElementById('form-garage-slot').value.trim();
    const color = document.getElementById('form-color').value.trim();
    const plate = document.getElementById('form-plate').value.trim().toUpperCase();
    const tuning = document.getElementById('form-tuning').value;
    const price = document.getElementById('form-price').value.trim();
    const trunkSize = document.getElementById('form-trunk-size').value;
    const trunkNotes = document.getElementById('form-trunk-notes').value.trim();
    const seats = Number(document.getElementById('form-seats').value) || 2;
    const drivetrain = document.getElementById('form-drivetrain').value;
    const notes = document.getElementById('form-notes').value.trim();
    const favorite = document.getElementById('form-favorite').checked;

    const stats = {
      speed: Number(document.getElementById('form-stat-speed').value),
      acceleration: Number(document.getElementById('form-stat-acceleration').value),
      asphalt: Number(document.getElementById('form-stat-asphalt').value),
      offroad: Number(document.getElementById('form-stat-offroad').value),
      durability: Number(document.getElementById('form-stat-durability').value)
    };

    const urlInput = document.getElementById('form-image-url').value.trim();
    const currentPreview = document.getElementById('form-img-preview').dataset.currentImage;
    const fallback = getFallbackSVG(name, category);
    const image = sanitizeImageUrl(urlInput || currentPreview, fallback);

    const cleanSpawns = modalSpawns.filter((s) => s.location.trim() || s.mapUrl.trim() || s.mapImage);

    if (id) {
      const idx = vehicles.findIndex((v) => v.id === id);
      if (idx !== -1) {
        vehicles[idx] = window.GarageDB.normalizeVehicle({
          ...vehicles[idx],
          name,
          realModel,
          manufacturer,
          category,
          ownership,
          owner,
          garage,
          garageSlot,
          color,
          plate,
          tuning,
          price,
          trunkSize,
          trunkNotes,
          seats,
          drivetrain,
          stats,
          tags: [...modalTags],
          notes,
          favorite,
          image,
          gallery: [...modalGallery],
          spawns: cleanSpawns
        });
        showToast(`✅ ${name} atualizado!`);
      }
    } else {
      const newVehicle = window.GarageDB.normalizeVehicle({
        id: `v-${Date.now()}`,
        name,
        realModel,
        manufacturer,
        category,
        ownership,
        owner,
        garage,
        garageSlot,
        color,
        plate,
        tuning,
        price,
        trunkSize,
        trunkNotes,
        seats,
        drivetrain,
        stats,
        tags: [...modalTags],
        notes,
        favorite,
        image,
        gallery: [...modalGallery],
        spawns: cleanSpawns,
        createdAt: Date.now()
      });
      vehicles.unshift(newVehicle);
      showToast(`🏎️ ${name} adicionado à garagem!`);
    }

    await saveVehiclesAndRender();
    closeVehicleModal();
  }

  // -------------------------------------------------------------------------
  // AÇÕES CRUD RÁPIDAS (FAVORITAR, DUPLICAR, MOVER, EXCLUIR)
  // -------------------------------------------------------------------------
  async function toggleFavorite(id) {
    const idx = vehicles.findIndex((v) => v.id === id);
    if (idx === -1) return;
    vehicles[idx].favorite = !vehicles[idx].favorite;
    await saveVehiclesAndRender();
    if (activeInspectId === id) {
      openInspectModal(id);
    }
    showToast(vehicles[idx].favorite ? `⭐ ${vehicles[idx].name} marcado como favorito!` : 'Removido dos favoritos.');
  }

  async function duplicateVehicle(id) {
    const orig = vehicles.find((v) => v.id === id);
    if (!orig) return;
    const copy = window.GarageDB.cloneData(orig);
    copy.id = `v-${Date.now()}`;
    copy.name = `${orig.name} (Cópia)`;
    copy.createdAt = Date.now();
    vehicles.unshift(copy);
    await saveVehiclesAndRender();
    closeInspectModal();
    showToast(`📋 ${orig.name} duplicado! Edite os detalhes da cópia.`);
  }

  async function quickMoveGarage(id, targetGarage) {
    const clean = targetGarage.trim();
    if (!clean) {
      showToast('Digite o nome da garagem de destino.');
      return;
    }
    const idx = vehicles.findIndex((v) => v.id === id);
    if (idx === -1) return;
    vehicles[idx].garage = clean;
    await saveVehiclesAndRender();
    openInspectModal(id);
    showToast(`🏢 ${vehicles[idx].name} movido para ${clean}!`);
  }

  function openConfirmModal({ title, htmlText, confirmLabel, onConfirm }) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title || 'Confirmar Ação';
    document.getElementById('confirm-text').innerHTML = htmlText;
    document.getElementById('confirm-yes-btn').textContent = confirmLabel || 'Confirmar';
    pendingConfirmAction = onConfirm;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lockBodyScroll();
  }

  function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pendingConfirmAction = null;
    unlockBodyScrollIfNoModalOpen();
  }

  function confirmDelete(id) {
    const v = vehicles.find((item) => item.id === id);
    if (!v) return;
    openConfirmModal({
      title: 'Remover Veículo?',
      htmlText: `Deseja remover <strong class="text-white">${escapeHtml(v.name)}</strong> da garagem <strong class="text-vice-cyan">${escapeHtml(v.garage)}</strong>?`,
      confirmLabel: 'Sim, Remover',
      onConfirm: async () => {
        vehicles = vehicles.filter((item) => item.id !== id);
        await saveVehiclesAndRender();
        showToast(`🗑️ ${v.name} removido da garagem.`);
      }
    });
  }

  // -------------------------------------------------------------------------
  // MODAL 4: BACKUP, EXPORTAÇÃO, IMPORTAÇÃO & PWA INSTALL
  // -------------------------------------------------------------------------
  async function openBackupModal() {
    const modal = document.getElementById('backup-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lockBodyScroll();

    const usageEl = document.getElementById('storage-usage-text');
    try {
      const info = await window.GarageDB.getStorageUsage();
      const quotaStr = info.quotaBytes ? ` de ${formatBytes(info.quotaBytes)}` : '';
      usageEl.textContent = `${info.engine} • ${info.vehicleCount} veículos • ${formatBytes(info.dataBytes)} usados${quotaStr}`;
    } catch {
      usageEl.textContent = `${vehicles.length} veículos salvos localmente.`;
    }
  }

  function closeBackupModal() {
    const modal = document.getElementById('backup-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    unlockBodyScrollIfNoModalOpen();
  }

  function exportGarageJSON() {
    const payload = {
      app: 'LeonidaGarageGTA6',
      version: 2,
      exportedAt: new Date().toISOString(),
      vehicles,
      garageConfigs
    };
    const dataStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leonida-garage-gta6-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('💾 Backup completo exportado!');
  }

  function importGarageJSON(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;

    const mode = document.getElementById('import-mode-select').value;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const importedList = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.vehicles)
            ? parsed.vehicles
            : null;

        if (!importedList) {
          showToast('❌ Arquivo JSON inválido.');
          return;
        }

        const normalized = importedList
          .filter((item) => item && typeof item === 'object' && item.name)
          .map((item, idx) => window.GarageDB.normalizeVehicle(item, idx));

        if (normalized.length === 0) {
          showToast('❌ Nenhum veículo válido encontrado no JSON.');
          return;
        }

        if (mode === 'replace') {
          vehicles = normalized;
          if (parsed && parsed.garageConfigs && typeof parsed.garageConfigs === 'object') {
            garageConfigs = parsed.garageConfigs;
            await window.GarageDB.setMeta('garageConfigs', garageConfigs);
          }
          showToast(`✅ Garagem substituída (${vehicles.length} veículos)!`);
        } else {
          const existingIds = new Set(vehicles.map((v) => v.id));
          let added = 0;
          normalized.forEach((item) => {
            if (existingIds.has(item.id)) {
              item.id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            }
            vehicles.push(item);
            added++;
          });
          if (parsed && parsed.garageConfigs && typeof parsed.garageConfigs === 'object') {
            garageConfigs = { ...parsed.garageConfigs, ...garageConfigs };
            await window.GarageDB.setMeta('garageConfigs', garageConfigs);
          }
          showToast(`✅ ${added} veículos mesclados à garagem!`);
        }

        await saveVehiclesAndRender();
        closeBackupModal();
      } catch {
        showToast('❌ Erro ao ler arquivo de backup.');
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  function requestLoadUserInitial() {
    openConfirmModal({
      title: 'Carregar Meus 10 Carros Iniciais?',
      htmlText: 'Isso substituirá a lista atual pelos seus <strong class="text-vice-cyan">10 veículos pré-configurados</strong> (Emerus, Sultan, Stanier 1955, Tulip 1972, Sandking XT, Hustler 1932, Zombie Bobber, Gauntlet Hellfire, Coquette e Growler).',
      confirmLabel: 'Carregar Meus 10 Carros',
      onConfirm: async () => {
        vehicles = window.GarageDB.cloneData(window.USER_INITIAL_VEHICLES || []).map((v, i) =>
          window.GarageDB.normalizeVehicle(v, i)
        );
        await saveVehiclesAndRender();
        resetAllFilters();
        closeBackupModal();
        showToast('🏎️ Seus 10 veículos iniciais foram carregados!');
      }
    });
  }

  function requestRestoreDefaultCatalog() {
    openConfirmModal({
      title: 'Restaurar Catálogo de Exemplos?',
      htmlText: 'Isso substituirá sua garagem atual pelos <strong class="text-amber-400">12 veículos de exemplo</strong> de Leonida.',
      confirmLabel: 'Restaurar Exemplos',
      onConfirm: async () => {
        vehicles = window.GarageDB.cloneData(window.DEFAULT_VEHICLES || []).map((v, i) =>
          window.GarageDB.normalizeVehicle(v, i)
        );
        await saveVehiclesAndRender();
        resetAllFilters();
        closeBackupModal();
        showToast('🔄 Catálogo exemplo de Leonida restaurado!');
      }
    });
  }

  function requestClearGarage() {
    openConfirmModal({
      title: 'Limpar Toda a Garagem?',
      htmlText: 'Todos os veículos cadastrados serão apagados para você começar do zero. <strong class="text-red-400">Exporte um backup antes se quiser guardar os dados atuais.</strong>',
      confirmLabel: 'Apagar Tudo',
      onConfirm: async () => {
        vehicles = [];
        await saveVehiclesAndRender();
        resetAllFilters();
        closeBackupModal();
        showToast('🧹 Garagem limpa! Pronta para cadastrar do zero.');
      }
    });
  }

  // -------------------------------------------------------------------------
  // MODAL 5: MAPA, SPAWNS & GARAGENS
  // -------------------------------------------------------------------------
  function populateRegionFilter() {
    const sel = document.getElementById('map-region-filter');
    const regions = window.LEONIDA_REGIONS || [];
    sel.innerHTML =
      `<option value="ALL">🌎 Todas as Regiões de Leonida</option>` +
      regions.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }

  function openMapModal(defaultTab = 'spawns') {
    activeMapTab = defaultTab;
    const modal = document.getElementById('map-modal');
    updateMapTabButtons();
    renderMapModalContent();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lockBodyScroll();
  }

  function closeMapModal() {
    const modal = document.getElementById('map-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    unlockBodyScrollIfNoModalOpen();
  }

  function updateMapTabButtons() {
    const spawnsBtn = document.getElementById('map-tab-spawns-btn');
    const garagesBtn = document.getElementById('map-tab-garages-btn');
    const spawnsDiv = document.getElementById('map-tab-spawns');
    const garagesDiv = document.getElementById('map-tab-garages');
    const regionFilter = document.getElementById('map-region-filter');

    if (activeMapTab === 'spawns') {
      spawnsBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-vice-pink text-white transition cursor-pointer';
      garagesBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-vice-bg text-gray-300 hover:text-white border border-white/10 transition cursor-pointer';
      spawnsDiv.classList.remove('hidden');
      garagesDiv.classList.add('hidden');
      regionFilter.classList.remove('hidden');
    } else {
      garagesBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-vice-pink text-white transition cursor-pointer';
      spawnsBtn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-vice-bg text-gray-300 hover:text-white border border-white/10 transition cursor-pointer';
      garagesDiv.classList.remove('hidden');
      spawnsDiv.classList.add('hidden');
      regionFilter.classList.add('hidden');
    }
  }

  function renderMapModalContent() {
    if (activeMapTab === 'spawns') {
      renderMapSpawnsTab();
    } else {
      renderMapGaragesTab();
    }
  }

  function renderMapSpawnsTab() {
    const container = document.getElementById('map-tab-spawns');
    const rows = [];
    vehicles.forEach((v) => {
      (v.spawns || []).forEach((sp) => {
        if (mapRegionFilter === 'ALL' || sp.region === mapRegionFilter) {
          rows.push({ vehicle: v, spawn: sp });
        }
      });
    });

    if (rows.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-sm text-gray-400 bg-vice-bg/50 rounded-2xl border border-white/5">Nenhum spawn encontrado para esse filtro. Edite um veículo para adicionar locais e prints do mapa.</div>`;
      return;
    }

    container.innerHTML = rows
      .map(({ vehicle, spawn }) => {
        const safeUrl = sanitizeExternalUrl(spawn.mapUrl);
        const safePrint = spawn.mapImage ? sanitizeImageUrl(spawn.mapImage, '') : '';
        return `
          <div class="bg-vice-bg/80 p-3.5 rounded-2xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <button type="button" data-map-open-vehicle="${escapeHtml(vehicle.id)}" class="font-display font-bold text-sm text-white hover:text-vice-cyan transition cursor-pointer">
                  ${escapeHtml(vehicle.name)}
                </button>
                <span class="px-2 py-0.5 rounded bg-vice-pink/20 text-vice-pink text-[10px] font-bold">${escapeHtml(spawn.region || 'Leonida')}</span>
                ${vehicle.ownership === 'wishlist' ? `<span class="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-bold">Desejo</span>` : ''}
                ${spawn.condition ? `<span class="text-[11px] text-amber-300">🕒 ${escapeHtml(spawn.condition)}</span>` : ''}
              </div>
              <p class="text-xs text-gray-300">${escapeHtml(spawn.location || 'Ponto no mapa')}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              ${
                safePrint
                  ? `<button type="button" data-lightbox-src="${escapeHtml(safePrint)}" data-lightbox-caption="${escapeHtml(`${vehicle.name} — ${spawn.region}`)}" class="w-16 aspect-video rounded-lg overflow-hidden border border-vice-cyan/40 cursor-zoom-in">
                       <img src="${escapeHtml(safePrint)}" alt="Print do spawn" class="w-full h-full object-cover" />
                     </button>`
                  : ''
              }
              ${
                safeUrl
                  ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-vice-surface hover:bg-vice-cyan hover:text-vice-bg text-vice-cyan border border-vice-cyan/30 text-xs font-bold transition whitespace-nowrap">
                       Mapa ↗
                     </a>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderMapGaragesTab() {
    const container = document.getElementById('map-tab-garages');
    const grouped = new Map();

    vehicles.forEach((v) => {
      const gName = (v.garage || 'Garagem Principal').trim();
      if (!grouped.has(gName)) grouped.set(gName, []);
      grouped.get(gName).push(v);
    });

    const garageNames = [...grouped.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (garageNames.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-sm text-gray-400 bg-vice-bg/50 rounded-2xl border border-white/5">Nenhuma garagem ativa ainda. Cadastre um veículo para começar.</div>`;
      return;
    }

    container.innerHTML = garageNames
      .map((name) => {
        const list = grouped.get(name);
        const cfg = garageConfigs[name] || { capacity: 10, mapUrl: '' };
        const cap = Number(cfg.capacity) || 10;
        const pct = Math.min(100, Math.round((list.length / cap) * 100));
        const safeMapUrl = sanitizeExternalUrl(cfg.mapUrl);

        return `
          <div data-garage-card="${escapeHtml(name)}" class="bg-vice-bg/80 p-4 rounded-2xl border border-white/10 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 class="font-display font-bold text-base text-white">🏢 ${escapeHtml(name)}</h4>
                <p class="text-xs text-gray-400">${list.length} de ${cap} vagas ocupadas (${pct}%)</p>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" data-filter-this-garage="${escapeHtml(name)}" class="px-3 py-1.5 rounded-xl bg-vice-surface hover:bg-vice-pink hover:text-white text-xs font-bold text-gray-200 border border-white/10 transition cursor-pointer">
                  Ver Carros
                </button>
                ${
                  safeMapUrl
                    ? `<a href="${escapeHtml(safeMapUrl)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-vice-surface hover:bg-vice-cyan hover:text-vice-bg text-vice-cyan border border-vice-cyan/30 text-xs font-bold transition">
                         Ver no Mapa ↗
                       </a>`
                    : ''
                }
              </div>
            </div>
            <div class="stat-bar-track">
              <div class="stat-bar-fill" style="width: ${pct}%"></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <div>
                <label class="block text-[10px] uppercase text-gray-400 mb-1">Capacidade (Vagas)</label>
                <input type="number" min="1" max="100" data-garage-cap="${escapeHtml(name)}" value="${cap}" class="w-full bg-vice-surface border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none" />
              </div>
              <div class="sm:col-span-2">
                <label class="block text-[10px] uppercase text-gray-400 mb-1">Link desta garagem no mapa</label>
                <input type="url" data-garage-url="${escapeHtml(name)}" value="${escapeHtml(cfg.mapUrl || '')}" placeholder="https://gta6-maps.net/pt-br..." class="w-full bg-vice-surface border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-vice-cyan outline-none" />
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // -------------------------------------------------------------------------
  // LIGHTBOX PARA AMPLIAR IMAGENS / PRINTS
  // -------------------------------------------------------------------------
  function openLightbox(src, caption = '') {
    if (!src) return;
    const box = document.getElementById('image-lightbox');
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-caption').textContent = caption;
    box.classList.remove('hidden');
    box.classList.add('flex');
    lockBodyScroll();
  }

  function closeLightbox() {
    const box = document.getElementById('image-lightbox');
    box.classList.add('hidden');
    box.classList.remove('flex');
    unlockBodyScrollIfNoModalOpen();
  }

  // -------------------------------------------------------------------------
  // REGISTRO DE EVENTOS (DELEGAÇÃO SEM INLINE ONCLICK)
  // -------------------------------------------------------------------------
  function registerEvents() {
    // Header buttons
    document.getElementById('open-map-btn').addEventListener('click', () => openMapModal('spawns'));
    document.getElementById('open-backup-btn').addEventListener('click', openBackupModal);
    document.getElementById('open-add-btn').addEventListener('click', () => openVehicleModal());

    // Stats HUD cards
    document.getElementById('stats-hud').addEventListener('click', (e) => {
      const card = e.target.closest('[data-stat-action]');
      if (!card) return;
      const action = card.dataset.statAction;
      if (action === 'all') {
        resetAllFilters();
      } else if (action === 'favorites') {
        document.getElementById('fav-filter-btn').click();
      } else if (action === 'garages') {
        openMapModal('garages');
      } else if (action === 'tuned') {
        filterState.tacticalFilter = filterState.tacticalFilter === 'FULL_TUNED' ? 'ALL' : 'FULL_TUNED';
        document.getElementById('tactical-filters-bar').classList.remove('hidden');
        renderTacticalFilterPills();
        renderVehicles();
        updateFilterResetVisibility();
        updateStatCardHighlights();
      }
    });

    // Search & Filters
    document.getElementById('search-input').addEventListener('input', (e) => handleSearch(e.target.value));
    document.getElementById('clear-search-btn').addEventListener('click', clearSearch);
    document.getElementById('garage-filter').addEventListener('change', (e) => {
      filterState.garage = e.target.value;
      renderVehicles();
      updateFilterResetVisibility();
    });
    document.getElementById('ownership-filter').addEventListener('change', (e) => {
      filterState.ownership = e.target.value;
      renderVehicles();
      updateFilterResetVisibility();
    });
    document.getElementById('sort-select').addEventListener('change', (e) => {
      filterState.sortBy = e.target.value;
      savePreferences();
      renderVehicles();
    });
    document.getElementById('fav-filter-btn').addEventListener('click', () => {
      filterState.onlyFavorites = !filterState.onlyFavorites;
      const btn = document.getElementById('fav-filter-btn');
      btn.classList.toggle('border-amber-400', filterState.onlyFavorites);
      btn.classList.toggle('bg-amber-400/15', filterState.onlyFavorites);
      btn.classList.toggle('text-white', filterState.onlyFavorites);
      renderVehicles();
      updateFilterResetVisibility();
      updateStatCardHighlights();
    });

    document.getElementById('view-grid-btn').addEventListener('click', () => {
      filterState.viewMode = 'grid';
      applyViewModeButtons();
      savePreferences();
      renderVehicles();
    });
    document.getElementById('view-list-btn').addEventListener('click', () => {
      filterState.viewMode = 'list';
      applyViewModeButtons();
      savePreferences();
      renderVehicles();
    });

    document.getElementById('toggle-tactical-btn').addEventListener('click', () => {
      document.getElementById('tactical-filters-bar').classList.toggle('hidden');
    });

    document.getElementById('category-pills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      filterState.category = btn.dataset.category;
      renderCategoryPills();
      renderVehicles();
      updateFilterResetVisibility();
    });

    document.getElementById('tactical-filter-pills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tactical]');
      if (!btn) return;
      filterState.tacticalFilter = btn.dataset.tactical;
      renderTacticalFilterPills();
      renderVehicles();
      updateFilterResetVisibility();
      updateStatCardHighlights();
    });

    document.getElementById('reset-filters-btn').addEventListener('click', resetAllFilters);
    document.getElementById('empty-reset-btn').addEventListener('click', resetAllFilters);
    document.getElementById('empty-add-btn').addEventListener('click', () => openVehicleModal());

    // Vehicles container delegation
    document.getElementById('vehicles-container').addEventListener('click', (e) => {
      const card = e.target.closest('[data-vehicle-id]');
      if (!card) return;
      const id = card.dataset.vehicleId;
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      if (action === 'inspect') openInspectModal(id);
      else if (action === 'favorite') toggleFavorite(id);
      else if (action === 'edit') openVehicleModal(id);
      else if (action === 'delete') confirmDelete(id);
    });

    // Inspect Modal events
    const inspectModal = document.getElementById('inspect-modal');
    inspectModal.addEventListener('click', (e) => {
      if (e.target === inspectModal) {
        closeInspectModal();
        return;
      }
      const galleryBtn = e.target.closest('[data-gallery-src]');
      if (galleryBtn) {
        document.getElementById('inspect-img').src = galleryBtn.dataset.gallerySrc;
        return;
      }
      const lbBtn = e.target.closest('[data-lightbox-src]');
      if (lbBtn) {
        openLightbox(lbBtn.dataset.lightboxSrc, lbBtn.dataset.lightboxCaption || '');
      }
    });
    document.getElementById('inspect-img').addEventListener('click', (e) => {
      openLightbox(e.target.src, document.getElementById('inspect-name').textContent);
    });
    document.getElementById('inspect-close-x').addEventListener('click', closeInspectModal);
    document.getElementById('inspect-close-btn').addEventListener('click', closeInspectModal);
    document.getElementById('inspect-fav-btn').addEventListener('click', () => {
      if (activeInspectId) toggleFavorite(activeInspectId);
    });
    document.getElementById('inspect-edit-btn').addEventListener('click', () => {
      const id = activeInspectId;
      if (!id) return;
      closeInspectModal();
      openVehicleModal(id);
    });
    document.getElementById('inspect-delete-btn').addEventListener('click', () => {
      const id = activeInspectId;
      if (!id) return;
      closeInspectModal();
      confirmDelete(id);
    });
    document.getElementById('inspect-duplicate-btn').addEventListener('click', () => {
      if (activeInspectId) duplicateVehicle(activeInspectId);
    });
    document.getElementById('inspect-quick-move-btn').addEventListener('click', () => {
      if (activeInspectId) {
        quickMoveGarage(activeInspectId, document.getElementById('inspect-quick-garage-input').value);
      }
    });

    // Vehicle Modal events
    const vehicleModal = document.getElementById('vehicle-modal');
    vehicleModal.addEventListener('click', (e) => {
      if (e.target === vehicleModal) closeVehicleModal();
    });
    document.getElementById('vehicle-modal-close-x').addEventListener('click', closeVehicleModal);
    document.getElementById('vehicle-modal-cancel-btn').addEventListener('click', closeVehicleModal);
    document.getElementById('vehicle-form').addEventListener('submit', saveVehicleForm);

    document.getElementById('form-file-upload').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleMainImageUpload(file);
      e.target.value = '';
    });

    document.getElementById('form-gallery-upload').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        if (modalGallery.length >= 3) {
          showToast('Máximo de 3 fotos extras atingido.');
          break;
        }
        try {
          const compressed = await compressImageFile(file, 960, 0.8);
          modalGallery.push(compressed);
        } catch (err) {
          showToast(`❌ ${err.message}`);
        }
      }
      renderFormGallery();
      e.target.value = '';
    });

    document.getElementById('form-gallery-preview').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-gallery]');
      if (!btn) return;
      modalGallery.splice(Number(btn.dataset.removeGallery), 1);
      renderFormGallery();
    });

    // Drag & drop on main preview
    const dropzone = document.getElementById('form-dropzone');
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dropzone-active');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone-active'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dropzone-active');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleMainImageUpload(file);
    });

    document.getElementById('form-image-url').addEventListener('input', (e) => {
      const url = e.target.value.trim();
      const preview = document.getElementById('form-img-preview');
      if (url) {
        const safe = sanitizeImageUrl(url, getFallbackSVG('Preview', document.getElementById('form-category').value));
        preview.src = safe;
        preview.dataset.currentImage = safe;
      } else {
        const presetUrl = window.STYLE_PRESETS[getCategoryPresetKey(document.getElementById('form-category').value)];
        preview.src = presetUrl;
        preview.dataset.currentImage = presetUrl;
      }
    });

    document.getElementById('form-preset-select').addEventListener('change', (e) => {
      const key = e.target.value;
      if (!key || !window.STYLE_PRESETS[key]) return;
      const url = window.STYLE_PRESETS[key];
      document.getElementById('form-image-url').value = url;
      const preview = document.getElementById('form-img-preview');
      preview.src = url;
      preview.dataset.currentImage = url;
    });

    document.getElementById('form-category').addEventListener('change', (e) => {
      syncPresetWithCategoryIfNeeded(e.target.value);
    });

    // Wikimedia Commons Free Image Search
    document.getElementById('wiki-search-toggle-btn').addEventListener('click', () => {
      const input = document.getElementById('wiki-search-input');
      if (!input.value.trim()) {
        input.value =
          document.getElementById('form-real-model').value.trim() ||
          document.getElementById('form-name').value.trim();
      }
      if (input.value.trim()) {
        searchWikimediaImages(input.value);
      } else {
        document.getElementById('wiki-search-panel').classList.toggle('hidden');
        input.focus();
      }
    });

    document.getElementById('wiki-search-run-btn').addEventListener('click', () => {
      const input = document.getElementById('wiki-search-input');
      if (!input.value.trim()) {
        input.value =
          document.getElementById('form-real-model').value.trim() ||
          document.getElementById('form-name').value.trim();
      }
      searchWikimediaImages(input.value);
    });

    document.getElementById('wiki-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchWikimediaImages(e.target.value);
      }
    });

    document.getElementById('wiki-search-results').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-wiki-img-url]');
      if (!btn) return;
      const url = btn.dataset.wikiImgUrl;
      const safe = sanitizeImageUrl(url, getFallbackSVG('Preview', document.getElementById('form-category').value));
      document.getElementById('form-image-url').value = safe;
      const preview = document.getElementById('form-img-preview');
      preview.src = safe;
      preview.dataset.currentImage = safe;
      document.getElementById('wiki-search-panel').classList.add('hidden');
      showToast('📸 Foto livre aplicada ao veículo!');
    });

    // Autocomplete on Vehicle Name
    const nameInput = document.getElementById('form-name');
    nameInput.addEventListener('input', (e) => showCatalogAutocomplete(e.target.value));
    document.getElementById('catalog-autocomplete').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-catalog-id]');
      if (btn) applyCatalogMatch(btn.dataset.catalogId);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#form-name') && !e.target.closest('#catalog-autocomplete')) {
        hideCatalogAutocomplete();
      }
    });

    // Stats range sliders
    ['speed', 'acceleration', 'asphalt', 'offroad', 'durability'].forEach((k) => {
      const el = document.getElementById(`form-stat-${k}`);
      el.addEventListener('input', () => {
        document.getElementById(`val-stat-${k}`).textContent = Number(el.value).toFixed(1);
      });
    });

    // Form Tactical Tags
    document.getElementById('form-tags-container').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-form-tag]');
      if (!btn) return;
      const tagId = btn.dataset.formTag;
      if (modalTags.includes(tagId)) modalTags = modalTags.filter((t) => t !== tagId);
      else modalTags.push(tagId);
      renderFormTags();
    });

    // Form Spawns dynamic list
    document.getElementById('add-spawn-row-btn').addEventListener('click', () => {
      modalSpawns.push({
        id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        region: 'Vice City',
        location: '',
        condition: 'Qualquer hora',
        mapUrl: 'https://gta6-maps.net/pt-br',
        mapImage: ''
      });
      renderFormSpawns();
    });

    const spawnsContainer = document.getElementById('form-spawns-list');
    spawnsContainer.addEventListener('input', (e) => {
      const row = e.target.closest('[data-spawn-id]');
      const field = e.target.dataset.spawnField;
      if (!row || !field) return;
      const sp = modalSpawns.find((s) => s.id === row.dataset.spawnId);
      if (sp) sp[field] = e.target.value;
    });
    spawnsContainer.addEventListener('change', async (e) => {
      const row = e.target.closest('[data-spawn-id]');
      if (!row) return;
      const sp = modalSpawns.find((s) => s.id === row.dataset.spawnId);
      if (!sp) return;

      if (e.target.dataset.spawnField === 'region') {
        sp.region = e.target.value;
        return;
      }

      if (e.target.dataset.spawnFile) {
        const file = e.target.files && e.target.files[0];
        if (file) {
          try {
            sp.mapImage = await compressImageFile(file, 900, 0.8);
            renderFormSpawns();
            showToast('🗺️ Print do mapa anexado ao spawn!');
          } catch (err) {
            showToast(`❌ ${err.message}`);
          }
        }
        e.target.value = '';
      }
    });
    spawnsContainer.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-spawn]');
      if (removeBtn) {
        modalSpawns = modalSpawns.filter((s) => s.id !== removeBtn.dataset.removeSpawn);
        renderFormSpawns();
        return;
      }
      const clearImgBtn = e.target.closest('[data-spawn-clear-img]');
      if (clearImgBtn) {
        const sp = modalSpawns.find((s) => s.id === clearImgBtn.dataset.spawnClearImg);
        if (sp) {
          sp.mapImage = '';
          renderFormSpawns();
        }
        return;
      }
      const pasteBtn = e.target.closest('[data-spawn-paste]');
      if (pasteBtn) {
        const id = pasteBtn.dataset.spawnPaste;
        pendingSpawnPasteId = pendingSpawnPasteId === id ? null : id;
        renderFormSpawns();
        if (pendingSpawnPasteId) {
          showToast('📋 Agora aperte Ctrl+V para colar o print do mapa neste spawn!');
        }
        return;
      }
      const lbImg = e.target.closest('[data-lightbox-src]');
      if (lbImg) {
        openLightbox(lbImg.dataset.lightboxSrc, lbImg.dataset.lightboxCaption || '');
      }
    });

    // Confirm Modal
    const confirmModal = document.getElementById('confirm-modal');
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeConfirmModal();
    });
    document.getElementById('confirm-cancel-btn').addEventListener('click', closeConfirmModal);
    document.getElementById('confirm-yes-btn').addEventListener('click', async () => {
      const fn = pendingConfirmAction;
      closeConfirmModal();
      if (typeof fn === 'function') await fn();
    });

    // Backup Modal
    const backupModal = document.getElementById('backup-modal');
    backupModal.addEventListener('click', (e) => {
      if (e.target === backupModal) closeBackupModal();
    });
    document.getElementById('backup-close-x').addEventListener('click', closeBackupModal);
    document.getElementById('backup-done-btn').addEventListener('click', closeBackupModal);
    document.getElementById('export-json-btn').addEventListener('click', exportGarageJSON);
    document.getElementById('import-json-input').addEventListener('change', importGarageJSON);
    document.getElementById('load-user-initial-btn').addEventListener('click', requestLoadUserInitial);
    document.getElementById('restore-default-btn').addEventListener('click', requestRestoreDefaultCatalog);
    document.getElementById('clear-garage-btn').addEventListener('click', requestClearGarage);

    // Map Modal
    const mapModal = document.getElementById('map-modal');
    mapModal.addEventListener('click', (e) => {
      if (e.target === mapModal) {
        closeMapModal();
        return;
      }
      const openVehicleBtn = e.target.closest('[data-map-open-vehicle]');
      if (openVehicleBtn) {
        const id = openVehicleBtn.dataset.mapOpenVehicle;
        closeMapModal();
        openInspectModal(id);
        return;
      }
      const filterGarageBtn = e.target.closest('[data-filter-this-garage]');
      if (filterGarageBtn) {
        const gName = filterGarageBtn.dataset.filterThisGarage;
        filterState.garage = gName;
        document.getElementById('garage-filter').value = gName;
        renderVehicles();
        updateFilterResetVisibility();
        closeMapModal();
        return;
      }
      const lbBtn = e.target.closest('[data-lightbox-src]');
      if (lbBtn) {
        openLightbox(lbBtn.dataset.lightboxSrc, lbBtn.dataset.lightboxCaption || '');
      }
    });
    mapModal.addEventListener('change', async (e) => {
      if (e.target.dataset.garageCap) {
        const gName = e.target.dataset.garageCap;
        garageConfigs[gName] = { ...(garageConfigs[gName] || {}), capacity: Math.max(1, Number(e.target.value) || 10) };
        await window.GarageDB.setMeta('garageConfigs', garageConfigs);
        renderMapGaragesTab();
      } else if (e.target.dataset.garageUrl) {
        const gName = e.target.dataset.garageUrl;
        garageConfigs[gName] = { ...(garageConfigs[gName] || {}), mapUrl: e.target.value.trim() };
        await window.GarageDB.setMeta('garageConfigs', garageConfigs);
        renderMapGaragesTab();
      }
    });
    document.getElementById('map-modal-close-x').addEventListener('click', closeMapModal);
    document.getElementById('map-tab-spawns-btn').addEventListener('click', () => {
      activeMapTab = 'spawns';
      updateMapTabButtons();
      renderMapModalContent();
    });
    document.getElementById('map-tab-garages-btn').addEventListener('click', () => {
      activeMapTab = 'garages';
      updateMapTabButtons();
      renderMapModalContent();
    });
    document.getElementById('map-region-filter').addEventListener('change', (e) => {
      mapRegionFilter = e.target.value;
      renderMapSpawnsTab();
    });

    // Lightbox
    const lightbox = document.getElementById('image-lightbox');
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.getElementById('lightbox-close-btn').addEventListener('click', closeLightbox);

    // Global Paste (Ctrl+V) for screenshots inside Vehicle Modal
    document.addEventListener('paste', async (e) => {
      if (vehicleModal.classList.contains('hidden')) return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find((it) => it.type && it.type.startsWith('image/'));
      if (!imgItem) return;

      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();

      if (pendingSpawnPasteId) {
        const sp = modalSpawns.find((s) => s.id === pendingSpawnPasteId);
        if (sp) {
          try {
            sp.mapImage = await compressImageFile(file, 900, 0.8);
            pendingSpawnPasteId = null;
            renderFormSpawns();
            showToast('🗺️ Print do mapa colado no spawn!');
          } catch (err) {
            showToast(`❌ ${err.message}`);
          }
          return;
        }
      }

      await handleMainImageUpload(file);
    });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isTyping = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if ((e.key === '/' && !isTyping) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        const searchEl = document.getElementById('search-input');
        searchEl.focus();
        searchEl.select();
        return;
      }

      if (e.key === 'Escape') {
        if (!document.getElementById('image-lightbox').classList.contains('hidden')) {
          closeLightbox();
        } else if (!document.getElementById('confirm-modal').classList.contains('hidden')) {
          closeConfirmModal();
        } else if (!document.getElementById('vehicle-modal').classList.contains('hidden')) {
          closeVehicleModal();
        } else if (!document.getElementById('inspect-modal').classList.contains('hidden')) {
          closeInspectModal();
        } else if (!document.getElementById('backup-modal').classList.contains('hidden')) {
          closeBackupModal();
        } else if (!document.getElementById('map-modal').classList.contains('hidden')) {
          closeMapModal();
        }
      }
    });

    // PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      document.getElementById('pwa-install-btn').classList.remove('hidden');
    });

    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast('📲 Leonida Garage instalado!');
      }
      deferredInstallPrompt = null;
      document.getElementById('pwa-install-btn').classList.add('hidden');
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.protocol === 'http:')) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service Worker não registrado:', err);
      });
    }
  }

  window.addEventListener('DOMContentLoaded', initApp);
})();
