import { supabase } from './supabase.js';

// --- GESTIÓN DE CATEGORÍAS ---
export async function admin_loadCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('display_order');
    if (error) console.error("Error loading categories:", error);
    return data;
}

export async function admin_saveCategory(name, order) {
    const { error } = await supabase.from('categories').insert([{ name, display_order: order }]);
    return !error;
}

export async function admin_updateCategory(id, name, order) {
    const { error } = await supabase.from('categories').update({ name, display_order: order }).eq('id', id);
    return !error;
}

export async function admin_deleteCategory(id) {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    return !error;
}

// --- GESTIÓN DE EJERCICIOS MAESTROS ---
export async function admin_loadMasterExercises(catId) {
    let query = supabase.from('master_exercises').select('*').order('display_order');
    if (catId) query = query.eq('category_id', catId);
    const { data, error } = await query;
    if (error) console.error("Error loading master exercises:", error);
    return data;
}

export async function admin_saveMasterExercise(name, catId, note) {
    const { error } = await supabase.from('master_exercises').insert([{ name, category_id: catId, coach_note: note }]);
    return !error;
}

export async function admin_deleteMasterExercise(id) {
    const { error } = await supabase.from('master_exercises').delete().eq('id', id);
    return !error;
}

// --- GESTIÓN DE ALUMNOS ---
export async function admin_loadStudents() {
    const { data, error } = await supabase.from('students').select('*').order('name');
    if (error) console.error("Error loading students:", error);
    return data;
}

export async function admin_saveStudent(name) {
    const { error } = await supabase.from('students').insert([{ name }]);
    return !error;
}

export async function admin_deleteStudent(id) {
    const { error } = await supabase.from('students').delete().eq('id', id);
    return !error;
}

export async function admin_loadStudentRoutine(studentId) {
    const { data, error } = await supabase
        .from('routines')
        .select(`
            *,
            master_exercises (
                id,
                name,
                category_id
            )
        `)
        .eq('student_id', studentId);
    if (error) console.error("Error loading student routine:", error);
    return data;
}

export async function admin_assignExerciseToStudent(studentId, exerciseId, note) {
    const { error } = await supabase.from('routines').insert([
        { student_id: studentId, exercise_id: exerciseId, custom_note: note }
    ]);
    return !error;
}

export async function admin_deleteRoutineExercise(id) {
    const { error } = await supabase.from('routines').delete().eq('id', id);
    return !error;
}
