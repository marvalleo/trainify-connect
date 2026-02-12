// --- DATA INICIAL ---
const defaultExercises = {
    superior: [
        { id: 1, name: "Press Declinado", coachNote: "Mantener escápulas retraídas y codos a 45°." }, { id: 2, name: "Tríceps Polea Alta" },
        { id: 3, name: "Tríceps sobre cabeza" }, { id: 4, name: "Press Banca Plana", coachNote: "No despegar los pies del suelo, máxima estabilidad." },
        { id: 5, name: "Banca Plana Mancuernas" }, { id: 6, name: "Pec Fly" },
        { id: 7, name: "Mancuernas Lat" }
    ],
    inferior: [
        { id: 100, name: "Sentadillas", coachNote: "Profundidad máxima sin perder la curvatura lumbar." }, { id: 101, name: "Prensa 45°" },
        { id: 102, name: "Abductores" }, { id: 103, name: "Aductores" },
        { id: 104, name: "Cuádriceps Sentado" }, { id: 105, name: "Curl Femoral" }
    ],
    espalda: [
        { id: 200, name: "Pull Down", coachNote: "Tracciona con los codos, no con las manos." }, { id: 201, name: "Remo" },
        { id: 202, name: "Face Pull" }, { id: 203, name: "Disco (Hombro)" },
        { id: 204, name: "Press Militar" }
    ]
};

const initialRecords = {
    "1": [{ kg: 45, reps: 8, date: "2024-05-01" }],
    "2": [{ kg: 40, reps: 10, date: "2024-05-01" }],
    "3": [{ kg: 35, reps: 12, date: "2024-05-01" }],
    "4": [{ kg: 30, reps: 8, date: "2024-05-01" }],
    "5": [{ kg: 30, reps: 12, date: "2024-05-01" }],
    "6": [{ kg: 55, reps: 8, date: "2024-05-01" }],
    "7": [{ kg: 12.5, reps: 8, date: "2024-05-01" }],
    "100": [{ kg: 55, reps: 8, date: "2024-05-01" }],
    "101": [{ kg: 130, reps: 8, date: "2024-05-01" }],
    "102": [{ kg: 40, reps: 10, date: "2024-05-01" }],
    "103": [{ kg: 25, reps: 10, date: "2024-05-01" }],
    "104": [{ kg: 80, reps: 10, date: "2024-05-01" }],
    "105": [{ kg: 80, reps: 8, date: "2024-05-01" }],
    "200": [{ kg: 50, reps: 12, date: "2024-05-01" }],
    "201": [{ kg: 45, reps: 8, date: "2024-05-01" }],
    "202": [{ kg: 50, reps: 8, date: "2024-05-01" }],
    "203": [{ kg: 10, reps: 10, date: "2024-05-01" }],
    "204": [{ kg: 10, reps: 12, date: "2024-05-01" }]
};

let currentCategory = 'superior';
let exercises, records;

// --- INICIALIZACIÓN SEGURA ---
window.initApp = function () {
    let fingerprint = localStorage.getItem('trainify_device_id');
    if (!fingerprint) {
        fingerprint = 'dev-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('trainify_device_id', fingerprint);
        console.log("New device registered:", fingerprint);
    }

    exercises = JSON.parse(localStorage.getItem('trainify_exercises')) || defaultExercises;
    records = JSON.parse(localStorage.getItem('trainify_records')) || initialRecords;
    renderExercises();
}

