// ============================================================================
// INTERCAMBIO NAVIDEÑO DE PIJAMAS PACHONCITAS ($300 MXN) - LÓGICA DEL SITIO
// ============================================================================
(() => {
  'use strict';

// Configuración cargada exclusivamente desde variables de entorno (.env / GitHub Secrets)
// Ninguna llave, URL de API ni contraseña se guarda en este código fuente.
let STORAGE_KEY = 'intercambio_pijamas_bd_v1';
let CLOUD_DB_URL = '';
let CLOUD_DB_OBJECT_NAME = '';
let PREFIJO_TOKEN = 'PIJAMA';
let CODIGO_PAIS_WA = '52';
let FLAGS = {
  auto_sorteo_al_max: true,
  permitir_registro_extra: false,
  mostrar_boton_demo: false
};
let ENV_OVERRIDES = {};
let ADMIN_PIN_HASH = '';

// Calcular SHA-256 en hexadecimal usando Web Crypto API
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Estado en memoria privada (no accesible desde consola F12 ni guardado en localStorage)
let dbState = {
  evento: {
    titulo: 'Intercambio Navideño de Pijamas Pachoncitas',
    frase: '“Suaves, calientitas y con mucho espíritu navideño: ¡regala el abrazo más suave de esta Navidad!”',
    presupuesto_mxn: 300,
    min_participantes: 13,
    max_participantes: 20,
    fecha_revelacion: '2026-11-22',
    fecha_revelacion_texto: 'lunes 22 de noviembre',
    fecha_evento_iso: '20261224T170000',
    fecha_evento_fin_iso: '20261224T235900',
    fecha_evento_texto: '24 de diciembre | Desde las 5:00 PM',
    lugar_evento: 'Cena Navideña e Intercambio',
    sitio_web_url: window.location.href.split('#')[0],
    sorteo_realizado: false,
    fecha_sorteo: null
  },
  participantes: []
};

let currentContactType = 'whatsapp';
let lastRegisteredParticipant = null;
let currentLookupResult = null;
let adminUnlocked = false;

// Parsear texto de archivo .env (KEY=VALUE)
function parseDotEnv(text) {
  const result = {};
  (text || '').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  });
  return result;
}

// Cargar variables y banderas desde env.config (GitHub Actions) o .env (local)
async function loadEnvConfig() {
  try {
    let res = await fetch('env.config?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) {
      res = await fetch('.env?t=' + Date.now(), { cache: 'no-store' });
    }
    if (!res.ok) return;
    const text = await res.text();
    const env = parseDotEnv(text);

    if (env.ADMIN_PIN_HASH) {
      ADMIN_PIN_HASH = env.ADMIN_PIN_HASH.trim().toLowerCase();
    } else if (env.ADMIN_PIN && env.ADMIN_PIN !== 'TU_PIN_SECRETO') {
      ADMIN_PIN_HASH = await sha256Hex('navidad_pijamas_2026:' + env.ADMIN_PIN.trim());
    }
    delete env.ADMIN_PIN;
    delete env.ADMIN_PIN_HASH;
    ENV_OVERRIDES = env;

    if (env.STORAGE_KEY) STORAGE_KEY = env.STORAGE_KEY;
    if (
      env.CLOUD_DB_URL &&
      !env.CLOUD_DB_URL.includes('TU_ID_DE_BD') &&
      !env.CLOUD_DB_URL.includes('tu-endpoint-api.com')
    ) {
      CLOUD_DB_URL = env.CLOUD_DB_URL.trim();
    }
    if (
      env.CLOUD_DB_OBJECT_NAME &&
      !env.CLOUD_DB_OBJECT_NAME.includes('TU_APP_KEY')
    ) {
      CLOUD_DB_OBJECT_NAME = env.CLOUD_DB_OBJECT_NAME.trim();
    }
    if (env.PREFIJO_TOKEN) PREFIJO_TOKEN = env.PREFIJO_TOKEN;
    if (env.CODIGO_PAIS_WA) CODIGO_PAIS_WA = env.CODIGO_PAIS_WA;

    if (env.AUTO_SORTEO_AL_MAX !== undefined) {
      FLAGS.auto_sorteo_al_max = env.AUTO_SORTEO_AL_MAX.toLowerCase() === 'true';
    }
    if (env.PERMITIR_REGISTRO_EXTRA !== undefined) {
      FLAGS.permitir_registro_extra = env.PERMITIR_REGISTRO_EXTRA.toLowerCase() === 'true';
    }
    if (env.MOSTRAR_BOTON_DEMO !== undefined) {
      FLAGS.mostrar_boton_demo = env.MOSTRAR_BOTON_DEMO.toLowerCase() === 'true';
    }

    applyEnvToState();
  } catch (_) {}
}

