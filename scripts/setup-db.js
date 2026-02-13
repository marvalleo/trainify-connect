import postgres from 'postgres';
import 'dotenv/config';

async function setup() {
    const url = process.env.VITE_SUPABASE_URL;
    const password = process.env.SUPABASE_DB_PASSWORD;

    // Extraer proyecto ref del URL (ej: https://projectref.supabase.co)
    const projectRef = url.split('//')[1].split('.')[0];
    const host = `db.${projectRef}.supabase.co`;

    console.log(`Conectando a Supabase Postgres en ${host}...`);

    const sql = postgres({
        host,
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        password: password,
        ssl: 'require'
    });

    try {
        console.log('--- Configurando Tablas ---');

        // 1. Tabla de Categorías (Tabs)
        await sql`
            CREATE TABLE IF NOT EXISTS public.categories (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                name TEXT NOT NULL,
                display_order INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;
        console.log('✅ Tabla categories lista.');

        // 2. Tabla master_exercises actualizada con referencia a categoría
        await sql`
            CREATE TABLE IF NOT EXISTS public.master_exercises (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                name TEXT NOT NULL,
                category_id BIGINT REFERENCES public.categories(id) ON DELETE CASCADE,
                coach_note TEXT,
                display_order INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;
        console.log('✅ Tabla master_exercises lista.');

        // 3. Tabla user_data para registros de usuarios
        await sql`
            CREATE TABLE IF NOT EXISTS public.user_data (
                device_id TEXT PRIMARY KEY,
                exercises JSONB DEFAULT '{}'::jsonb,
                records JSONB DEFAULT '{}'::jsonb,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;
        console.log('✅ Tabla user_data lista.');

        console.log('--- Configurando Políticas de Seguridad (RLS) ---');

        // Habilitar RLS
        await sql`ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;`;
        await sql`ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;`;
        await sql`ALTER TABLE public.master_exercises ENABLE ROW LEVEL SECURITY;`;

        // Políticas
        await sql`DROP POLICY IF EXISTS "Lectura Pública Categorías" ON public.categories;`;
        await sql`CREATE POLICY "Lectura Pública Categorías" ON public.categories FOR SELECT USING (true);`;

        await sql`DROP POLICY IF EXISTS "Acceso Público Total" ON public.user_data;`;
        await sql`CREATE POLICY "Acceso Público Total" ON public.user_data FOR ALL USING (true) WITH CHECK (true);`;

        await sql`DROP POLICY IF EXISTS "Lectura Pública Ejercicios" ON public.master_exercises;`;
        await sql`CREATE POLICY "Lectura Pública Ejercicios" ON public.master_exercises FOR SELECT USING (true);`;

        // Insertar categorías iniciales si no existen
        const cats = await sql`SELECT count(*) FROM public.categories`;
        if (cats[0].count == 0) {
            await sql`
                INSERT INTO public.categories (name, display_order) VALUES 
                ('Superior', 1), ('Inferior', 2), ('Espalda/Hombro', 3);
            `;
            console.log('✅ Categorías iniciales insertadas.');
        }

        console.log('✅ Configuración completada con éxito.');
    } catch (error) {
        console.error('❌ Error configurando la base de datos:', error);
    } finally {
        await sql.end();
    }
}

setup();
