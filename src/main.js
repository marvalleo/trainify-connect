import { supabase } from './supabase.js';
import * as admin from './admin.js';

// --- DATA INICIAL (Fallback) ---
const defaultExercises = {
    "1": [{ id: 1, name: "Press Declinado" }],
};
const initialRecords = {};

let currentCategory = null;
let categories = [];
let exercises = {};
let records = {};
let isAdmin = false;
let adminClicks = 0;

// --- INICIALIZACIÓN SEGURA ---
window.initApp = async function () {
    let fingerprint = localStorage.getItem('trainify_device_id');
    if (!fingerprint) {
        fingerprint = 'dev-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('trainify_device_id', fingerprint);
    }

    // 1. Cargar Categorías Dinámicas
    await loadCategories();

    // 2. Cargar Datos Locales
    exercises = JSON.parse(localStorage.getItem('trainify_exercises')) || defaultExercises;
    records = JSON.parse(localStorage.getItem('trainify_records')) || initialRecords;

    // 3. Sincronizar con la nube
    await loadFromCloudSupabase();

    renderExercises();
}

window.checkAdminAccess = function () {
    adminClicks++;
    if (adminClicks >= 5) {
        isAdmin = !isAdmin;
        adminClicks = 0;
        document.getElementById('admin-panel').classList.toggle('hidden', !isAdmin);
        document.getElementById('admin-indicator').classList.toggle('hidden', !isAdmin);
        if (isAdmin) renderAdminPanel();
    }
}

async function loadCategories() {
    try {
        const { data, error } = await supabase.from('categories').select('*').order('display_order');
        if (data && data.length > 0) {
            categories = data;
            if (!currentCategory) currentCategory = categories[0].id;
        }
    } catch (e) {
        console.error('Error cargando categorías:', e);
        categories = [{ id: 1, name: 'General' }];
        currentCategory = 1;
    }
}

function renderTabs() {
    const container = document.getElementById('category-tabs');
    if (!container) return;
    container.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.onclick = () => changeCategory(cat.id);
        btn.className = `nav-tab px-4 py-2 rounded-lg bg-slate-800 text-sm whitespace-nowrap ${currentCategory === cat.id ? 'active' : ''}`;
        btn.textContent = cat.name;
        container.appendChild(btn);
    });
}

window.changeCategory = function (catId) {
    currentCategory = catId;
    renderExercises();
}

async function renderAdminPanel() {
    const list = document.getElementById('admin-category-list');
    const select = document.getElementById('admin-master-ex-cat');
    if (!list || !select) return;

    list.innerHTML = '';
    select.innerHTML = '';

    const cats = await admin.admin_loadCategories();
    if (cats) {
        cats.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-800';
            item.innerHTML = `
                <span class="text-sm font-medium">${cat.name}</span>
                <div class="flex gap-2 text-xs">
                    <button onclick="deleteCategory(${cat.id})" class="text-red-400 p-1"><i class="fas fa-trash"></i></button>
                </div>
            `;
            list.appendChild(item);

            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            select.appendChild(opt);
        });
    }
    renderAdminMasterExercises();
}

window.renderAdminMasterExercises = async function () {
    const selector = document.getElementById('admin-master-ex-cat');
    if (!selector) return;
    const catId = selector.value;
    const list = document.getElementById('admin-master-ex-list');
    if (!list || !catId) return;
    list.innerHTML = '<p class="text-[10px] text-center text-slate-500 animate-pulse">Cargando...</p>';

    const exs = await admin.admin_loadMasterExercises(catId);
    list.innerHTML = '';
    if (exs) {
        exs.forEach(ex => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-slate-900/30 p-2 rounded border border-slate-800/50';
            item.innerHTML = `
                <div class="flex flex-col text-left">
                    <span class="text-xs font-bold">${ex.name}</span>
                    ${ex.coach_note ? `<span class="text-[9px] text-yellow-500/70 italic">${ex.coach_note}</span>` : ''}
                </div>
                <button onclick="deleteMasterExercise(${ex.id})" class="text-red-400 text-xs p-1"><i class="fas fa-times"></i></button>
            `;
            list.appendChild(item);
        });
    }
}

