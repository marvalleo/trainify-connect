import { supabase } from './supabase.js';
import * as admin from './admin.js';
import './style.css';

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
let activeViewRole = 'client'; // Por defecto para todos
let realUserRole = 'client';   // Rol persistido en DB

// --- MOTOR DE SEGURIDAD (Fingerprinting) ---
async function generateFingerprint() {
    const components = [
        navigator.userAgent,
        window.screen.width + 'x' + window.screen.height,
        new Date().getTimezoneOffset(),
        navigator.language,
        navigator.hardwareConcurrency || 'unknown'
    ].join('|');

    const encoder = new TextEncoder();
    const data = encoder.encode(components);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- INICIALIZACIÓN SEGURA ---
window.initApp = async function () {
    try {
        console.log("Iniciando aplicación v2.1...");

        // 1. Generar/Recuperar Fingerprint
        const currentFingerprint = await generateFingerprint();
        localStorage.setItem('trainify_last_fingerprint', currentFingerprint);

        // 2. Verificar Autenticación y Perfil
        const { data: { user } } = await supabase.auth.getUser();
        console.log("Usuario de Auth:", user);

        if (user) {
            document.getElementById('auth-section')?.classList.add('hidden');
            document.getElementById('app-content')?.classList.remove('hidden');

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role, registered_device_id')
                .eq('id', user.id)
                .maybeSingle(); // Usamos maybeSingle para evitar el error PGRST116 si no hay fila

            console.log("Perfil recuperado (v2.1):", profile);
            if (profileError) console.error("Error al recuperar perfil:", profileError);

            if (!profile) {
                console.warn("ADVERTENCIA: No se encontró perfil en public.profiles para el usuario:", user.id);
            }

            // 3. Validar Dispositivo (solo para alumnos reales)
            realUserRole = profile?.role || 'client';
            console.log("Rol detectado:", realUserRole);
            activeViewRole = realUserRole; // Inicialmente coincide

            if (realUserRole === 'client') {
                const isDeviceValid = await validateDevice(user.id, currentFingerprint, profile);
                if (!isDeviceValid) {
                    renderDeviceLockedScreen(user.id);
                    return;
                }
                document.querySelectorAll('.export-feature').forEach(el => el.classList.add('hidden'));
            } else if (realUserRole === 'master') {
                isAdmin = true;
                document.getElementById('admin-indicator')?.classList.remove('hidden');
                document.getElementById('role-switcher')?.classList.remove('hidden');
            }

            // Sincronizar UI de navegación según el rol detectado
            updateNavigationUI();
        }

        // 4. Cargar Categorías Dinámicas
        await loadCategories();

        // 5. Cargar Datos Locales
        exercises = JSON.parse(localStorage.getItem('trainify_exercises')) || defaultExercises;
        records = JSON.parse(localStorage.getItem('trainify_records')) || initialRecords;

        // 6. Migración e interfaz
        migrateExercisesToIds();

        if (activeViewRole === 'master') {
            loadAdminDashboard();
        } else {
            renderExercises();
        }

        // 7. Inicializar Google GIS (si existe)
        if (window.initGoogleTokenClient) {
            window.initGoogleTokenClient();
        }

        console.log("App inicializada con éxito.");
    } catch (err) {
        console.error("Error crítico en initApp:", err);
        renderExercises();
    }
}

async function validateDevice(userId, fingerprint, profile) {
    if (!profile) return true;

    if (!profile.registered_device_id) {
        // Registro inicial de dispositivo
        await supabase
            .from('profiles')
            .update({ registered_device_id: fingerprint })
            .eq('id', userId);
        return true;
    }

    return profile.registered_device_id === fingerprint;
}

function renderDeviceLockedScreen(userId) {
    const container = document.body;
    container.innerHTML = `
        <div class="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
            <div class="max-w-md w-full space-y-8 animate-fadeIn">
                <div class="text-red-500 text-6xl mb-4">
                    <i class="fas fa-mobile-alt"></i>
                    <i class="fas fa-lock absolute -ml-4 mt-8 text-2xl text-slate-950 bg-red-500 rounded-full p-1 border-4 border-slate-950"></i>
                </div>
                <h1 class="text-2xl font-black text-slate-100 uppercase tracking-tighter">Dispositivo No Autorizado</h1>
                <p class="text-slate-400 text-sm">Esta cuenta está vinculada a otro dispositivo para proteger tu plan de entrenamiento.</p>
                
                <div class="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 space-y-4">
                    <p class="text-xs text-slate-500 italic">¿Has cambiado de teléfono? Envía una solicitud de autorización a tu entrenador.</p>
                    <button onclick="requestDeviceChange('${userId}')" id="btn-request-change" class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs uppercase font-black tracking-widest transition-all">
                        Solicitar Cambio de Dispositivo
                    </button>
                    <div id="request-status" class="hidden text-xs font-bold text-yellow-500 animate-pulse">
                        Solicitud enviada. Espera la aprobación de tu Maestro.
                    </div>
                </div>
                
                <button onclick="supabase.auth.signOut().then(() => location.reload())" class="text-slate-500 text-[10px] uppercase tracking-widest hover:text-slate-300">
                    Cerrar Sesión
                </button>
            </div>
        </div>
    `;
}

window.toggleViewRole = function () {
    if (realUserRole !== 'master') return;

    activeViewRole = activeViewRole === 'master' ? 'client' : 'master';

    // Actualizar UI
    const btn = document.getElementById('btn-role-toggle');
    if (btn) btn.textContent = activeViewRole === 'master' ? 'Ver como Alumno' : 'Volver a Maestro';

    document.getElementById('admin-indicator')?.classList.toggle('hidden', activeViewRole !== 'master');
    document.getElementById('view-config')?.classList.toggle('hidden', activeViewRole !== 'master');

    // Aplicar Focus Mode si es client
    document.body.classList.toggle('focus-mode', activeViewRole === 'client');

    console.log(`Vista cambiada a: ${activeViewRole}`);

    // Actualizar Labels de Navegación
    updateNavigationUI();

    // Si entramos a modo maestro, forzar cambio a pestaña de entrenamiento (donde está el Dashboard)
    if (activeViewRole === 'master') {
        switchTab('workout');
    } else {
        renderExercises();
    }
}

function updateNavigationUI() {
    const navWorkout = document.getElementById('nav-workout');
    const navNutrition = document.getElementById('nav-nutrition');

    if (!navWorkout || !navNutrition) return;

    if (activeViewRole === 'master') {
        const isWorkoutActive = !document.getElementById('view-workout').classList.contains('hidden');
        const isCatalogActive = !document.getElementById('view-nutrition').classList.contains('hidden');

        navWorkout.innerHTML = `
            <i class="fas fa-users text-lg"></i>
            <span class="text-[10px] mt-1 font-bold ${isWorkoutActive ? 'text-purple-400' : ''}">Alumnos</span>
        `;
        navNutrition.innerHTML = `
            <i class="fas fa-dumbbell text-lg"></i>
            <span class="text-[10px] mt-1 font-bold ${isCatalogActive ? 'text-purple-400' : ''}">Catálogo</span>
        `;

        // Ajustar colores de los iconos/botones
        navWorkout.className = `flex flex-col items-center transition-colors ${isWorkoutActive ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`;
        navNutrition.className = `flex flex-col items-center transition-colors ${isCatalogActive ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`;
    } else {
        navWorkout.innerHTML = `<i class="fas fa-list-ul"></i><span class="text-[10px] mt-1">Rutina</span>`;
        navNutrition.innerHTML = `<i class="fas fa-utensils"></i><span class="text-[10px] mt-1">Nutrición</span>`;
        navWorkout.className = "flex flex-col items-center text-blue-500";
        navNutrition.className = "flex flex-col items-center text-slate-400";
    }
}

// --- DASHBOARD MAESTRO (Fase 3) ---
async function loadAdminDashboard() {
    const container = document.getElementById('exercise-list');
    if (!container) return;

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-12 space-y-4">
            <div class="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p class="text-slate-500 text-xs uppercase tracking-widest font-bold">Cargando Dashboard Maestro...</p>
        </div>
    `;

    try {
        // 1. Cargar alumnos
        const { data: students, error: stdError } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'client')
            .order('name');

        // 2. Cargar solicitudes de dispositivo
        const { data: requests, error: reqError } = await supabase
            .from('device_change_requests')
            .select(`
                *,
                profiles:client_id (name)
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        renderAdminDashboard(students || [], requests || []);
    } catch (err) {
        console.error("Error cargando dashboard:", err);
        container.innerHTML = `<p class="text-red-500 p-6 text-center">Error al cargar datos de administración.</p>`;
    }
}