function applyEnvToState() {
  const env = ENV_OVERRIDES;
  if (!env || !dbState.evento) return;
  delete dbState.evento.admin_pin;
  if (env.MIN_PARTICIPANTES && env.MIN_PARTICIPANTES !== '12') {
    dbState.evento.min_participantes = parseInt(env.MIN_PARTICIPANTES, 10) || 13;
  }
  if (env.MAX_PARTICIPANTES && env.MAX_PARTICIPANTES !== '13' && env.MAX_PARTICIPANTES !== '25') {
    dbState.evento.max_participantes = parseInt(env.MAX_PARTICIPANTES, 10) || 20;
  } else {
    dbState.evento.max_participantes = 20;
  }
  if (env.PRESUPUESTO_MXN) dbState.evento.presupuesto_mxn = parseInt(env.PRESUPUESTO_MXN, 10) || 300;
  if (env.TITULO_EVENTO) dbState.evento.titulo = env.TITULO_EVENTO;
  if (env.FRASE_EVENTO) dbState.evento.frase = env.FRASE_EVENTO;
  if (env.FECHA_REVELACION && env.FECHA_REVELACION !== '2026-11-16' && env.FECHA_REVELACION !== '2026-11-20') {
    dbState.evento.fecha_revelacion = env.FECHA_REVELACION;
  } else {
    dbState.evento.fecha_revelacion = '2026-11-22';
  }
  if (
    env.FECHA_REVELACION_TEXTO &&
    !env.FECHA_REVELACION_TEXTO.toLowerCase().includes('16 de noviembre') &&
    !env.FECHA_REVELACION_TEXTO.toLowerCase().includes('20 de noviembre')
  ) {
    dbState.evento.fecha_revelacion_texto = env.FECHA_REVELACION_TEXTO;
  } else {
    dbState.evento.fecha_revelacion_texto = 'lunes 22 de noviembre';
  }
  if (env.FECHA_EVENTO_TEXTO && !env.FECHA_EVENTO_TEXTO.includes('14 de diciembre')) {
    dbState.evento.fecha_evento_texto = env.FECHA_EVENTO_TEXTO;
  } else {
    dbState.evento.fecha_evento_texto = '24 de diciembre | Desde las 5:00 PM';
  }
  if (env.FECHA_EVENTO_ISO && env.FECHA_EVENTO_ISO !== '20261214T170000') {
    dbState.evento.fecha_evento_iso = env.FECHA_EVENTO_ISO;
  } else {
    dbState.evento.fecha_evento_iso = '20261224T170000';
  }
  if (env.FECHA_EVENTO_FIN_ISO && env.FECHA_EVENTO_FIN_ISO !== '20261214T235900') {
    dbState.evento.fecha_evento_fin_iso = env.FECHA_EVENTO_FIN_ISO;
  } else {
    dbState.evento.fecha_evento_fin_iso = '20261224T235900';
  }
  if (env.LUGAR_EVENTO) dbState.evento.lugar_evento = env.LUGAR_EVENTO;
  if (env.SITIO_WEB_URL && !env.SITIO_WEB_URL.includes('tu-usuario')) {
    dbState.evento.sitio_web_url = env.SITIO_WEB_URL;
  }
}

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('intercambio_pijamas_bd_v1');
  } catch (_) {}
  createSnowflakes();
  initJingleBellsAutoStart();
  await loadEnvConfig();
  await loadDatabase();
  applyEnvToState();
  renderProgressAndSettings();
});

// Copos de nieve decorativos
function createSnowflakes() {
  const container = document.getElementById('snowContainer');
  if (!container) return;
  const flakes = ['❄', '❅', '❆', '✦'];
  for (let i = 0; i < 22; i++) {
    const span = document.createElement('span');
    span.className = 'snowflake';
    span.textContent = flakes[i % flakes.length];
    span.style.left = `${Math.random() * 100}%`;
    span.style.fontSize = `${Math.random() * 10 + 10}px`;
    span.style.animationDuration = `${Math.random() * 8 + 7}s`;
    span.style.animationDelay = `${Math.random() * 6}s`;
    container.appendChild(span);
  }
}

// Codificar participante en Base64url compacto (<= 190 chars) para KeyVal
function encodeParticipantB64(p, assignedIdx) {
  let maxGusto = 55;
  while (maxGusto >= 10) {
    const arr = [
      (p.nombre || '').slice(0, 28),
      (p.talla || 'M').slice(0, 14),
      (p.color_estampado || '').slice(0, maxGusto),
      p.tipo_contacto === 'email' ? 'e' : 'w',
      (p.contacto || '').slice(0, 30),
      p.token || 'PIJAMA-0000',
      typeof assignedIdx === 'number' ? assignedIdx : -1
    ];
    const jsonStr = JSON.stringify(arr);
    const utf8Bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (b64.length <= 190) return b64;
    maxGusto -= 10;
  }
  return 'W10';
}

function decodeParticipantB64(b64, idx) {
  try {
    const clean = (b64 || '').replace(/^"+|"+$/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4));
    const binary = atob(clean + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const arr = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(arr) || arr.length < 6) return null;
    return {
      id: `P${idx + 1}`,
      nombre: arr[0] || '',
      talla: arr[1] || 'M',
      color_estampado: arr[2] || '',
      tipo_contacto: arr[3] === 'e' ? 'email' : 'whatsapp',
      contacto: arr[4] || '',
      token: arr[5] || '',
      _assignedIdx: typeof arr[6] === 'number' ? arr[6] : -1,
      asignado_id: null,
      asignado_nombre: null,
      asignado_talla: null,
      asignado_color_estampado: null
    };
  } catch (_) {
    return null;
  }
}

// Helper de red con timeout y reintentos automáticos (3 intentos)
async function fetchWithRetry(url, options = {}, retries = 3, timeoutMs = 8000) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, attempt * 450));
    }
  }
  throw lastError || new Error('Error de red tras varios intentos');
}

function cacheBust() {
  return `?_=${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Cargar BD desde KeyVal Cloud con manejo de errores, anti-caché y reintentos
async function loadDatabase(options = {}) {
  const base = (CLOUD_DB_URL || '').replace(/\/+$/, '');
  const appKey = CLOUD_DB_OBJECT_NAME;
  if (!base || !appKey) {
    return false;
  }

  try {
    const metaRes = await fetchWithRetry(`${base}/GetValue/${appKey}/meta${cacheBust()}`, {}, 3, 7000);
    const metaRaw = (await metaRes.text()).replace(/^"+|"+$/g, '').trim();
    const parts = metaRaw.split('_');
    const sorteoFlag = parts[0] === '1';
    const totalCount = parseInt(parts[1] || '0', 10) || 0;

    dbState.evento.sorteo_realizado = sorteoFlag;

    if (totalCount === 0) {
      dbState.participantes = [];
    } else {
      const promises = [];
      for (let i = 1; i <= totalCount; i++) {
        promises.push(
          fetchWithRetry(`${base}/GetValue/${appKey}/p_${i}${cacheBust()}`, {}, 3, 7000)
            .then(r => r.text())
        );
      }
      const rawList = await Promise.all(promises);
      const decodedList = [];
      for (let idx = 0; idx < rawList.length; idx++) {
        const pObj = decodeParticipantB64(rawList[idx], idx);
        if (!pObj) {
          throw new Error(`No se pudo decodificar el participante #${idx + 1}`);
        }
        decodedList.push(pObj);
      }

      // Resolver los datos del asignado por índice
      decodedList.forEach(p => {
        if (p._assignedIdx >= 0 && decodedList[p._assignedIdx]) {
          const target = decodedList[p._assignedIdx];
          p.asignado_id = target.id;
          p.asignado_nombre = target.nombre;
          p.asignado_talla = target.talla;
          p.asignado_color_estampado = target.color_estampado;
        }
      });

      dbState.participantes = decodedList;
    }

    applyEnvToState();
    renderProgressAndSettings();
    return true;
  } catch (err) {
    console.warn('Error al sincronizar lectura desde la nube:', err);
    if (options.strict) {
      return false;
    }
  }
  return false;
}