// --- FUNCIONES CORE ---
window.renderExercises = function () {
    const tabs = document.querySelectorAll('.nav-tab');
    if (tabs.length > 0) {
        tabs.forEach(t => t.classList.remove('active'));
        const activeTab = document.getElementById(`tab-${currentCategory}`);
        if (activeTab) activeTab.classList.add('active');
    }

    const container = document.getElementById('exercise-list');
    if (!container) return;
    container.innerHTML = '';

    const today = new Date().toLocaleDateString('sv-SE');

    exercises[currentCategory].forEach(ex => {
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
                        ${setsToday > 4 ?\`<span class="text-green-500 text-[10px] self-center ml-1">+\${setsToday - 4}</span>\` : ''}
                    </div>
                </div>
                <div class="flex gap-1">
                    <button onclick="triggerPhoto(\${ex.id})" class="text-slate-400 p-2 hover:text-purple-400 transition-colors" title="Subir foto de la máquina"><i class="fas fa-camera"></i></button>
                    <button onclick="toggleChart(\${ex.id})" class="text-blue-400 p-2"><i class="fas fa-chart-area"></i></button>
                    <button onclick="deleteExercise('\${currentCategory}', \${ex.id})" class="text-slate-600 p-2"><i class="fas fa-trash"></i></button>
                </div>
            </div>

            \${ex.coachNote ? \`
            <div class="mt-3 p-3 bg-yellow-500/10 border-l-4 border-yellow-500 rounded-r-lg animate-fadeIn">
                <p class="text-[10px] font-black text-yellow-500 uppercase tracking-widest mb-1"><i class="fas fa-exclamation-triangle mr-1"></i> Instrucción Técnica</p>
                <p class="text-xs text-yellow-100/80 italic">"\${ex.coachNote}"</p>
            </div>\` : ''}
            
            <div class="flex items-center gap-2 mb-3 mt-3">
                <span onclick="copyLastRecord(\${ex.id})" title="Copiar valores anteriores" class="text-[10px] text-slate-500 uppercase tracking-tighter cursor-pointer hover:text-blue-400 transition-colors">
                    \${last.date ? \`<i class="fas fa-calendar-day mr-1"></i>Último: \${last.date} (\${last.kg}kg x \${last.reps}) <i class="fas fa-copy ml-1"></i>\` : 'Sin registros'}
                </span>
            </div>

            <input type="file" id="photo-input-\${ex.id}" class="hidden" accept="image/*" onchange="savePhoto(event, \${ex.id})">

            \${exercises.photos && exercises.photos[ex.id] ? \`
            <div class="mb-4 rounded-xl overflow-hidden border border-slate-700 aspect-video relative group animate-fadeIn shadow-2xl">
                <img src="\${exercises.photos[ex.id]}" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent opacity-0 group-hover:opacity-100 flex items-end justify-center p-4 transition-opacity">
                    <button onclick="triggerPhoto(\${ex.id})" class="text-white text-[9px] bg-slate-800/90 backdrop-blur-md border border-slate-600 px-4 py-2 rounded-full uppercase font-black tracking-tighter">Actualizar Foto de Máquina</button>
                </div>
            </div>\` : ''}

            <div id="chart-container-\${ex.id}" class="hidden mb-4 bg-slate-900/50 p-4 rounded-lg space-y-6">
                <div>
                    <p class="text-[10px] text-blue-400 font-bold mb-2 uppercase tracking-widest text-center">Progreso de Carga (Kg)</p>
                    <canvas id="chart-\${ex.id}"></canvas>
                </div>
                <div class="pt-4 border-t border-slate-800">
                    <p class="text-[10px] text-purple-400 font-bold mb-2 uppercase tracking-widest text-center">Volumen de Trabajo (Kg × Reps)</p>
                    <canvas id="chart-vol-\${ex.id}"></canvas>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="relative">
                    <label class="block text-[10px] text-slate-500 mb-1 ml-1 uppercase">Kilos</label>
                    <input type="number" id="kg-\${ex.id}" placeholder="\${last.kg || '---'}" class="w-full p-2 rounded input-log font-bold text-blue-400 placeholder-slate-600">
                </div>
                <div class="relative">
                    <label class="block text-[10px] text-slate-500 mb-1 ml-1 uppercase">Reps</label>
                    <input type="number" id="reps-\${ex.id}" placeholder="\${last.reps || '---'}" class="w-full p-2 rounded input-log placeholder-slate-600">
                </div>
            </div>
            
            <button onclick="saveSet(\${ex.id})" class="w-full mt-3 py-3 \${setsToday > 0 ? 'bg-green-900/20 text-green-400 border border-green-500/20' : 'bg-slate-800'} rounded-lg text-xs uppercase font-black tracking-widest hover:bg-blue-600 active:scale-95 transition-all">
                \${setsToday > 0 ? \`Registrar Serie \${setsToday + 1}\` : 'Registrar Entrenamiento'}
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
        autoSync();
    }
}

window.triggerPhoto = function (id) {
    document.getElementById(`photo-input-${id}`).click();
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
            const shortDate = parts.length > 2 ? `\${parts[2]}/\${parts[1]}` : d.date;
            return `\${shortDate} S\${dateCounts[d.date]}`;
        });

        const ctxKg = document.getElementById(`chart-\${id}`).getContext('2d');
        if (window[\`chart_kg_\${id}\`]) window[\`chart_kg_\${id}\`].destroy();
        window[\`chart_kg_\${id}\`] = new Chart(ctxKg, {
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

        const ctxVol = document.getElementById(`chart - vol -\${ id } `).getContext('2d');
        if (window[\`chart_vol_\${id}\`]) window[\`chart_vol_\${id}\`].destroy();
        window[\`chart_vol_\${id}\`] = new Chart(ctxVol, {
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

window.changeCategory = function(cat) { currentCategory = cat; renderExercises(); }

window.addExercise = function() {
    const name = document.getElementById('new-ex-name').value;
    const cat = document.getElementById('new-ex-cat').value;
    if (!name) return;
    exercises[cat].push({ id: Date.now(), name: name });
    localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
    document.getElementById('new-ex-name').value = '';
    renderExercises();
}

window.deleteExercise = function(cat, id) {
    if (!confirm("¿Borrar este ejercicio?")) return;
    exercises[cat] = exercises[cat].filter(ex => ex.id !== id);
    delete records[id];
    localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
    localStorage.setItem('trainify_records', JSON.stringify(records));
    renderExercises();
}

window.exportData = function() {
    const data = { exercises, records };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = \`trainify_backup.json\`;
    a.click();
}

window.importData = function(event) {
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

window.calculateMacros = function() {
    const w = parseFloat(document.getElementById('user-weight').value);
    const g = document.getElementById('user-goal').value;
    if (!w) return;
    let k = w * 30;
    if (g === 'cut') k -= 400; if (g === 'bulk') k += 300;
    const p = w * 2.2; const f = w * 0.8;
    const res = document.getElementById('macro-results');
    res.classList.remove('hidden');
    res.innerHTML = \`
        <div class="card-gradient p-4 rounded-xl border border-slate-700 col-span-2 text-center animate-fadeIn">
            <p class="text-[10px] text-slate-400">TOTAL CALORÍAS</p>
            <p class="text-3xl font-black text-blue-400">\${Math.round(k)}</p>
        </div>
        <div class="card-gradient p-4 rounded-xl border border-slate-700 text-center animate-fadeIn">
            <p class="text-[10px] text-slate-400">PROT (G)</p>
            <p class="text-xl font-bold text-green-400">\${Math.round(p)}</p>
        </div>
        <div class="card-gradient p-4 rounded-xl border border-slate-700 text-center animate-fadeIn">
            <p class="text-[10px] text-slate-400">GRASA (G)</p>
            <p class="text-xl font-bold text-yellow-400">\${Math.round(f)}</p>
        </div>
    \`;
}

let timerInt;
window.startTimer = function(s) {
    const box = document.getElementById('timer-box');
    const disp = document.getElementById('timer-display');
    box.classList.remove('hidden');
    let t = s; clearInterval(timerInt);
    timerInt = setInterval(() => {
        let mins = Math.floor(t / 60); let secs = t % 60;
        disp.innerText = \`\${mins}:\${secs < 10 ? '0' : ''}\${secs}\`;
        if (t-- <= 0) { clearInterval(timerInt); box.classList.add('hidden'); }
    }, 1000);
}

window.toggleTimer = function() {
    const box = document.getElementById('timer-box');
    if (!box.classList.contains('hidden')) box.classList.add('hidden'); else startTimer(90);
}

window.switchTab = function(tab) {
    ['workout', 'nutrition', 'config'].forEach(t => {
        const view = document.getElementById(\`view-\${t}\`);
        const nav = document.getElementById(\`nav-\${t}\`);
        if (view) view.classList.toggle('hidden', t !== tab);
        if (nav) nav.classList.toggle('text-blue-500', t === tab);
    });
}

window.resetApp = function() { if (confirm("¿Borrar todo?")) { localStorage.clear(); location.reload(); } }

// --- GOOGLE DRIVE SYNC ---
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '417195775471-vv2fo942f097s7stturpfjr2qkklp76e.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient;
let accessToken = null;

window.initGoogleTokenClient = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                accessToken = tokenResponse.access_token;
                document.getElementById('btn-login').classList.add('hidden');
                document.getElementById('user-info').classList.remove('hidden');
                updateCloudStatus('online');
                autoSync();
            }
        },
    });
}

window.handleAuthClick = function() {
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

window.handleSignoutClick = function() {
    google.accounts.oauth2.revoke(accessToken, () => {
        accessToken = null;
        document.getElementById('btn-login').classList.remove('hidden');
        document.getElementById('user-info').classList.add('hidden');
        updateCloudStatus('offline');
    });
}

function updateCloudStatus(status) {
    const icon = document.getElementById('cloud-status');
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

window.autoSync = async function() {
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
    const query = \`name = '\${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false\`;
    const response = await fetch(\`https://www.googleapis.com/drive/v3/files?q=\${encodeURIComponent(query)}\`, {
        headers: { 'Authorization': \`Bearer \${accessToken}\` }
    });
    const result = await response.json();
    if (result.files && result.files.length > 0) return result.files[0].id;

    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${accessToken}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder' })
    });
    const folder = await createResp.json();
    return folder.id;
}

async function findOrCreateFile(name, folderId) {
    const query = \`name = '\${name}' and '\${folderId}' in parents and trashed = false\`;
    const response = await fetch(\`https://www.googleapis.com/drive/v3/files?q=\${encodeURIComponent(query)}\`, {
        headers: { 'Authorization': \`Bearer \${accessToken}\` }
    });
    const result = await response.json();
    if (result.files && result.files.length > 0) return result.files[0].id;

    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${accessToken}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, parents: [folderId] })
    });
    const file = await createResp.json();
    return file.id;
}

async function uploadData(fileId) {
    const data = { exercises, records };
    await fetch(\`https://www.googleapis.com/upload/drive/v3/files/\${fileId}?uploadType=media\`, {
        method: 'PATCH',
        headers: { 'Authorization': \`Bearer \${accessToken}\` },
        body: JSON.stringify(data)
    });
}

window.loadFromCloud = async function() {
    if (!accessToken) return;
    updateCloudStatus('syncing');
    try {
        let fileId = localStorage.getItem('trainify_cloud_file_id');
        const response = await fetch(\`https://www.googleapis.com/drive/v3/files/\${fileId}?alt=media\`, {
            headers: { 'Authorization': \`Bearer \${accessToken}\` }
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

window.syncToCloud = function() { autoSync(); }

document.addEventListener('DOMContentLoaded', initApp);
import './style.css';