window.addNewMasterExercise = async function () {
    const name = document.getElementById('master-ex-name').value.trim();
    const note = document.getElementById('master-ex-note').value.trim();
    const catId = document.getElementById('admin-master-ex-cat').value;

    if (name && catId) {
        const success = await admin.admin_saveMasterExercise(name, catId, note);
        if (success) {
            document.getElementById('master-ex-name').value = '';
            document.getElementById('master-ex-note').value = '';
            renderAdminMasterExercises();
        }
    }
}

window.deleteMasterExercise = async function (id) {
    if (confirm('¿Borrar este ejercicio de la lista maestra?')) {
        const success = await admin.admin_deleteMasterExercise(id);
        if (success) renderAdminMasterExercises();
    }
}

window.addNewCategory = async function () {
    const input = document.getElementById('new-cat-name');
    const name = input.value.trim();
    if (name) {
        const success = await admin.admin_saveCategory(name, categories.length + 1);
        if (success) {
            input.value = '';
            await loadCategories();
            renderAdminPanel();
            renderExercises();
        }
    }
}

window.deleteCategory = async function (id) {
    if (confirm('¿Borrar esta categoría?')) {
        const success = await admin.admin_deleteCategory(id);
        if (success) {
            await loadCategories();
            if (currentCategory === id) currentCategory = categories.length > 0 ? categories[0].id : null;
            renderAdminPanel();
            renderExercises();
        }
    }
}