// Guardar cambios en KeyVal Cloud con verificación de lectura post-guardado (Read-After-Write)
async function saveDatabase(onlyIndex = null) {
  const base = (CLOUD_DB_URL || '').replace(/\/+$/, '');
  const appKey = CLOUD_DB_OBJECT_NAME;
  if (!base || !appKey) {
    return false;
  }
  const list = dbState.participantes;

  const getAssignedIndex = p => {
    if (!p.asignado_nombre) return -1;
    return list.findIndex(other => normalizeName(other.nombre) === normalizeName(p.asignado_nombre));
  };

  let cloudSuccess = false;

  for (let verifyAttempt = 1; verifyAttempt <= 2; verifyAttempt++) {
    try {
      if (typeof onlyIndex === 'number' && list[onlyIndex]) {
        const p = list[onlyIndex];
        const b64 = encodeParticipantB64(p, getAssignedIndex(p));
        await fetchWithRetry(`${base}/UpdateValue/${appKey}/p_${onlyIndex + 1}/${b64}`, { method: 'POST' }, 3, 8000);
      } else {
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          const b64 = encodeParticipantB64(p, getAssignedIndex(p));
          await fetchWithRetry(`${base}/UpdateValue/${appKey}/p_${i + 1}/${b64}`, { method: 'POST' }, 3, 8000);
        }
      }

      const sorteoBit = dbState.evento.sorteo_realizado ? '1' : '0';
      const metaVal = `${sorteoBit}_${list.length}`;
      await fetchWithRetry(`${base}/UpdateValue/${appKey}/meta/${metaVal}`, { method: 'POST' }, 3, 8000);

      // Verificación Read-After-Write: confirmar que la nube realmente guardó el dato
      const checkIndex = typeof onlyIndex === 'number' && list[onlyIndex] ? onlyIndex : list.length - 1;
      if (checkIndex >= 0 && list[checkIndex]) {
        const verifyRes = await fetchWithRetry(
          `${base}/GetValue/${appKey}/p_${checkIndex + 1}${cacheBust()}`,
          {},
          2,
          6000
        );
        const verifyB64 = await verifyRes.text();
        const verifyDecoded = decodeParticipantB64(verifyB64, checkIndex);
        if (!verifyDecoded || verifyDecoded.token !== list[checkIndex].token) {
          throw new Error('La verificación en la nube no coincidió con el token guardado.');
        }
      }

      const verifyMetaRes = await fetchWithRetry(`${base}/GetValue/${appKey}/meta${cacheBust()}`, {}, 2, 6000);
      const verifyMetaText = (await verifyMetaRes.text()).replace(/^"+|"+$/g, '').trim();
      if (verifyMetaText !== metaVal) {
        throw new Error('El contador meta en la nube no se actualizó.');
      }

      cloudSuccess = true;
      break;
    } catch (err) {
      console.warn(`Intento de guardado/verificación ${verifyAttempt} falló:`, err);
      if (verifyAttempt < 2) {
        await new Promise(r => setTimeout(r, 600));
      }
    }
  }

  if (!cloudSuccess) {
    return false;
  }

  // Si el servidor local (node server.js) está corriendo, actualizar también bd_intercambio.json local
  try {
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbState)
    });
  } catch (_) {}

  renderProgressAndSettings();
  if (adminUnlocked) {
    renderAdminList();
  }
  return true;
}

// Actualizar barra de progreso
function renderProgressAndSettings() {
  const total = dbState.participantes.length;
  const max = dbState.evento.max_participantes || 20;
  const pct = Math.min(100, Math.round((total / max) * 100));
  const fechaRevTexto = dbState.evento.fecha_revelacion_texto || 'lunes 22 de noviembre';

  document.getElementById('progressCountText').textContent = `${total} de ${max}`;
  document.getElementById('progressBarFill').style.width = `${pct}%`;

  const subtext = document.getElementById('progressSubtext');
  if (dbState.evento.sorteo_realizado) {
    subtext.innerHTML = '🎉 <strong>¡El sorteo ya se realizó!</strong> Ve a la pestaña <em>“¿Quién me tocó?”</em> con tu Nombre y tu Token.';
  } else if (total >= dbState.evento.min_participantes) {
    subtext.innerHTML = `✨ ¡Ya somos ${total} registrados! Estamos listos para revelar resultados el <strong>${fechaRevTexto}</strong>.`;
  } else {
    subtext.innerHTML = `Faltan poquitos para completar los participantes. Resultados: <strong>${fechaRevTexto}</strong>.`;
  }
}

// Cambiar entre pestaña de Registro y Consulta
function switchTab(tab) {
  const regSection = document.getElementById('sectionRegister');
  const lookSection = document.getElementById('sectionLookup');
  const regBtn = document.getElementById('tabRegisterBtn');
  const lookBtn = document.getElementById('tabLookupBtn');

  if (tab === 'register') {
    regSection.classList.remove('hidden');
    lookSection.classList.add('hidden');
    regBtn.classList.add('active');
    lookBtn.classList.remove('active');
  } else {
    regSection.classList.add('hidden');
    lookSection.classList.remove('hidden');
    regBtn.classList.remove('active');
    lookBtn.classList.add('active');
  }
}

