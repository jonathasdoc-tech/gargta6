/*
 * Leonida Garage - Camada de Persistência (IndexedDB + Fallback LocalStorage)
 */

(function () {
  const DB_NAME = 'LeonidaGarageDB';
  const DB_VERSION = 1;
  const STORE_VEHICLES = 'vehicles';
  const STORE_META = 'meta';
  const LEGACY_STORAGE_KEY = 'leonida_garage_gta6_v1';
  const FALLBACK_VEHICLES_KEY = 'leonida_garage_gta6_v2_vehicles';
  const FALLBACK_META_KEY = 'leonida_garage_gta6_v2_meta';

  let dbInstance = null;
  let useFallbackStorage = false;

  function cloneData(val) {
    if (typeof structuredClone === 'function') {
      return structuredClone(val);
    }
    return JSON.parse(JSON.stringify(val));
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB não suportado'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_VEHICLES)) {
          db.createObjectStore(STORE_VEHICLES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Falha ao abrir IndexedDB'));
      };
    });
  }

  function normalizeVehicle(v, index = 0) {
    const presets = window.STYLE_PRESETS || {};
    const category = v?.category || 'Esportivo';
    const fallbackPreset =
      category === 'Super' ? presets.super :
      category === 'Clássico' ? presets.classic :
      category === 'Muscle' ? presets.muscle :
      category === 'Off-Road' ? presets.offroad :
      category === 'SUV / Luxo' ? presets.suv :
      category === 'Moto' ? presets.moto :
      category === 'Aeronave / Barco' ? presets.boat :
      presets.sports;

    const rawStats = v?.stats || {};
    const spawns = Array.isArray(v?.spawns)
      ? v.spawns
          .filter((s) => s && (s.location || s.region || s.mapUrl || s.mapImage))
          .map((s, sIdx) => ({
            id: String(s.id || `sp-${Date.now()}-${sIdx}`),
            region: String(s.region || 'Vice City').trim(),
            location: String(s.location || '').trim(),
            condition: String(s.condition || 'Qualquer hora').trim(),
            mapUrl: String(s.mapUrl || '').trim(),
            mapImage: String(s.mapImage || '')
          }))
      : [];

    return {
      id: String(v?.id || `v-${Date.now()}-${index}`),
      name: String(v?.name || 'Veículo Sem Nome').trim(),
      realModel: String(v?.realModel || '').trim(),
      manufacturer: String(v?.manufacturer || 'Desconhecido').trim(),
      category,
      ownership: v?.ownership === 'wishlist' ? 'wishlist' : 'owned',
      owner: String(v?.owner || 'Compartilhado').trim(),
      garage: String(v?.garage || 'Garagem Principal').trim(),
      garageSlot: String(v?.garageSlot || '').trim(),
      color: String(v?.color || '').trim(),
      plate: String(v?.plate || '').trim().toUpperCase(),
      tuning: String(v?.tuning || 'Original'),
      favorite: Boolean(v?.favorite),
      trunkSize: String(v?.trunkSize || (category === 'Moto' ? 'Sem Porta-Malas' : 'Médio')),
      trunkNotes: String(v?.trunkNotes || '').trim(),
      seats: Number.isFinite(Number(v?.seats)) ? Number(v.seats) : (category === 'Moto' ? 1 : 2),
      drivetrain: String(v?.drivetrain || '').trim().toUpperCase(),
      price: String(v?.price || '').trim(),
      stats: {
        speed: clampStat(rawStats.speed, 5.0),
        acceleration: clampStat(rawStats.acceleration, 5.0),
        asphalt: clampStat(rawStats.asphalt, 5.0),
        offroad: clampStat(rawStats.offroad, category === 'Off-Road' ? 8.0 : 3.5),
        durability: clampStat(rawStats.durability, 5.0)
      },
      tags: Array.isArray(v?.tags) ? v.tags.map((t) => String(t)).filter(Boolean) : [],
      notes: String(v?.notes || '').trim(),
      image: String(v?.image || fallbackPreset || ''),
      gallery: Array.isArray(v?.gallery) ? v.gallery.filter(Boolean).slice(0, 3) : [],
      spawns,
      createdAt: Number(v?.createdAt) || Date.now() - index * 1000
    };
  }

  function clampStat(val, fallback) {
    const n = Number(val);
    if (Number.isFinite(n)) {
      return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
    }
    return fallback;
  }

  function readFallbackVehicles() {
    try {
      const raw = localStorage.getItem(FALLBACK_VEHICLES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeFallbackVehicles(list) {
    try {
      localStorage.setItem(FALLBACK_VEHICLES_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      console.error('Erro ao salvar no localStorage fallback:', err);
      return false;
    }
  }

  function readFallbackMeta() {
    try {
      const raw = localStorage.getItem(FALLBACK_META_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function writeFallbackMeta(obj) {
    try {
      localStorage.setItem(FALLBACK_META_KEY, JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  async function init() {
    try {
      dbInstance = await openDatabase();
      useFallbackStorage = false;
    } catch (err) {
      console.warn('IndexedDB indisponível, ativando fallback localStorage:', err);
      useFallbackStorage = true;
    }

    await migrateIfNeeded();
    return { usingFallback: useFallbackStorage };
  }

  async function migrateIfNeeded() {
    const initialized = await getMeta('initialized', false);
    if (!initialized) {
      let initialList = [];
      try {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            initialList = parsed.map((v, i) => normalizeVehicle(v, i));
          }
        }
      } catch {
        // ignore malformed legacy data
      }

      if (initialList.length === 0) {
        const source = window.USER_INITIAL_VEHICLES || window.DEFAULT_VEHICLES || [];
        initialList = cloneData(source).map((v, i) => normalizeVehicle(v, i));
      }

      await saveAllVehicles(initialList);
      await setMeta('initialized', true);
    }

    const upgradedV2 = await getMeta('userImagesUpgradedV2', false);
    if (!upgradedV2) {
      const userDefaults = window.USER_INITIAL_VEHICLES || [];
      const presetUrls = new Set(Object.values(window.STYLE_PRESETS || {}));
      const existing = await getAllVehicles();
      let changed = false;

      const updated = existing.map((v) => {
        const match = userDefaults.find((u) => u.id === v.id);
        if (match && match.image && (!v.image || presetUrls.has(v.image))) {
          changed = true;
          return { ...v, image: match.image };
        }
        return v;
      });

      if (changed) {
        await saveAllVehicles(updated);
      }
      await setMeta('userImagesUpgradedV2', true);
    }
  }

  function getAllVehicles() {
    if (useFallbackStorage || !dbInstance) {
      return Promise.resolve(readFallbackVehicles().map((v, i) => normalizeVehicle(v, i)));
    }
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_VEHICLES, 'readonly');
      const store = tx.objectStore(STORE_VEHICLES);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []).map((v, i) => normalizeVehicle(v, i));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function saveAllVehicles(list) {
    const clean = (list || []).map((v, i) => normalizeVehicle(v, i));
    if (useFallbackStorage || !dbInstance) {
      const ok = writeFallbackVehicles(clean);
      return ok ? Promise.resolve() : Promise.reject(new Error('Limite de armazenamento atingido (localStorage)'));
    }
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_VEHICLES, 'readwrite');
      const store = tx.objectStore(STORE_VEHICLES);
      store.clear();
      clean.forEach((v) => store.put(v));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function putVehicle(vehicle) {
    const clean = normalizeVehicle(vehicle);
    if (useFallbackStorage || !dbInstance) {
      const all = readFallbackVehicles();
      const idx = all.findIndex((x) => x.id === clean.id);
      if (idx >= 0) all[idx] = clean;
      else all.unshift(clean);
      const ok = writeFallbackVehicles(all);
      return ok ? Promise.resolve(clean) : Promise.reject(new Error('Limite de armazenamento atingido (localStorage)'));
    }
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_VEHICLES, 'readwrite');
      tx.objectStore(STORE_VEHICLES).put(clean);
      tx.oncomplete = () => resolve(clean);
      tx.onerror = () => reject(tx.error);
    });
  }

  function deleteVehicle(id) {
    if (useFallbackStorage || !dbInstance) {
      const all = readFallbackVehicles().filter((x) => x.id !== id);
      writeFallbackVehicles(all);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_VEHICLES, 'readwrite');
      tx.objectStore(STORE_VEHICLES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function clearVehicles() {
    return saveAllVehicles([]);
  }

  function getMeta(key, defaultValue = null) {
    if (useFallbackStorage || !dbInstance) {
      const meta = readFallbackMeta();
      return Promise.resolve(Object.prototype.hasOwnProperty.call(meta, key) ? meta[key] : defaultValue);
    }
    return new Promise((resolve) => {
      const tx = dbInstance.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
      req.onerror = () => resolve(defaultValue);
    });
  }

  function setMeta(key, value) {
    if (useFallbackStorage || !dbInstance) {
      const meta = readFallbackMeta();
      meta[key] = value;
      writeFallbackMeta(meta);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getStorageUsage() {
    const vehicles = await getAllVehicles();
    const jsonSize = new Blob([JSON.stringify(vehicles)]).size;
    let quotaBytes = null;
    let usageBytes = null;
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      try {
        const est = await navigator.storage.estimate();
        quotaBytes = est.quota || null;
        usageBytes = est.usage || null;
      } catch {
        // ignore
      }
    }
    return {
      engine: useFallbackStorage ? 'localStorage (Fallback)' : 'IndexedDB',
      dataBytes: jsonSize,
      usageBytes,
      quotaBytes,
      vehicleCount: vehicles.length
    };
  }

  window.GarageDB = {
    init,
    normalizeVehicle,
    cloneData,
    getAllVehicles,
    saveAllVehicles,
    putVehicle,
    deleteVehicle,
    clearVehicles,
    getMeta,
    setMeta,
    getStorageUsage
  };
})();