function renderAdminDashboard(students, requests) {
    const container = document.getElementById('exercise-list');
    if (!container) return;

    container.innerHTML = `
        <div class="space-y-8 animate-fadeIn">
            <!-- Sección Solicitudes -->
            ${requests.length > 0 ? `
            <div class="space-y-4">
                <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500 flex items-center gap-2">
                    <i class="fas fa-exclamation-triangle"></i> Solicitudes de Dispositivo (${requests.length})
                </h3>
                <div class="grid grid-cols-1 gap-3">
                    ${requests.map(req => `
                        <div class="bg-slate-900/80 border border-yellow-500/20 p-4 rounded-2xl flex justify-between items-center">
                            <div>
                                <p class="text-xs font-bold text-slate-100">${req.profiles?.name || 'Usuario desconocido'}</p>
                                <p class="text-[8px] text-slate-500 uppercase mt-1">${new Date(req.created_at).toLocaleString()}</p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="handleDeviceRequest('${req.id}', 'approved', '${req.client_id}')" class="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all">Aprobar</button>
                                <button onclick="handleDeviceRequest('${req.id}', 'rejected')" class="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all">Denegar</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Sección Alumnos -->
            <div class="space-y-4">
                <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 flex items-center gap-2">
                    <i class="fas fa-users"></i> Mis Alumnos (${students.length})
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    ${students.map(s => `
                        <div class="card-gradient p-5 rounded-2xl border border-slate-800 hover:border-purple-500/30 transition-all group">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="text-sm font-black text-slate-100">${s.name || 'Sin nombre'}</p>
                                    <p class="text-[9px] text-slate-500 uppercase tracking-widest mt-1">Nivel: ${s.subscription_tier || 'Free'}</p>
                                </div>
                                <div class="bg-slate-800 p-2 rounded-xl text-slate-400 group-hover:text-purple-400 transition-colors">
                                    <i class="fas fa-chart-line"></i>
                                </div>
                            </div>
                            <div class="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-center text-[9px] uppercase font-bold tracking-widest">
                                <span class="text-slate-500">Dispositivo:</span>
                                <span class="${s.registered_device_id ? 'text-green-500' : 'text-slate-600'}">
                                    ${s.registered_device_id ? 'VINCULADO' : 'PENDIENTE'}
                                </span>
                            </div>
                            <button onclick="viewStudentDetails('${s.id}')" class="w-full mt-4 py-2.5 bg-slate-800/50 hover:bg-purple-600 text-slate-400 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                                Ver Progreso
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

window.handleDeviceRequest = async function (reqId, status, clientId) {
    if (!confirm(`¿${status === 'approved' ? 'Aprobar' : 'Rechazar'} solicitud?`)) return;

    try {
        if (status === 'approved') {
            // 1. Limpiar el ID de dispositivo registrado del perfil
            await supabase
                .from('profiles')
                .update({ registered_device_id: null })
                .eq('id', clientId);
        }

        // 2. Marcar solicitud como resulta
        await supabase
            .from('device_change_requests')
            .update({ status: status, resolved_at: new Date().toISOString() })
            .eq('id', reqId);

        alert(`Solicitud ${status === 'approved' ? 'aprobada' : 'rechazada'}.`);
        loadAdminDashboard();
    } catch (err) {
        console.error("Error al procesar solicitud:", err);
    }
}

window.viewStudentDetails = function (studentId) {
    alert(`Próximamente: Detalle del alumno ${studentId}. (Fase 4)`);
}

window.loginWithGoogleSupabase = async function () {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });
    if (error) alert("Error al iniciar sesión: " + error.message);
}

window.requestDeviceChange = async function (userId) {
    const btn = document.getElementById('btn-request-change');
    const status = document.getElementById('request-status');

    btn.disabled = true;
    btn.classList.add('opacity-50');

    const { error } = await supabase
        .from('device_change_requests')
        .insert([{ client_id: userId, reason: 'Cambio de dispositivo detectado automáticamente' }]);

    if (!error) {
        status.classList.remove('hidden');
        btn.textContent = 'Solicitud Pendiente';
    } else {
        alert('Error al enviar la solicitud. Intenta de nuevo.');
        btn.disabled = false;
        btn.classList.remove('opacity-50');
    }
}

function migrateExercisesToIds() {
    // Si no hay categorías cargadas, no podemos migrar
    if (!categories || categories.length === 0) return;

    const oldKeys = ['superior', 'inferior', 'espalda', 'bíceps', 'tríceps', 'pierna'];
    let migrated = false;

    oldKeys.forEach(key => {
        if (exercises[key] && exercises[key].length > 0) {
            // Buscamos coincidencia parcial o por palabras clave
            const match = categories.find(c =>
                c.name.toLowerCase().includes(key.toLowerCase()) ||
                key.toLowerCase().includes(c.name.toLowerCase())
            );

            if (match) {
                console.log(`Migrando ejercicios de [${key}] a ID [${match.id}] (${match.name})`);
                if (!exercises[match.id]) exercises[match.id] = [];

                // Evitar duplicados si ya se había migrado algo
                const existingIds = new Set(exercises[match.id].map(ex => ex.id));
                const toAdd = exercises[key].filter(ex => !existingIds.has(ex.id));

                exercises[match.id] = [...exercises[match.id], ...toAdd];
                delete exercises[key];
                migrated = true;
            } else {
                console.warn(`No se encontró categoría para migrar ejercicios de: ${key}`);
            }
        }
    });

    if (migrated) {
        localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
    }
}

window.checkAdminAccess = function () {
    adminClicks++;
    if (adminClicks >= 5) {
        isAdmin = !isAdmin;
        adminClicks = 0;
        const panel = document.getElementById('admin-panel');
        const indicator = document.getElementById('admin-indicator');
        if (panel) panel.classList.toggle('hidden', !isAdmin);
        if (indicator) indicator.classList.toggle('hidden', !isAdmin);
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

    const assignCatSelect = document.getElementById('student-assign-cat');
    const individualCatSelect = document.getElementById('new-ex-cat');
    if (assignCatSelect) assignCatSelect.innerHTML = '';
    if (individualCatSelect) individualCatSelect.innerHTML = '';

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

            // También para el selector de asignación de alumnos
            const opt2 = opt.cloneNode(true);
            if (assignCatSelect) assignCatSelect.appendChild(opt2);

            // Y para el selector de ejercicios individuales
            const opt3 = opt.cloneNode(true);
            if (individualCatSelect) individualCatSelect.appendChild(opt3);
        });
    }
    renderAdminMasterExercises();
    renderAdminStudents();
}