// Selección rápida de talla
function selectSize(sizeValue) {
  const pills = document.querySelectorAll('#sizePillsContainer .size-pill');
  pills.forEach(btn => {
    if (btn.textContent.trim() === sizeValue) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
  document.getElementById('inputTallaDetalle').value = sizeValue;
}

// Agregar sugerencia de color/estampado
function appendChip(text) {
  const area = document.getElementById('inputEstampado');
  const current = area.value.trim();
  if (!current) {
    area.value = text;
  } else if (!current.toLowerCase().includes(text.toLowerCase())) {
    area.value = `${current}, ${text}`;
  }
  area.focus();
}

// Cambiar tipo de contacto (WhatsApp o Email)
function setContactType(type) {
  currentContactType = type;
  const btnWa = document.getElementById('btnTypeWhatsapp');
  const btnEm = document.getElementById('btnTypeEmail');
  const input = document.getElementById('inputContacto');

  if (type === 'whatsapp') {
    btnWa.classList.add('active');
    btnEm.classList.remove('active');
    input.type = 'tel';
    input.placeholder = 'Ej. 5512345678 (10 dígitos)';
  } else {
    btnEm.classList.add('active');
    btnWa.classList.remove('active');
    input.type = 'email';
    input.placeholder = 'Ej. tu.correo@ejemplo.com';
  }
}

// Generar Token único y fácil de anotar (ej. PIJAMA-4821)
function generateUniqueToken() {
  const existingTokens = new Set(dbState.participantes.map(p => p.token));
  let token = '';
  do {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    token = `${PREFIJO_TOKEN}-${randomNum}`;
  } while (existingTokens.has(token));
  return token;
}

// Normalizar texto para comparar nombres sin importar acentos o mayúsculas
function normalizeName(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Limpiar teléfono a dígitos
function cleanPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `${CODIGO_PAIS_WA}${digits}`;
  if (digits.length === 12 && digits.startsWith(CODIGO_PAIS_WA)) return digits;
  if (digits.length === 13 && digits.startsWith(`${CODIGO_PAIS_WA}1`)) return CODIGO_PAIS_WA + digits.slice(3);
  return digits;
}

// Procesar registro de participante
async function handleRegistrationSubmit(e) {
  e.preventDefault();

  const nombre = document.getElementById('inputNombre').value.trim();
  const talla = document.getElementById('inputTallaDetalle').value.trim();
  const estampado = document.getElementById('inputEstampado').value.trim();
  const contacto = document.getElementById('inputContacto').value.trim();

  if (!nombre || !talla || !estampado || !contacto) {
    showToast('Por favor completa todos los campos.');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Sincronizando con la base de datos...';
  }

  // 1. Sincronizar estrictamente con la nube antes de registrar para no pisar otros registros
  const loadedOk = await loadDatabase({ strict: true });
  if (!loadedOk) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🔄 Reintentar Registro';
    }
    showToast('⚠️ Error de conexión al leer la base de datos. Revisa tu internet e intenta de nuevo.');
    return;
  }

  // Verificar si ya se había registrado con el mismo nombre exacto
  const existingIdx = dbState.participantes.findIndex(
    p => normalizeName(p.nombre) === normalizeName(nombre)
  );
  if (existingIdx !== -1) {
    const existing = dbState.participantes[existingIdx];
    const backup = { ...existing };
    existing.talla = talla;
    existing.color_estampado = estampado;
    existing.contacto = contacto;
    existing.tipo_contacto = currentContactType;
    existing.actualizado_en = new Date().toISOString();

    if (submitBtn) {
      submitBtn.textContent = '⏳ Verificando guardado en la nube...';
    }

    const updatedOk = await saveDatabase(existingIdx);
    if (!updatedOk) {
      dbState.participantes[existingIdx] = backup;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🔄 Error de red - Toca para Reintentar';
      }
      showToast('⚠️ No se pudo confirmar el guardado en la nube. Por favor presiona el botón de nuevo.');
      return;
    }

    lastRegisteredParticipant = existing;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🎄 Registrarme y Obtener mi Token';
    }
    showTokenConfirmation(existing);
    showToast('✅ Datos actualizados y verificados en la nube.');
    return;
  }

  // Validar bandera PERMITIR_REGISTRO_EXTRA si ya se llegó al máximo
  const maxLimit = dbState.evento.max_participantes || 20;
  if (!FLAGS.permitir_registro_extra && dbState.participantes.length >= maxLimit) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🎄 Registrarme y Obtener mi Token';
    }
    showToast(`⚠️ Ya se alcanzó el cupo máximo de ${maxLimit} participantes.`);
    return;
  }

  const newParticipant = {
    id: 'P' + (dbState.participantes.length + 1) + '-' + Date.now().toString().slice(-4),
    nombre,
    talla,
    color_estampado: estampado,
    tipo_contacto: currentContactType,
    contacto,
    token: generateUniqueToken(),
    fecha_registro: new Date().toISOString(),
    asignado_id: null,
    asignado_nombre: null,
    asignado_talla: null,
    asignado_color_estampado: null
  };

  dbState.participantes.push(newParticipant);
  const newIdx = dbState.participantes.length - 1;

  // Si AUTO_SORTEO_AL_MAX está activo y llegamos al máximo, realizar sorteo automáticamente
  let didDraw = false;
  if (
    FLAGS.auto_sorteo_al_max &&
    dbState.participantes.length >= maxLimit &&
    !dbState.evento.sorteo_realizado
  ) {
    performDerangementDraw();
    didDraw = true;
  }

  if (submitBtn) {
    submitBtn.textContent = '⏳ Verificando tu registro en la nube...';
  }

  const savedOk = await saveDatabase(didDraw ? null : newIdx);
  if (!savedOk) {
    // Revertir si la nube no confirmó el guardado para jamás entregar un Token fantasma
    dbState.participantes.pop();
    if (didDraw) {
      dbState.evento.sorteo_realizado = false;
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🔄 Error de red - Toca para Reintentar';
    }
    showToast('⚠️ Hubo un problema de conexión al guardar en la nube. Tus datos siguen aquí, toca el botón para reintentar.');
    return;
  }

  lastRegisteredParticipant = newParticipant;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '🎄 Registrarme y Obtener mi Token';
  }
  showTokenConfirmation(newParticipant);
  showToast('✅ ¡Registro guardado y verificado en la nube!');
}