// --- FUNCIONES CORE ---
window.renderExercises = function () {
    renderTabs();
    const container = document.getElementById('exercise-list');
    if (!container) return;
    container.innerHTML = '';
    const today = new Date().toLocaleDateString('sv-SE');
    if (!currentCategory || !exercises[currentCategory]) {
        if (currentCategory) exercises[currentCategory] = [];
        else return;
    }

    exercises[currentCategory].forEach(ex => {
        // ... (resto del código de renderizado igual)
        const history = records[ex.id] || [];
        const last = history[history.length - 1] || { kg: '', reps: '', date: '' };
        const setsToday = history.filter(r => r.date === today).length;

        const card = document.createElement('div');
        card.className = `card-gradient p-4 rounded-xl border ${setsToday > 0 ? 'border-green-500/30' : 'border-slate-700'} animate-fadeIn relative`;

        let seriesHTML = '';
        const historyWithIndices = history.map((r, idx) => ({ ...r, absIdx: idx }));
        const todayRecords = historyWithIndices.filter(r => r.date === today);

        for (let i = 1; i <= 4; i++) {
            const active = i <= setsToday;
            const record = todayRecords[i - 1];
            const recordIndex = record ? record.absIdx : -1;
            const hasNote = record && record.note;

            seriesHTML += `
                <div ${active ? `onclick="editNote(${ex.id}, ${recordIndex})"` : ''} 
                    class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border 
                    ${active ? 'cursor-pointer bg-green-500 border-green-400 text-slate-900 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'border-slate-700 text-slate-500'} 
                    ${hasNote ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900' : ''}
                    transition-all duration-300">
                    ${i}
                </div>
            `;
        }

        card.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <div>
                    <h3 class="font-bold text-lg text-slate-100">${ex.name}</h3>
                    <div class="flex gap-1.5 mt-2">
                        ${seriesHTML}
                        ${setsToday > 4 ? `<span class="text-green-500 text-[10px] self-center ml-1">+${setsToday - 4}</span>` : ''}
                    </div>
                </div>
                <div class="flex gap-1">
                    <button onclick="triggerPhoto(${ex.id})" class="text-slate-400 p-2 hover:text-purple-400 transition-colors" title="Subir foto de la máquina"><i class="fas fa-camera"></i></button>
                    <button onclick="toggleChart(${ex.id})" class="text-blue-400 p-2"><i class="fas fa-chart-area"></i></button>
                    <button onclick="deleteExercise('${currentCategory}', ${ex.id})" class="text-slate-600 p-2"><i class="fas fa-trash"></i></button>
                </div>
            </div>

            ${ex.coachNote ? `
            <div class="mt-3 p-3 bg-yellow-500/10 border-l-4 border-yellow-500 rounded-r-lg animate-fadeIn">
                <p class="text-[10px] font-black text-yellow-500 uppercase tracking-widest mb-1"><i class="fas fa-exclamation-triangle mr-1"></i> Instrucción Técnica</p>
                <p class="text-xs text-yellow-100/80 italic">"${ex.coachNote}"</p>
            </div>` : ''}
            
            <div class="flex items-center gap-2 mb-3 mt-3">
                <span onclick="copyLastRecord(${ex.id})" title="Copiar valores anteriores" class="text-[10px] text-slate-500 uppercase tracking-tighter cursor-pointer hover:text-blue-400 transition-colors">
                    ${last.date ? `<i class="fas fa-calendar-day mr-1"></i>Último: ${last.date} (${last.kg}kg x ${last.reps}) <i class="fas fa-copy ml-1"></i>` : 'Sin registros'}
                </span>
            </div>

            <input type="file" id="photo-input-${ex.id}" class="hidden" accept="image/*" onchange="savePhoto(event, ${ex.id})">

            ${exercises.photos && exercises.photos[ex.id] ? `
            <div class="mb-4 rounded-xl overflow-hidden border border-slate-700 aspect-video relative group animate-fadeIn shadow-2xl">
                <img src="${exercises.photos[ex.id]}" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent opacity-0 group-hover:opacity-100 flex items-end justify-center p-4 transition-opacity">
                    <button onclick="triggerPhoto(${ex.id})" class="text-white text-[9px] bg-slate-800/90 backdrop-blur-md border border-slate-600 px-4 py-2 rounded-full uppercase font-black tracking-tighter">Actualizar Foto de Máquina</button>
                </div>
            </div>` : ''}

            <div id="chart-container-${ex.id}" class="hidden mb-4 bg-slate-900/50 p-4 rounded-lg space-y-6">
                <div>
                    <p class="text-[10px] text-blue-400 font-bold mb-2 uppercase tracking-widest text-center">Progreso de Carga (Kg)</p>
                    <canvas id="chart-${ex.id}"></canvas>
                </div>
                <div class="pt-4 border-t border-slate-800">
                    <p class="text-[10px] text-purple-400 font-bold mb-2 uppercase tracking-widest text-center">Volumen de Trabajo (Kg × Reps)</p>
                    <canvas id="chart-vol-${ex.id}"></canvas>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="relative">
                    <label class="block text-[10px] text-slate-500 mb-1 ml-1 uppercase">Kilos</label>
                    <input type="number" id="kg-${ex.id}" placeholder="${last.kg || '---'}" class="w-full p-2 rounded input-log font-bold text-blue-400 placeholder-slate-600">
                </div>
                <div class="relative">
                    <label class="block text-[10px] text-slate-500 mb-1 ml-1 uppercase">Reps</label>
                    <input type="number" id="reps-${ex.id}" placeholder="${last.reps || '---'}" class="w-full p-2 rounded input-log placeholder-slate-600">
                </div>
            </div>
            
            <button onclick="saveSet(${ex.id})" class="w-full mt-3 py-3 ${setsToday > 0 ? 'bg-green-900/20 text-green-400 border border-green-500/20' : 'bg-slate-800'} rounded-lg text-xs uppercase font-black tracking-widest hover:bg-blue-600 active:scale-95 transition-all">
                ${setsToday > 0 ? `Registrar Serie ${setsToday + 1}` : 'Registrar Entrenamiento'}
            </button>
        `;
        container.appendChild(card);
    });
}

window.saveSet = function (id) {
    const kgInput = document.getElementById(`kg-${id}`);
    const repsInput = document.getElementById(`reps-${id}`);

    let kg = parseFloat(kgInput.value);
    let reps = parseFloat(repsInput.value);

    if (isNaN(kg) || isNaN(reps)) {
        const history = records[id] || [];
        const last = history[history.length - 1];

        if (last) {
            if (isNaN(kg)) kg = last.kg;
            if (isNaN(reps)) reps = last.reps;
        } else {
            alert("Por favor completa Kilos y Reps.");
            return;
        }
    }

    if (!records[id]) records[id] = [];

    records[id].push({
        kg: kg,
        reps: reps,
        date: new Date().toLocaleDateString('sv-SE'),
        note: ""
    });

    localStorage.setItem('trainify_records', JSON.stringify(records));
    kgInput.value = '';
    repsInput.value = '';
    renderExercises();
    startTimer(90);
    autoSync();
}

window.copyLastRecord = function (id) {
    const history = records[id] || [];
    const last = history[history.length - 1];
    if (last) {
        document.getElementById(`kg-${id}`).value = last.kg;
        document.getElementById(`reps-${id}`).value = last.reps;
    }
}

window.editNote = function (id, index) {
    const history = records[id] || [];
    const record = history[index];
    if (!record) return;

    const newNote = prompt("Nota de la serie:", record.note || "");
    if (newNote !== null) {
        record.note = newNote;
        localStorage.setItem('trainify_records', JSON.stringify(records));
        renderExercises();
        autoSyncSupabase();
    }
}

window.triggerPhoto = function (id) {
    const input = document.getElementById(`photo-input-${id}`);
    if (input) input.click();
}

window.savePhoto = function (event, id) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        if (!exercises.photos) exercises.photos = {};
        exercises.photos[id] = e.target.result;
        localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
        renderExercises();
    };
    reader.readAsDataURL(file);
}

window.toggleChart = function (id) {
    const container = document.getElementById(`chart-container-${id}`);
    const isHidden = container.classList.toggle('hidden');

    if (!isHidden) {
        const data = records[id] || [];
        const dateCounts = {};
        const labels = data.map(d => {
            dateCounts[d.date] = (dateCounts[d.date] || 0) + 1;
            const parts = d.date.split('-');
            const shortDate = parts.length > 2 ? `${parts[2]}/${parts[1]}` : d.date;
            return `${shortDate} S${dateCounts[d.date]}`;
        });

        const ctxKg = document.getElementById(`chart-${id}`).getContext('2d');
        if (window[`chart_kg_${id}`]) window[`chart_kg_${id}`].destroy();
        window[`chart_kg_${id}`] = new Chart(ctxKg, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Kg',
                    data: data.map(d => d.kg),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', font: { size: 9 } } },
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 8 } } }
                }
            }
        });

        const ctxVol = document.getElementById(`chart-vol-${id}`).getContext('2d');
        if (window[`chart_vol_${id}`]) window[`chart_vol_${id}`].destroy();
        window[`chart_vol_${id}`] = new Chart(ctxVol, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volumen',
                    data: data.map(d => d.kg * (parseFloat(d.reps) || 0)),
                    backgroundColor: 'rgba(168, 85, 247, 0.5)',
                    borderColor: '#a855f7',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', font: { size: 9 } } },
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 8 } } }
                }
            }
        });
    }
}

window.changeCategory = function (cat) { currentCategory = cat; renderExercises(); }

window.addExercise = function () {
    const name = document.getElementById('new-ex-name').value;
    const cat = document.getElementById('new-ex-cat').value;
    if (!name) return;
    exercises[cat].push({ id: Date.now(), name: name });
    localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
    document.getElementById('new-ex-name').value = '';
    renderExercises();
}

window.deleteExercise = function (cat, id) {
    if (!confirm("¿Borrar este ejercicio?")) return;
    exercises[cat] = exercises[cat].filter(ex => ex.id !== id);
    delete records[id];
    localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
    localStorage.setItem('trainify_records', JSON.stringify(records));
    renderExercises();
}

window.exportData = function () {
    const data = { exercises, records };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trainify_backup.json`;
    a.click();
}

window.importData = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = JSON.parse(e.target.result);
        exercises = data.exercises;
        records = data.records;
        localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
        localStorage.setItem('trainify_records', JSON.stringify(records));
        location.reload();
    };
    reader.readAsText(file);
}

