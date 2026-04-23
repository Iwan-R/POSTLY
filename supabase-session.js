// Configuration Supabase globale - SESSION MANAGER
const SUPABASE_URL = 'https://rgaftjkxcjxudobfiyyo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EUPSbTeVs3WHYJZ8E2IF2A_NqYsqtiY';

// Créer UN SEUL client Supabase global
if (typeof supabase !== 'undefined' && !window.supabaseClient) {
    const { createClient } = supabase;
    window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            storage: window.localStorage,
            storageKey: 'sb-postly-auth',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        }
    });
    
    console.log('✅ Supabase client initialisé');
}