// Mostrar pantalla de confirmación con el Token generado
function showTokenConfirmation(participant) {
  document.getElementById('registerFormContainer').classList.add('hidden');
  document.getElementById('tokenConfirmationView').classList.remove('hidden');

  document.getElementById('confirmUserName').textContent = participant.nombre;
  document.getElementById('generatedTokenDisplay').textContent = participant.token;
  document.getElementById('confirmUserContact').textContent = participant.contacto;

  //Pre-llenar los campos de la pestaña de consulta para comodidad del usuario
  document.getElementById('lookupNombre').value = participant.nombre;
  document.getElementById('lookupToken').value = participant.token;

  // Configurar botón para guardarse el Token en su propio WhatsApp
  const selfWaBtn = document.getElementById('saveTokenSelfWhatsappBtn');
  const msg =
    `✨ *Mi Registro al Intercambio de Pijamas Pachoncitas* ⛄\n\n` +
    `⭐ *Nombre:* ${participant.nombre}\n` +
    `✔️ *Mi Token Secreto:* ${participant.token}\n` +
    `➜ *Mi Talla:* ${participant.talla}\n` +
    `❤️ *Color/Estampado pedido:* ${participant.color_estampado}\n\n` +
    `❄️ *Consulta de resultados:* Lunes 22 de noviembre\n` +
    `▶️ *Sitio web:* ${window.location.href.split('#')[0]}\n\n`;

  const phoneDigits = cleanPhone(participant.contacto);
  if (participant.tipo_contacto === 'whatsapp' && phoneDigits.length >= 10) {
    selfWaBtn.href = `https://api.whatsapp.com/send?phone=${phoneDigits}&text=${encodeURIComponent(msg)}`;
  } else {
    selfWaBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  }
}

function resetRegistrationView() {
  document.getElementById('registrationForm').reset();
  selectSize('M');
  document.getElementById('registerFormContainer').classList.remove('hidden');
  document.getElementById('tokenConfirmationView').classList.add('hidden');
}

function copyTokenToClipboard() {
  const tokenText = document.getElementById('generatedTokenDisplay').textContent.trim();
  navigator.clipboard.writeText(tokenText).then(() => {
    showToast(`Token ${tokenText} copiado al portapapeles 📋`);
  });
}

// ============================================================================
// CONSULTA DE RESULTADOS CON NOMBRE + TOKEN (VIERNES 20 DE NOVIEMBRE)
// ============================================================================
async function handleLookupSubmit(e) {
  e.preventDefault();

  const lookupBtn = document.querySelector('#lookupForm button[type="submit"]');
  if (lookupBtn) {
    lookupBtn.disabled = true;
    lookupBtn.textContent = '⏳ Consultando en la nube...';
  }

  const nombreInput = document.getElementById('lookupNombre').value.trim();
  const tokenInput = document.getElementById('lookupToken').value.trim().toUpperCase();

  const pendingBox = document.getElementById('lookupPendingNotice');
  const resultBox = document.getElementById('lookupResultContainer');
  pendingBox.classList.add('hidden');
  resultBox.classList.add('hidden');

  const findMatchingParticipant = () =>
    dbState.participantes.find(p => {
      const sameToken = (p.token || '').toUpperCase() === tokenInput;
      const normRegistered = normalizeName(p.nombre);
      const normQuery = normalizeName(nombreInput);
      const nameMatches =
        normRegistered.includes(normQuery) || normQuery.includes(normRegistered);
      return sameToken && nameMatches;
    });

  const loadedOk = await loadDatabase({ strict: true });
  let participant = findMatchingParticipant();

  // Si no se encontró en el primer intento, esperar 700ms y volver a consultar la nube por si se acaba de registrar
  if (!participant) {
    await new Promise(r => setTimeout(r, 700));
    await loadDatabase({ strict: true });
    participant = findMatchingParticipant();
  }

  if (lookupBtn) {
    lookupBtn.disabled = false;
    lookupBtn.textContent = '✨ Consultar mi Intercambio';
  }

  if (!loadedOk && !participant) {
    showToast('⚠️ Error de conexión al consultar la base de datos. Revisa tu internet e intenta de nuevo.');
    return;
  }

  if (!participant) {
    showToast('❌ No encontramos esa combinación de Nombre y Token. Revisa que estén bien escritos.');
    return;
  }

  // Verificar si ya se realizó el sorteo y tiene persona asignada
  if (!dbState.evento.sorteo_realizado || !participant.asignado_nombre) {
    document.getElementById('pendingUserName').textContent = participant.nombre;
    document.getElementById('pendingCountStatus').textContent =
      `van ${dbState.participantes.length} de ${dbState.evento.max_participantes || 20} registrados`;
    pendingBox.classList.remove('hidden');
    return;
  }

  // Mostrar a quién le tocó y configurar botones de Calendario y Auto-mensaje
  currentLookupResult = participant;
  document.getElementById('resultTargetName').textContent = participant.asignado_nombre;
  document.getElementById('resultTargetSize').textContent = participant.asignado_talla || 'Por confirmar';
  document.getElementById('resultTargetPattern').textContent =
    participant.asignado_color_estampado || 'Sorpresa navideña';

  configureReminderButtons(participant);
  resultBox.classList.remove('hidden');
}

