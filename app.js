// ============================================================================
// INTERCAMBIO NAVIDEÑO DE PIJAMAS PACHONCITAS ($300 MXN) - LÓGICA DEL SITIO
// ============================================================================

const STORAGE_KEY = 'intercambio_pijamas_bd_v1';

// Estado inicial sincronizado con bd_intercambio.json
let dbState = {
  evento: {
    titulo: 'Intercambio Navideño de Pijamas Pachoncitas',
    frase: '“Suaves, calientitas y con mucho espíritu navideño: ¡regala el abrazo más pachoncito de esta Navidad!”',
    presupuesto_mxn: 300,
    min_participantes: 13,
    max_participantes: 14,
    fecha_revelacion: '2026-11-16',
    fecha_evento_iso: '20261219T200000',
    fecha_evento_fin_iso: '20261219T235900',
    fecha_evento_texto: 'Jueves 24 de Diciembre de 2026, 5:00 PM',
    lugar_evento: 'Casa sede del Intercambio Navideño',
    video_invitacion_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    sitio_web_url: window.location.href.split('#')[0],
    sorteo_realizado: false,
    fecha_sorteo: null,
    admin_pin: '11235'
  },
  participantes: []
};

let currentContactType = 'whatsapp';
let lastRegisteredParticipant = null;
let currentLookupResult = null;
let adminUnlocked = false;

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  createSnowflakes();
  await loadDatabase();
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

// Cargar BD desde el servidor local/nube o archivo bd_intercambio.json
async function loadDatabase() {
  // 1. Intentar leer desde endpoint API local/túnel si está activo
  try {
    const apiRes = await fetch('/api/db', { cache: 'no-store' });
    if (apiRes.ok) {
      const serverData = await apiRes.json();
      if (serverData && Array.isArray(serverData.participantes)) {
        dbState = serverData;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dbState));
        return;
      }
    }
  } catch (_) {
    // Continuar con fallback estático / localStorage
  }

  // 2. Intentar leer desde localStorage
  const savedLocal = localStorage.getItem(STORAGE_KEY);
  if (savedLocal) {
    try {
      const parsed = JSON.parse(savedLocal);
      if (parsed && Array.isArray(parsed.participantes)) {
        dbState = parsed;
      }
    } catch (_) {}
  }

  // 3. Intentar leer bd_intercambio.json publicado en el repositorio (ej. GitHub Pages)
  try {
    const jsonRes = await fetch('bd_intercambio.json?t=' + Date.now(), { cache: 'no-store' });
    if (jsonRes.ok) {
      const fileData = await jsonRes.json();
      if (fileData && Array.isArray(fileData.participantes)) {
        // Si el archivo publicado tiene más participantes o el sorteo ya hecho, actualizar
        if (
          fileData.participantes.length > dbState.participantes.length ||
          (fileData.evento && fileData.evento.sorteo_realizado && !dbState.evento.sorteo_realizado)
        ) {
          dbState = fileData;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dbState));
        }
      }
    }
  } catch (_) {}
}

// Guardar cambios en localStorage y sincronizar con el servidor si está corriendo
async function saveDatabase() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dbState));
  try {
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbState)
    });
  } catch (_) {
    // Modo estático (GitHub Pages)
  }
  renderProgressAndSettings();
  if (adminUnlocked) {
    renderAdminList();
  }
}