window.renderAdminStudents = async function () {
    const list = document.getElementById('admin-student-list');
    if (!list) return;
    list.innerHTML = '<p class="text-[10px] text-center text-slate-500 animate-pulse">Cargando alumnos...</p>';

    const students = await admin.admin_loadStudents();
    list.innerHTML = '';
    if (students) {
        students.forEach(s => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800 hover:border-blue-500/50 transition-colors cursor-pointer';
            item.onclick = (e) => {
                if (e.target.closest('button')) return;
                openStudentDetail(s);
            };
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <i class="fas fa-user-graduate"></i>
                    </div>
                    <span class="text-sm font-bold text-slate-200">${s.name}</span>
                </div>
                <button onclick="deleteStudent(${s.id})" class="text-red-400 p-2"><i class="fas fa-user-minus"></i></button>
            `;
            list.appendChild(item);
        });
    }
}

window.addNewStudent = async function () {
    const input = document.getElementById('new-student-name');
    const name = input.value.trim();
    if (name) {
        const success = await admin.admin_saveStudent(name);
        if (success) {
            input.value = '';
            renderAdminStudents();
        }
    }
}

window.deleteStudent = async function (id) {
    if (confirm('¿Eliminar alumno y toda su rutina asignada?')) {
        const success = await admin.admin_deleteStudent(id);
        if (success) renderAdminStudents();
    }
}

let activeStudentId = null;

window.openStudentDetail = function (student) {
    activeStudentId = student.id;
    document.getElementById('admin-student-name-title').textContent = `Alumno: ${student.name}`;
    document.getElementById('admin-student-detail').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');

    // Poblar categorías en el selector de asignación
    loadMasterExercisesForAssignment();
    renderStudentRoutine();
}

window.closeStudentDetail = function () {
    activeStudentId = null;
    document.getElementById('admin-student-detail').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
}

window.loadMasterExercisesForAssignment = async function () {
    const catId = document.getElementById('student-assign-cat').value;
    const exSelect = document.getElementById('student-assign-ex');
    if (!exSelect || !catId) return;

    exSelect.innerHTML = '<option>Cargando ejercicios...</option>';
    const exercises = await admin.admin_loadMasterExercises(catId);
    exSelect.innerHTML = '';
    if (exercises) {
        exercises.forEach(ex => {
            const opt = document.createElement('option');
            opt.value = ex.id;
            opt.textContent = ex.name;
            exSelect.appendChild(opt);
        });
    }
}

window.assignExerciseToStudent = async function () {
    const exId = document.getElementById('student-assign-ex').value;
    if (activeStudentId && exId) {
        const success = await admin.admin_assignExerciseToStudent(activeStudentId, exId, "");
        if (success) {
            renderStudentRoutine();
        }
    }
}

window.renderStudentRoutine = async function () {
    const container = document.getElementById('admin-student-routine');
    if (!container || !activeStudentId) return;

    container.innerHTML = '<p class="text-[10px] text-center text-slate-500 animate-pulse">Cargando rutina...</p>';
    const routine = await admin.admin_loadStudentRoutine(activeStudentId);
    container.innerHTML = '';

    if (routine) {
        routine.forEach(item => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-slate-900/30 p-2 rounded border border-slate-800/50';
            div.innerHTML = `
                <span class="text-xs text-slate-300">${item.master_exercises.name}</span>
                <button onclick="removeExerciseFromStudent(${item.id})" class="text-red-400 p-1"><i class="fas fa-times"></i></button>
            `;
            container.appendChild(div);
        });
    }
}

window.removeExerciseFromStudent = async function (id) {
    if (confirm('¿Quitar este ejercicio de la rutina del alumno?')) {
        const success = await admin.admin_deleteRoutineExercise(id);
        if (success) renderStudentRoutine();
    }
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
        // En v2.1, las categorías se manejan en Supabase con UUID.
        // Si no hay conexión, se genera un UUID temporal.
        const tempId = crypto.randomUUID();
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
// --- MIGRACIÓN DE DATOS (Legacy -> v2.1) ---
window.migrateExercisesToIds = function () {
    let changed = false;
    for (const catId in exercises) {
        exercises[catId] = exercises[catId].map(ex => {
            // Si el ID es puramente numérico (legacy) o no existe, generar UUID
            if (!ex.id || typeof ex.id === 'number') {
                const oldId = ex.id;
                const newId = crypto.randomUUID();
                ex.id = newId;

                // Mover records del ID viejo al nuevo
                if (records[oldId]) {
                    records[newId] = records[oldId];
                    delete records[oldId];
                }
                changed = true;
            }
            return ex;
        });
    }
    if (changed) {
        localStorage.setItem('trainify_exercises', JSON.stringify(exercises));
        localStorage.setItem('trainify_records', JSON.stringify(records));
        console.log("Migración a UUIDs v2.1 completada localmente.");
    }
}

window.renderExercises = function () {
    renderTabs();
    const container = document.getElementById('exercise-list');
    if (!container) return;
    container.innerHTML = '';
    const today = new Date().toLocaleDateString('sv-SE');

    if (!currentCategory && categories.length > 0) {
        currentCategory = categories[0].id;
    }

    if (!exercises[currentCategory]) {
        exercises[currentCategory] = [];
    }

    exercises[currentCategory].forEach(ex => {
        // En v2.1 ex.id es un UUID.
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

window.saveSet = async function (exId) {
    const kgInput = document.getElementById(`kg-${exId}`);
    const repsInput = document.getElementById(`reps-${exId}`);

    let kg = parseFloat(kgInput.value);
    let reps = parseFloat(repsInput.value);

    if (isNaN(kg) || isNaN(reps)) {
        const history = records[exId] || [];
        const last = history[history.length - 1];

        if (last) {
            if (isNaN(kg)) kg = last.kg;
            if (isNaN(reps)) reps = last.reps;
        } else {
            alert("Por favor completa Kilos y Reps.");
            return;
        }
    }

    if (!records[exId]) records[exId] = [];

    const newRecord = {
        id: crypto.randomUUID(),
        kg: kg,
        reps: reps,
        date: new Date().toLocaleDateString('sv-SE'),
        note: ""
    };

    records[exId].push(newRecord);

    localStorage.setItem('trainify_records', JSON.stringify(records));
    kgInput.value = '';
    repsInput.value = '';
    renderExercises();
    startTimer(90);

    // Sincronización inmediata v2.1
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        await supabase.from('logs').insert([{
            client_id: user.id,
            data: newRecord,
            timestamp: new Date().toISOString()
        }]);
    }
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
    const catId = document.getElementById('new-ex-cat').value;
    if (!name) return;

    const newEx = { id: crypto.randomUUID(), name: name };
    exercises[catId].push(newEx);
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

    // Lógica de visibilidad de sub-vistas y pestañas
    const clientNut = document.getElementById('client-nutrition-view');
    const masterCat = document.getElementById('master-catalog-view');
    const categoryTabs = document.getElementById('category-tabs');

    if (tab === 'workout') {
        if (categoryTabs) categoryTabs.classList.toggle('hidden', activeViewRole === 'master');
        if (activeViewRole === 'master') {
            loadAdminDashboard();
        } else {
            renderExercises();
        }
    } else if (tab === 'nutrition') {
        if (categoryTabs) categoryTabs.classList.add('hidden');
        if (activeViewRole === 'master') {
            clientNut?.classList.add('hidden');
            masterCat?.classList.remove('hidden');
            renderMasterCatalog();
        } else {
            clientNut?.classList.remove('hidden');
            masterCat?.classList.add('hidden');
        }
    } else if (tab === 'config') {
        if (categoryTabs) categoryTabs.classList.add('hidden');
    }

    // Actualizar visualmente la barra de navegación (labels y colores activos)
    updateNavigationUI();
}

async function renderMasterCatalog() {
    const container = document.getElementById('view-nutrition');
    if (!container) return;

    // Movemos el panel de admin aquí dinámicamente o lo inyectamos
    container.innerHTML = `
        <div class="space-y-6 animate-fadeIn">
            <h2 class="text-xl font-black text-purple-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <i class="fas fa-dumbbell"></i> Gestión del Catálogo
            </h2>
            <div id="catalog-content"></div>
        </div>
    `;

    // Inyectamos el componente de gestión de ejercicios (antes en view-config)
    renderAdminPanelInContainer();
}

async function renderAdminPanelInContainer() {
    const listContainer = document.getElementById('catalog-content');
    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="card-gradient p-6 rounded-2xl border border-slate-800 space-y-6">
            <div class="space-y-4">
                <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500">Categorías Disponibles</h3>
                <div id="admin-category-list" class="space-y-2"></div>
                <div class="flex gap-2">
                    <input type="text" id="new-cat-name" placeholder="Nueva Categoría..." class="flex-1 bg-slate-900 border border-slate-700 p-3 rounded-xl text-xs">
                    <button onclick="addNewCategory()" class="bg-purple-600 px-4 rounded-xl text-xs font-bold">Añadir</button>
                </div>
            </div>
            
            <hr class="border-slate-800">
            
            <div class="space-y-4">
                <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500">Configurar Ejercicios Maestro</h3>
                <select id="admin-master-ex-cat" onchange="renderAdminMasterExercises()" class="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-xs"></select>
                <div id="admin-master-ex-list" class="space-y-2 max-h-60 overflow-y-auto pr-2"></div>
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
                    <input type="text" id="new-master-ex-name" placeholder="Nombre del Ejercicio Maestro..." class="w-full bg-slate-800 border border-slate-700 p-3 rounded-lg text-xs">
                    <button onclick="addNewMasterExercise()" class="w-full bg-blue-600 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest">Crear Ejercicio Base</button>
                </div>
            </div>
        </div>
    `;

    // Cargar datos en los selectores/listas
    const cats = await admin.admin_loadCategories();
    const select = document.getElementById('admin-master-ex-cat');
    const catList = document.getElementById('admin-category-list');

    if (cats && select && catList) {
        catList.innerHTML = '';
        select.innerHTML = '';
        cats.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-slate-900/50 p-3 rounded-xl border border-slate-800';
            item.innerHTML = `
                <span class="text-xs font-medium text-slate-300">${cat.name}</span>
                <button onclick="deleteCategory(${cat.id})" class="text-red-400 p-1 hover:text-red-300"><i class="fas fa-trash"></i></button>
            `;
            catList.appendChild(item);

            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            select.appendChild(opt);
        });
        renderAdminMasterExercises();
    }
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

// --- SUPABASE SYNC v2.1 (Relacional) ---
window.loadFromCloudSupabase = async function () {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
        updateCloudStatus('syncing');

        // 1. Cargar Categorías
        const { data: cats } = await supabase.from('categories').select('*').order('display_order');
        if (cats) categories = cats;

        // 2. Cargar Logs (Training Records)
        const { data: logsData } = await supabase
            .from('logs')
            .select('*')
            .eq('client_id', user.id)
            .order('timestamp', { ascending: true });

        if (logsData) {
            const newRecords = {};
            logsData.forEach(log => {
                // El campo 'data' en la DB contiene el objeto del set {kg, reps, date, note, exerciseId}
                const exerciseId = log.data.exerciseId || "legacy";
                if (!newRecords[exerciseId]) newRecords[exerciseId] = [];
                newRecords[exerciseId].push(log.data);
            });

            records = newRecords;
            localStorage.setItem('trainify_records', JSON.stringify(records));
        }

        updateCloudStatus('online');
        renderExercises();
    } catch (err) {
        console.error('Error en carga Relacional:', err);
        updateCloudStatus('offline');
    }
}