// Configurar botones de Google Calendar, WhatsApp propio y Correo propio
function configureReminderButtons(participant) {
  const targetName = participant.asignado_nombre;
  const targetSize = participant.asignado_talla;
  const targetPattern = participant.asignado_color_estampado;
  const eventDateText = dbState.evento.fecha_evento_texto || '24 de diciembre | Desde las 5:00 PM';
  const eventLocation = dbState.evento.lugar_evento || 'Cena Navideña e Intercambio';

  // 1. Mensaje de WhatsApp para enviarse a sí mismo como recordatorio
  const waText =
    `✨ *Recordatorio Secreto: Intercambio de Pijamas Pachoncitas* ⛄\n\n` +
    `Hola ${participant.nombre}, aquí tienes los datos de la persona que te tocó:\n` +
    `⭐ *Te toca regalarle a:* ${targetName}\n` +
    `➜ *Talla de su pijama:* ${targetSize}\n` +
    `❤️ *Color / Estampado favorito:* ${targetPattern}\n` +
    `✔️ *Presupuesto:* $300 MXN\n\n` +
    `✨ *¡FELIZ NAVIDAD! ¡ESTÁS INVITADOOOO A NUESTRA CENA NAVIDEÑA!* ⛄\n` +
    `➜ *Lo que habrá:* Habrá regalos, azulitos de dudosa procedencia, mucha comida y ensalada de manzana.\n` +
    `❄️ *Fecha y hora:* ${eventDateText}\n` +
    `✔️ *Requisitos:* Traer tu regalo del intercambio. ¡No faltes!`;

  const waBtn = document.getElementById('btnSelfWhatsappReminder');
  const phoneDigits = cleanPhone(participant.contacto);
  if (participant.tipo_contacto === 'whatsapp' && phoneDigits.length >= 10) {
    waBtn.href = `https://api.whatsapp.com/send?phone=${phoneDigits}&text=${encodeURIComponent(waText)}`;
  } else {
    waBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;
  }

  // 2. Enlace de Google Calendar
  const gcalTitle = `✨ Cena Navideña e Intercambio de Pijamas ($300 MXN) - Regalo para ${targetName}`;
  const gcalDetails =
    `¡FELIZ NAVIDAD! ¡ESTÁS INVITADOOOO A NUESTRA CENA NAVIDEÑA!\n\n` +
    `⭐ Persona asignada en el intercambio: ${targetName}\n` +
    `➜ Talla: ${targetSize}\n` +
    `❤️ Color / Estampado favorito: ${targetPattern}\n` +
    `✔️ Presupuesto: $300 MXN\n\n` +
    `Lo que habrá: Habrá regalos, azulitos de dudosa procedencia, mucha comida y ensalada de manzana.\n` +
    `Requisitos: Traer tu regalo del intercambio. ¡No faltes!`;

  const startIso = (dbState.evento.fecha_evento_iso || '20261224T170000').replace(/[-:]/g, '');
  const endIso = (dbState.evento.fecha_evento_fin_iso || '20261224T235900').replace(/[-:]/g, '');

  const gcalUrl =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(gcalTitle)}` +
    `&dates=${startIso}/${endIso}` +
    `&details=${encodeURIComponent(gcalDetails)}` +
    `&location=${encodeURIComponent(eventLocation)}`;

  document.getElementById('btnGoogleCalendar').href = gcalUrl;

  // 3. Enlace de Correo Electrónico para sí mismo
  const mailSubject = `✨ Cena Navideña e Intercambio de Pijamas: Me tocó ${targetName}`;
  const mailTo = participant.tipo_contacto === 'email' ? participant.contacto : '';
  document.getElementById('btnSelfEmailReminder').href =
    `mailto:${mailTo}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(waText)}`;
}

// Descargar archivo .ics para Calendario de iPhone / Apple / Outlook
function downloadICSFile() {
  if (!currentLookupResult) return;
  const p = currentLookupResult;
  const startIso = (dbState.evento.fecha_evento_iso || '20261224T170000').replace(/[-:]/g, '');
  const endIso = (dbState.evento.fecha_evento_fin_iso || '20261224T235900').replace(/[-:]/g, '');

  const description =
    `Persona que te toco: ${p.asignado_nombre}\\n` +
    `Talla de pijama: ${p.asignado_talla}\\n` +
    `Color/Estampado favorito: ${p.asignado_color_estampado}\\n` +
    `Presupuesto: $300 MXN\\n` +
    `Cena Navidena: Habra regalos, azulitos de dudosa procedencia, mucha comida y ensalada de manzana. Requisitos: Traer tu regalo del intercambio.`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Intercambio Pijamas Pachoncitas//ES',
    'BEGIN:VEVENT',
    `UID:intercambio-pijamas-${p.token}@navidad`,
    `DTSTAMP:${startIso}Z`,
    `DTSTART:${startIso}`,
    `DTEND:${endIso}`,
    `SUMMARY:🎄 Cena Navideña e Intercambio (Regalo para ${p.asignado_nombre})`,
    `DESCRIPTION:${description}`,
    `LOCATION:${dbState.evento.lugar_evento}`,
    'BEGIN:VALARM',
    'TRIGGER:-P2D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio: Llevar pijama pachoncita a la Cena Navideña',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsLines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `intercambio-pijama-${p.token}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// ALGORITMO DE SORTEO (CICLO HAMILTONIANO SIN AUTO-ASIGNACIÓN) Y ADMIN PANEL
// ============================================================================
function performDerangementDraw() {
  const list = dbState.participantes;
  if (list.length < 2) return false;

  const indices = list.map((_, idx) => idx);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  for (let k = 0; k < indices.length; k++) {
    const giver = list[indices[k]];
    const receiver = list[indices[(k + 1) % indices.length]];
    giver.asignado_id = receiver.id;
    giver.asignado_nombre = receiver.nombre;
    giver.asignado_talla = receiver.talla;
    giver.asignado_color_estampado = receiver.color_estampado;
  }

  dbState.evento.sorteo_realizado = true;
  dbState.evento.fecha_sorteo = new Date().toISOString();
  return true;
}