window.calculateMacros = function () {
    const wInput = document.getElementById('user-weight');
    const gInput = document.getElementById('user-goal');
    if (!wInput || !gInput) return;
    const w = parseFloat(wInput.value);
    const g = gInput.value;
    if (!w) return;
    let k = w * 30;
    if (g === 'cut') k -= 400; if (g === 'bulk') k += 300;
    const p = w * 2.2; const f = w * 0.8;
    const res = document.getElementById('macro-results');
    res.classList.remove('hidden');
    res.innerHTML = `
        <div class="card-gradient p-4 rounded-xl border border-slate-700 col-span-2 text-center animate-fadeIn">
            <p class="text-[10px] text-slate-400">TOTAL CALORÍAS</p>
            <p class="text-3xl font-black text-blue-400">${Math.round(k)}</p>
        </div>
        <div class="card-gradient p-4 rounded-xl border border-slate-700 text-center animate-fadeIn">
            <p class="text-[10px] text-slate-400">PROT (G)</p>
            <p class="text-xl font-bold text-green-400">${Math.round(p)}</p>
        </div>
        <div class="card-gradient p-4 rounded-xl border border-slate-700 text-center animate-fadeIn">
            <p class="text-[10px] text-slate-400">GRASA (G)</p>
            <p class="text-xl font-bold text-yellow-400">${Math.round(f)}</p>
        </div>
    `;
}