window.autoSyncSupabase = async function () {
    return loadFromCloudSupabase();
}

window.syncToCloud = async function () {
    updateCloudStatus('syncing');
    await autoSync();
    await loadFromCloudSupabase();
}

// --- FUNCIONES CATÁLOGO MAESTRO ---
window.addNewMasterExercise = async function () {
    const nameInput = document.getElementById('new-master-ex-name');
    const catIdSelector = document.getElementById('admin-master-ex-cat');
    if (!nameInput || !catIdSelector) return;

    const catId = catIdSelector.value;
    const name = nameInput.value.trim();

    if (!name || !catId) return;

    try {
        const success = await admin.admin_saveMasterExercise(catId, name);
        if (success) {
            nameInput.value = '';
            renderAdminMasterExercises();
            alert("Ejercicio maestro creado con éxito.");
        }
    } catch (err) {
        console.error("Error al crear ejercicio maestro:", err);
    }
}

window.renderAdminMasterExercises = async function () {
    const selector = document.getElementById('admin-master-ex-cat');
    if (!selector) return;
    const catId = selector.value;
    const list = document.getElementById('admin-master-ex-list');
    if (!list || !catId) return;

    list.innerHTML = '<p class="text-[10px] text-center text-slate-500 animate-pulse">Cargando catálogo...</p>';

    const exs = await admin.admin_loadMasterExercises(catId);
    list.innerHTML = '';
    if (exs) {
        exs.forEach(ex => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-slate-900/40 p-3 rounded-xl border border-slate-800';
            item.innerHTML = `
                <span class="text-xs text-slate-300 font-bold">${ex.name}</span>
                <button onclick="deleteMasterExercise(${ex.id})" class="text-red-400 p-2"><i class="fas fa-trash"></i></button>
            `;
            list.appendChild(item);
        });
    }
}

window.deleteMasterExercise = async function (id) {
    if (!confirm("¿Borrar este ejercicio del catálogo maestro?")) return;
    const success = await admin.admin_deleteMasterExercise(id);
    if (success) renderAdminMasterExercises();
}

window.addNewCategory = async function () {
    const input = document.getElementById('new-cat-name');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    const success = await admin.admin_saveCategory(name);
    if (success) {
        input.value = '';
        await loadCategories();
        if (activeViewRole === 'master') {
            renderMasterCatalog();
        } else {
            renderTabs();
        }
    }
}

document.addEventListener('DOMContentLoaded', initApp);