async function toggleAdminPanel() {
  const panel = document.getElementById('adminPanel');
  if (!adminUnlocked) {
    if (!ADMIN_PIN_HASH) {
      await loadEnvConfig();
    }
    if (!ADMIN_PIN_HASH) {
      showToast('⚠️ El PIN no está configurado en .env o GitHub Secrets.');
      return;
    }
    const pin = prompt('Ingresa el PIN de organizador:');
    if (!pin) {
      return;
    }
    const inputHash = await sha256Hex('navidad_pijamas_2026:' + pin.trim());
    if (inputHash !== ADMIN_PIN_HASH) {
      showToast('No seas tramposo 😤 ');
      return;
    }
    adminUnlocked = true;
  }

  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    await loadDatabase();
    renderAdminList();
  }
}

async function runSecretSantaDraw() {
  if (!adminUnlocked) {
    showToast('🔒 Acceso restringido al organizador.');
    return;
  }
  await loadDatabase();
  if (dbState.participantes.length < 2) {
    showToast('Se necesitan al menos 2 participantes registrados para hacer el sorteo.');
    return;
  }
  performDerangementDraw();
  await saveDatabase();
  showToast(`🎉 ¡Sorteo realizado con éxito entre ${dbState.participantes.length} participantes!`);
}

function renderAdminList() {
  if (!adminUnlocked) return;
  const container = document.getElementById('adminParticipantsList');
  if (!dbState.participantes.length) {
    container.innerHTML = '<p style="font-size:0.82rem; color:#6b7280;">Aún no hay participantes registrados.</p>';
    return;
  }

  container.innerHTML = dbState.participantes
    .map((p, i) => {
      const assignedBadge = p.asignado_nombre
        ? `<span style="color:#166534; font-weight:700;">➔ Regala a: ${p.asignado_nombre} (${p.asignado_talla})</span>`
        : `<span style="color:#9ca3af;">Sorteo pendiente</span>`;

      const waPhone = cleanPhone(p.contacto);
      const individualWaMsg = p.asignado_nombre
        ? `🎄✨ ¡Hola *${p.nombre}*! Los duendes ya hicieron su magia y tenemos los resultados del *Intercambio de Pijamas Pachoncitas* 🧸💤\n\n` +
          `🤫 _Guarda bien el secreto..._\n` +
          `🎁 *Te tocó regalarle a:* *${p.asignado_nombre}*\n` +
          `📏 *Talla:* ${p.asignado_talla}\n` +
          `🎨 *Color/Estampado fav:* ${p.asignado_color_estampado}\n` +
          `🔑 *Tu Token:* \`${p.token}\`\n\n` +
          `🥂 *¡NOS VEMOS EN LA CENA NAVIDEÑA!* 🎅\n` +
          `📲 *Guarda el evento en tu calendario y consulta los detalles aquí:*\n${window.location.href.split('#')[0]}`
        : '';

      const waActionLink =
        p.asignado_nombre && waPhone.length >= 10
          ? `<a href="https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(individualWaMsg)}" target="_blank" style="color:#16a34a; font-weight:700; text-decoration:none; font-size:0.76rem;">📲 Enviar WA</a>`
          : '';

      return `
        <div class="participant-item">
          <div>
            <strong>${i + 1}. ${p.nombre}</strong> <code style="background:#fef3c7; padding:2px 5px; border-radius:4px;">${p.token}</code><br/>
            <span>Talla: <b>${p.talla}</b> | Gusto: ${p.color_estampado}</span><br/>
            <span>Contacto: ${p.contacto}</span><br/>
            ${assignedBadge}
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
            ${waActionLink}
            <button type="button" onclick="deleteParticipant('${p.id}')" style="background:none; border:none; color:#dc2626; cursor:pointer; font-size:0.75rem;">Eliminar</button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function deleteParticipant(id) {
  if (!adminUnlocked) return;
  dbState.participantes = dbState.participantes.filter(p => p.id !== id);
  await saveDatabase();
}

function downloadDatabaseJSON() {
  if (!adminUnlocked) return;
  const safeCopy = JSON.parse(JSON.stringify(dbState));
  if (safeCopy.evento) delete safeCopy.evento.admin_pin;
  const jsonStr = JSON.stringify(safeCopy, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bd_intercambio.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Archivo bd_intercambio.json descargado 💾');
}

function downloadDatabaseCSV() {
  if (!adminUnlocked) return;
  const headers = ['Nombre', 'Token', 'Talla', 'Color_Estampado', 'Contacto', 'Regala_A', 'Talla_Asignado', 'Gusto_Asignado'];
  const rows = dbState.participantes.map(p => [
    `"${(p.nombre || '').replace(/"/g, '""')}"`,
    `"${p.token || ''}"`,
    `"${(p.talla || '').replace(/"/g, '""')}"`,
    `"${(p.color_estampado || '').replace(/"/g, '""')}"`,
    `"${(p.contacto || '').replace(/"/g, '""')}"`,
    `"${(p.asignado_nombre || '').replace(/"/g, '""')}"`,
    `"${(p.asignado_talla || '').replace(/"/g, '""')}"`,
    `"${(p.asignado_color_estampado || '').replace(/"/g, '""')}"`
  ]);
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bd_intercambio_pijamas.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showToast(msg) {
  const toast = document.getElementById('toastNotification');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3600);
}

// ============================================================================
// 🔔 MÚSICA DE FONDO INSTRUMENTAL (JINGLE BELLS - CAJA DE MÚSICA NAVIDEÑA)
// ============================================================================
let audioCtx = null;
let isMusicPlaying = false;
let musicStepTimer = null;
let currentNoteIndex = 0;

const NOTE_FREQ = {
  G3: 196.00, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00
};