// Actualizar barra de progreso (12-13 personas) y enlaces de video
function renderProgressAndSettings() {
  const total = dbState.participantes.length;
  const max = dbState.evento.max_participantes || 13;
  const pct = Math.min(100, Math.round((total / max) * 100));

  document.getElementById('progressCountText').textContent = `${total} de ${max}`;
  document.getElementById('progressBarFill').style.width = `${pct}%`;

  const subtext = document.getElementById('progressSubtext');
  if (dbState.evento.sorteo_realizado) {
    subtext.innerHTML = '🎉 <strong>¡El sorteo ya se realizó!</strong> Ve a la pestaña <em>“¿Quién me tocó?”</em> con tu Nombre y tu Token.';
  } else if (total >= dbState.evento.min_participantes) {
    subtext.innerHTML = `✨ ¡Ya somos ${total} registrados! Estamos listos para revelar resultados el <strong>lunes 16 de noviembre</strong>.`;
  } else {
    subtext.innerHTML = `Faltan poquitos para completar los 12-13 participantes. Resultados: <strong>lunes 16 de noviembre</strong>.`;
  }

  // Actualizar links del video de invitación
  const videoUrl = dbState.evento.video_invitacion_url || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const topLink = document.getElementById('videoInvitationTopLink');
  const resLink = document.getElementById('videoInvitationResultLink');
  if (topLink) topLink.href = videoUrl;
  if (resLink) resLink.href = videoUrl;
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
    token = `PIJAMA-${randomNum}`;
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
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) return digits;
  if (digits.length === 13 && digits.startsWith('521')) return '52' + digits.slice(3);
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

  // Verificar si ya se había registrado con el mismo nombre exacto
  const existing = dbState.participantes.find(
    p => normalizeName(p.nombre) === normalizeName(nombre)
  );
  if (existing) {
    // Actualizar sus preferencias y mostrarle su mismo token
    existing.talla = talla;
    existing.color_estampado = estampado;
    existing.contacto = contacto;
    existing.tipo_contacto = currentContactType;
    existing.actualizado_en = new Date().toISOString();
    lastRegisteredParticipant = existing;
    await saveDatabase();
    showTokenConfirmation(existing);
    showToast('Actualizamos tus datos y recuperamos tu Token.');
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
  lastRegisteredParticipant = newParticipant;

  // Si llegamos al máximo (13 personas) y aún no se ha hecho sorteo, realizarlo automáticamente
  if (
    dbState.participantes.length >= (dbState.evento.max_participantes || 13) &&
    !dbState.evento.sorteo_realizado
  ) {
    performDerangementDraw();
  }

  await saveDatabase();
  showTokenConfirmation(newParticipant);
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
  // Usamos emojis del plano BMP (✨, ⛄, ❄️, ⭐, ❤️, ✔️, ▶️) y api.whatsapp.com
  // para evitar el bug de wa.me en Windows/Web que reemplaza emojis de 4 bytes por ""
  const selfWaBtn = document.getElementById('saveTokenSelfWhatsappBtn');
  const msg =
    `✨ *Mi Registro al Intercambio de Pijamas Pachoncitas ($300 MXN)* ⛄\n\n` +
    `⭐ *Nombre:* ${participant.nombre}\n` +
    `✔️ *Mi Token Secreto:* ${participant.token}\n` +
    `➜ *Mi Talla:* ${participant.talla}\n` +
    `❤️ *Color/Estampado pedido:* ${participant.color_estampado}\n\n` +
    `❄️ *Consulta de resultados:* Lunes 16 de noviembre\n` +
    `▶️ *Sitio web:* ${window.location.href.split('#')[0]}\n` +
    `▶️ *Video de la invitación:* ${dbState.evento.video_invitacion_url}`;

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
// CONSULTA DE RESULTADOS CON NOMBRE + TOKEN (LUNES 16 DE NOVIEMBRE)
// ============================================================================
async function handleLookupSubmit(e) {
  e.preventDefault();
  await loadDatabase();

  const nombreInput = document.getElementById('lookupNombre').value.trim();
  const tokenInput = document.getElementById('lookupToken').value.trim().toUpperCase();

  const pendingBox = document.getElementById('lookupPendingNotice');
  const resultBox = document.getElementById('lookupResultContainer');
  pendingBox.classList.add('hidden');
  resultBox.classList.add('hidden');

  // Buscar por Token y verificar coincidencia de nombre (parcial o completo)
  const participant = dbState.participantes.find(p => {
    const sameToken = (p.token || '').toUpperCase() === tokenInput;
    const normRegistered = normalizeName(p.nombre);
    const normQuery = normalizeName(nombreInput);
    const nameMatches =
      normRegistered.includes(normQuery) || normQuery.includes(normRegistered);
    return sameToken && nameMatches;
  });

  if (!participant) {
    showToast('❌ No encontramos esa combinación de Nombre y Token. Revisa que estén bien escritos.');
    return;
  }

  // Verificar si ya se realizó el sorteo y tiene persona asignada
  if (!dbState.evento.sorteo_realizado || !participant.asignado_nombre) {
    document.getElementById('pendingUserName').textContent = participant.nombre;
    document.getElementById('pendingCountStatus').textContent =
      `van ${dbState.participantes.length} de ${dbState.evento.max_participantes || 13} registrados`;
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
  const videoUrl = dbState.evento.video_invitacion_url;
  const eventDateText = dbState.evento.fecha_evento_texto;
  const eventLocation = dbState.evento.lugar_evento;

  // 1. Mensaje de WhatsApp para enviarse a sí mismo como recordatorio
  const waText =
    `✨ *Recordatorio Secreto: Intercambio de Pijamas Pachoncitas* ⛄\n\n` +
    `Hola ${participant.nombre}, aquí tienes los datos de la persona que te tocó:\n` +
    `⭐ *Te toca regalarle a:* ${targetName}\n` +
    `➜ *Talla de su pijama:* ${targetSize}\n` +
    `❤️ *Color / Estampado favorito:* ${targetPattern}\n` +
    `✔️ *Presupuesto:* $300 MXN\n\n` +
    `❄️ *Fecha del evento:* ${eventDateText}\n` +
    `➜ *Lugar:* ${eventLocation}\n` +
    `▶️ *Video de la invitación:* ${videoUrl}`;

  const waBtn = document.getElementById('btnSelfWhatsappReminder');
  const phoneDigits = cleanPhone(participant.contacto);
  if (participant.tipo_contacto === 'whatsapp' && phoneDigits.length >= 10) {
    waBtn.href = `https://api.whatsapp.com/send?phone=${phoneDigits}&text=${encodeURIComponent(waText)}`;
  } else {
    waBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;
  }

  // 2. Enlace de Google Calendar
  const gcalTitle = `✨ Intercambio de Pijamas Pachoncitas ($300 MXN) - Regalo para ${targetName}`;
  const gcalDetails =
    `¡No olvides llevar la pijama pachoncita para tu intercambio!\n\n` +
    `⭐ Persona asignada: ${targetName}\n` +
    `➜ Talla: ${targetSize}\n` +
    `❤️ Color / Estampado favorito: ${targetPattern}\n` +
    `✔️ Presupuesto: $300 MXN\n` +
    `▶️ Video de la invitación: ${videoUrl}`;

  const startIso = (dbState.evento.fecha_evento_iso || '20261219T200000').replace(/[-:]/g, '');
  const endIso = (dbState.evento.fecha_evento_fin_iso || '20261219T235900').replace(/[-:]/g, '');

  const gcalUrl =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(gcalTitle)}` +
    `&dates=${startIso}/${endIso}` +
    `&details=${encodeURIComponent(gcalDetails)}` +
    `&location=${encodeURIComponent(eventLocation)}`;

  document.getElementById('btnGoogleCalendar').href = gcalUrl;

  // 3. Enlace de Correo Electrónico para sí mismo
  const mailSubject = `✨ Mi Intercambio de Pijamas Pachoncitas: Me tocó ${targetName}`;
  const mailTo = participant.tipo_contacto === 'email' ? participant.contacto : '';
  document.getElementById('btnSelfEmailReminder').href =
    `mailto:${mailTo}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(waText)}`;
}

// Descargar archivo .ics para Calendario de iPhone / Apple / Outlook
function downloadICSFile() {
  if (!currentLookupResult) return;
  const p = currentLookupResult;
  const startIso = (dbState.evento.fecha_evento_iso || '20261219T200000').replace(/[-:]/g, '');
  const endIso = (dbState.evento.fecha_evento_fin_iso || '20261219T235900').replace(/[-:]/g, '');

  const description =
    `Persona que te toco: ${p.asignado_nombre}\\n` +
    `Talla de pijama: ${p.asignado_talla}\\n` +
    `Color/Estampado favorito: ${p.asignado_color_estampado}\\n` +
    `Presupuesto: $300 MXN\\n` +
    `Video de invitacion: ${dbState.evento.video_invitacion_url}`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Intercambio Pijamas Pachoncitas//ES',
    'BEGIN:VEVENT',
    `UID:intercambio-pijamas-${p.token}@navidad`,
    `DTSTAMP:${startIso}Z`,
    `DTSTART:${startIso}`,
    `DTEND:${endIso}`,
    `SUMMARY:🎄 Intercambio de Pijamas Pachoncitas (Regalo para ${p.asignado_nombre})`,
    `DESCRIPTION:${description}`,
    `LOCATION:${dbState.evento.lugar_evento}`,
    'BEGIN:VALARM',
    'TRIGGER:-P2D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio: Comprar pijama pachoncita para el intercambio',
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

  // Crear copia de índices y mezclar con Fisher-Yates formando un solo ciclo cerrado
  // Así garantizamos matemáticamente que nadie se toque a sí mismo ni haya sub-ciclos aislados
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

function toggleAdminPanel() {
  const panel = document.getElementById('adminPanel');
  if (!adminUnlocked) {
    const pin = prompt('Ingresa el PIN de organizador:');
    if (pin !== (dbState.evento.admin_pin)) {
      showToast('No seas tramposo 😤 ');
      return;
    }
    adminUnlocked = true;
  }

  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('adminVideoUrl').value = dbState.evento.video_invitacion_url || '';
    document.getElementById('adminEventDateText').value = dbState.evento.fecha_evento_texto || '';
    document.getElementById('adminEventLocation').value = dbState.evento.lugar_evento || '';
    renderAdminList();
  }
}

async function runSecretSantaDraw() {
  if (dbState.participantes.length < 2) {
    showToast('Se necesitan al menos 2 participantes registrados para hacer el sorteo.');
    return;
  }
  performDerangementDraw();
  await saveDatabase();
  showToast(`🎉 ¡Sorteo realizado con éxito entre ${dbState.participantes.length} participantes!`);
}

async function saveEventSettings() {
  dbState.evento.video_invitacion_url = document.getElementById('adminVideoUrl').value.trim();
  dbState.evento.fecha_evento_texto = document.getElementById('adminEventDateText').value.trim();
  dbState.evento.lugar_evento = document.getElementById('adminEventLocation').value.trim();
  await saveDatabase();
  showToast('Configuración del evento guardada');
}

function renderAdminList() {
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
        ? `✨ ¡Hola ${p.nombre}! Ya quedó listo el sorteo de nuestro *Intercambio de Pijamas Pachoncitas ($300 MXN)* ⛄\n\n` +
          `✔️ *Tu Token:* ${p.token}\n` +
          `⭐ *Te toca regalarle a:* *${p.asignado_nombre}*\n` +
          `➜ *Talla:* ${p.asignado_talla}\n` +
          `❤️ *Color/Estampado favorito:* ${p.asignado_color_estampado}\n\n` +
          `▶️ *Video de la invitación:* ${dbState.evento.video_invitacion_url}\n` +
          `❄️ *Consulta tu recordatorio y agrégalo a tu calendario aquí:* ${window.location.href.split('#')[0]}`
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
  dbState.participantes = dbState.participantes.filter(p => p.id !== id);
  await saveDatabase();
}

function downloadDatabaseJSON() {
  const jsonStr = JSON.stringify(dbState, null, 2);
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

async function loadDemoParticipants() {
  const demoNames = [
    ['María Bastida', 'M', 'Cuadros navideños rojos y blanco', '5512345601'],
    ['Carlos Hernández', 'G (L)', 'Verde pino liso de polar pachoncito', '5512345602'],
    ['Fernanda López', 'CH (S)', 'Ositos polares o copos de nieve', '5512345603'],
    ['Alejandro Ruiz', 'XG (XL)', 'Azul marino con estrellas', '5512345604'],
    ['Valeria Gómez', 'M', 'Estampado del Grinch o Snoopy navideño', '5512345605'],
    ['Diego Morales', 'G (L)', 'Cuadros escoceses rojo con negro', '5512345606'],
    ['Sofía Torres', 'CH (S)', 'Rosa pastel o crema ultra suave', '5512345607'],
    ['Jorge Ramírez', 'G (L)', 'Gris oxford afelpado calientito', '5512345608'],
    ['Daniela Castro', 'M', 'Renos navideños y galletas de jengibre', '5512345609'],
    ['Ricardo Vargas', 'M', 'Vino tinto polar con borreguito', '5512345610'],
    ['Mariana Silva', 'CH (S)', 'Pingüinos o muñecos de nieve', '5512345611'],
    ['Luis Mendoza', 'XG (XL)', 'Verde bosque con cuadros clásicos', '5512345612']
  ];

  dbState.participantes = demoNames.map((item, idx) => ({
    id: `DEMO-${idx + 1}`,
    nombre: item[0],
    talla: item[1],
    color_estampado: item[2],
    tipo_contacto: 'whatsapp',
    contacto: item[3],
    token: `PIJAMA-${1001 + idx}`,
    fecha_registro: new Date().toISOString(),
    asignado_id: null,
    asignado_nombre: null,
    asignado_talla: null,
    asignado_color_estampado: null
  }));

  performDerangementDraw();
  await saveDatabase();
  showToast('🧪 12 participantes de prueba cargados y sorteo listo.');
}

async function clearAllParticipants() {
  if (!confirm('¿Estás segura de que quieres borrar TODOS los participantes (incluidos los de prueba) y reiniciar la lista a 0?')) {
    return;
  }
  dbState.participantes = [];
  dbState.evento.sorteo_realizado = false;
  dbState.evento.fecha_sorteo = null;
  localStorage.removeItem(STORAGE_KEY);
  await saveDatabase();
  showToast('🗑️ Se borraron todos los participantes. Lista en 0 de 13.');
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