let timerInt;
window.startTimer = function (s) {
    const box = document.getElementById('timer-box');
    const disp = document.getElementById('timer-display');
    if (!box || !disp) return;
    box.classList.remove('hidden');
    let t = s; clearInterval(timerInt);
    timerInt = setInterval(() => {
        let mins = Math.floor(t / 60); let secs = t % 60;
        disp.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        if (t-- <= 0) { clearInterval(timerInt); box.classList.add('hidden'); }
    }, 1000);
}

window.toggleTimer = function () {
    const box = document.getElementById('timer-box');
    if (box && !box.classList.contains('hidden')) box.classList.add('hidden'); else startTimer(90);
}

window.switchTab = function (tab) {
    ['workout', 'nutrition', 'config'].forEach(t => {
        const view = document.getElementById(`view-${t}`);
        const nav = document.getElementById(`nav-${t}`);
        if (view) view.classList.toggle('hidden', t !== tab);
        if (nav) nav.classList.toggle('text-blue-500', t === tab);
    });
}

window.resetApp = function () { if (confirm("¿Borrar todo?")) { localStorage.clear(); location.reload(); } }

// --- GOOGLE DRIVE SYNC ---
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '417195775471-vv2fo942f097s7stturpfjr2qkklp76e.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient;
let accessToken = null;

window.initGoogleTokenClient = function () {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                const loginBtn = document.getElementById('btn-login');
                const userInfo = document.getElementById('user-info');
                if (loginBtn) loginBtn.classList.add('hidden');
                if (userInfo) userInfo.classList.remove('hidden');
                updateCloudStatus('online');
                autoSync();
            }
        },
    });
}

window.handleAuthClick = function () {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' });
}

window.handleSignoutClick = function () {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken, () => {
            accessToken = null;
            const loginBtn = document.getElementById('btn-login');
            const userInfo = document.getElementById('user-info');
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userInfo) userInfo.classList.add('hidden');
            updateCloudStatus('offline');
        });
    }
}