// Partitura completa instrumental de Jingle Bells (Coro + Verso en bucle suave)
const JINGLE_BELLS_SCORE = [
  ['E5', 'C4', 1], ['E5', null, 1], ['E5', 'G3', 2],
  ['E5', 'C4', 1], ['E5', null, 1], ['E5', 'G3', 2],
  ['E5', 'C4', 1], ['G5', null, 1], ['C5', 'E4', 1.5], ['D5', null, 0.5], ['E5', 'C4', 4],
  ['F5', 'F4', 1], ['F5', null, 1], ['F5', 'C4', 1.5], ['F5', null, 0.5],
  ['F5', 'C4', 1], ['E5', 'C4', 1], ['E5', 'G3', 1], ['E5', null, 0.5], ['E5', null, 0.5],
  ['E5', 'D4', 1], ['D5', null, 1], ['D5', 'G3', 1], ['E5', null, 1], ['D5', 'G3', 2], ['G5', 'B4', 2],
  ['E5', 'C4', 1], ['E5', null, 1], ['E5', 'G3', 2],
  ['E5', 'C4', 1], ['E5', null, 1], ['E5', 'G3', 2],
  ['E5', 'C4', 1], ['G5', null, 1], ['C5', 'E4', 1.5], ['D5', null, 0.5], ['E5', 'C4', 4],
  ['F5', 'F4', 1], ['F5', null, 1], ['F5', 'C4', 1.5], ['F5', null, 0.5],
  ['F5', 'C4', 1], ['E5', 'C4', 1], ['E5', 'G3', 1], ['E5', null, 0.5], ['E5', null, 0.5],
  ['G5', 'G4', 1], ['G5', null, 1], ['F5', 'D4', 1], ['D5', null, 1], ['C5', 'C4', 4],
  ['G4', 'C4', 1], ['E5', null, 1], ['D5', 'G3', 1], ['C5', null, 1], ['G4', 'C4', 3], ['G4', null, 1],
  ['G4', 'C4', 1], ['E5', null, 1], ['D5', 'G3', 1], ['C5', null, 1], ['A4', 'F4', 4],
  ['A4', 'F4', 1], ['F5', null, 1], ['E5', 'C4', 1], ['D5', null, 1], ['B4', 'G3', 4],
  ['G5', 'G4', 1], ['G5', null, 1], ['F5', 'D4', 1], ['D5', null, 1], ['E5', 'C4', 4]
];

function playMusicBoxNote(freq, durationSec, volume = 0.08) {
  if (!audioCtx || !freq) return;
  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec * 1.35);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + durationSec * 1.4);

  const bellOsc = audioCtx.createOscillator();
  const bellGain = audioCtx.createGain();
  bellOsc.type = 'triangle';
  bellOsc.frequency.setValueAtTime(freq * 2, now);

  bellGain.gain.setValueAtTime(0.0001, now);
  bellGain.gain.linearRampToValueAtTime(volume * 0.22, now + 0.01);
  bellGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec * 0.65);

  bellOsc.connect(bellGain);
  bellGain.connect(audioCtx.destination);
  bellOsc.start(now);
  bellOsc.stop(now + durationSec * 0.7);
}

function scheduleNextJingleStep() {
  if (!isMusicPlaying) return;

  const beatMs = 235;
  const [melodyNote, bassNote, beats] = JINGLE_BELLS_SCORE[currentNoteIndex];
  const durationSec = (beats * beatMs) / 1000;

  if (melodyNote && NOTE_FREQ[melodyNote]) {
    playMusicBoxNote(NOTE_FREQ[melodyNote], durationSec, 0.075);
  }
  if (bassNote && NOTE_FREQ[bassNote]) {
    playMusicBoxNote(NOTE_FREQ[bassNote], durationSec * 1.2, 0.04);
  }

  currentNoteIndex = (currentNoteIndex + 1) % JINGLE_BELLS_SCORE.length;
  musicStepTimer = setTimeout(scheduleNextJingleStep, beats * beatMs);
}

function updateMusicButtonUI() {
  const btn = document.getElementById('musicToggleBtn');
  if (!btn) return;
  if (isMusicPlaying) {
    btn.classList.add('playing');
    btn.innerHTML = '🔔 Jingle Bells: ON';
  } else {
    btn.classList.remove('playing');
    btn.innerHTML = '🔕 Jingle Bells: OFF';
  }
}

function startJingleBells() {
  if (isMusicPlaying) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  isMusicPlaying = true;
  updateMusicButtonUI();
  clearTimeout(musicStepTimer);
  scheduleNextJingleStep();
}

function stopJingleBells() {
  isMusicPlaying = false;
  clearTimeout(musicStepTimer);
  updateMusicButtonUI();
}

function toggleJingleBells() {
  if (isMusicPlaying) {
    stopJingleBells();
  } else {
    startJingleBells();
  }
}

function initJingleBellsAutoStart() {
  const unlockAndPlay = e => {
    if (e && e.target && e.target.closest && e.target.closest('#musicToggleBtn')) {
      window.removeEventListener('click', unlockAndPlay);
      window.removeEventListener('touchstart', unlockAndPlay);
      return;
    }
    startJingleBells();
    window.removeEventListener('click', unlockAndPlay);
    window.removeEventListener('touchstart', unlockAndPlay);
  };

  window.addEventListener('click', unlockAndPlay, { once: true });
  window.addEventListener('touchstart', unlockAndPlay, { once: true });
}

// Exponer únicamente los manejadores de eventos de interfaz necesarios (sin exponer dbState ni llaves)
window.switchTab = switchTab;
window.selectSize = selectSize;
window.appendChip = appendChip;
window.setContactType = setContactType;
window.handleRegistrationSubmit = handleRegistrationSubmit;
window.copyTokenToClipboard = copyTokenToClipboard;
window.resetRegistrationView = resetRegistrationView;
window.handleLookupSubmit = handleLookupSubmit;
window.downloadICSFile = downloadICSFile;
window.toggleAdminPanel = toggleAdminPanel;
window.runSecretSantaDraw = runSecretSantaDraw;
window.deleteParticipant = deleteParticipant;
window.downloadDatabaseJSON = downloadDatabaseJSON;
window.downloadDatabaseCSV = downloadDatabaseCSV;
window.toggleJingleBells = toggleJingleBells;

})();
