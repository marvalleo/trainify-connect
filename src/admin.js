import { supabase } from './supabase.js';

export async function admin_loadCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('display_order');
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

// Futuro: Funciones para gestionar ejercicios maestros
export async function admin_loadMasterExercises(catId) {
    const { data, error } = await supabase.from('master_exercises').select('*').eq('category_id', catId).order('display_order');
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