function updateCloudStatus(status) {
    const icon = document.getElementById('cloud-status');
    if (!icon) return;
    if (status === 'online') {
        icon.className = 'text-green-500';
        icon.innerHTML = '<i class="fas fa-cloud"></i>';
    } else if (status === 'syncing') {
        icon.className = 'text-blue-400 animate-pulse';
        icon.innerHTML = '<i class="fas fa-cloud-upload-alt"></i>';
    } else {
        icon.className = 'text-slate-600';
        icon.innerHTML = '<i class="fas fa-cloud"></i>';
    }
}

window.autoSync = async function () {
    if (!accessToken) return;
    updateCloudStatus('syncing');
    try {
        let folderId = localStorage.getItem('trainify_cloud_folder_id');
        if (!folderId) {
            folderId = await findOrCreateFolder('Trainify Connect Data');
            localStorage.setItem('trainify_cloud_folder_id', folderId);
        }

        let fileId = localStorage.getItem('trainify_cloud_file_id');
        if (!fileId) {
            fileId = await findOrCreateFile('trainify_records.json', folderId);
            localStorage.setItem('trainify_cloud_file_id', fileId);
        }

        await uploadData(fileId);
        updateCloudStatus('online');
    } catch (error) {
        console.error('Error en sync:', error);
        updateCloudStatus('offline');
    }
}

async function findOrCreateFolder(name) {
    const query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const result = await response.json();
    if (result.files && result.files.length > 0) return result.files[0].id;

    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder' })
    });
    const folder = await createResp.json();
    return folder.id;
}

async function findOrCreateFile(name, folderId) {
    const query = `name = '${name}' and '${folderId}' in parents and trashed = false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const result = await response.json();
    if (result.files && result.files.length > 0) return result.files[0].id;

    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, parents: [folderId] })
    });
    const file = await createResp.json();
    return file.id;
}

async function uploadData(fileId) {
    const data = { exercises, records };
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(data)
    });
}

window.loadFromCloud = async function () {
    if (!accessToken) return;
    updateCloudStatus('syncing');
    try {
        let fileId = localStorage.getItem('trainify_cloud_file_id');
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (data && data.exercises && data.records) {
            if (confirm("¿Cargar respaldo de la nube?")) {
                exercises = data.exercises;
                records = data.records;
                localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
                localStorage.setItem('trainify_records', JSON.stringify(records));
                location.reload();
            }
        }
        updateCloudStatus('online');
    } catch (error) {
        console.error('Error al descargar:', error);
        updateCloudStatus('offline');
    }
}

// --- SUPABASE SYNC ---
window.loadFromCloudSupabase = async function () {
    const fingerprint = localStorage.getItem('trainify_device_id');
    try {
        const { data, error } = await supabase
            .from('user_data')
            .select('exercises, records')
            .eq('device_id', fingerprint)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('No cloud data for this device yet.');
                return;
            }
            throw error;
        }

        if (data) {
            exercises = data.exercises || exercises;
            records = data.records || records;
            localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
            localStorage.setItem('trainify_records', JSON.stringify(records));
        }
    } catch (err) {
        console.error('Error loading from Supabase:', err);
    }
}

window.autoSyncSupabase = async function () {
    const fingerprint = localStorage.getItem('trainify_device_id');
    updateCloudStatus('syncing');
    try {
        const { error } = await supabase
            .from('user_data')
            .upsert({
                device_id: fingerprint,
                exercises,
                records,
                updated_at: new Date().toISOString()
            }, { onConflict: 'device_id' });

        if (error) throw error;
        updateCloudStatus('online');
    } catch (err) {
        console.error('Error syncing to Supabase:', err);
        updateCloudStatus('offline');
    }
}

window.syncToCloud = function () {
    autoSync();         // Google Drive
    autoSyncSupabase(); // Supabase
}

document.addEventListener('DOMContentLoaded', initApp);
import './style.css';
