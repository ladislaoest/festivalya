// Compartido por google-oauth-callback.js y google-calendar.js. El prefijo
// "_" hace que Vercel NO lo trate como una ruta propia -es un módulo, no un
// endpoint.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://atmxqrkcvvatfqsvkdcm.supabase.co';

function getServiceClient() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY en Vercel.');
    return createClient(SUPABASE_URL, key);
}

async function getTokenRow() {
    const sb = getServiceClient();
    const { data, error } = await sb.from('google_calendar_tokens').select('*').eq('id', 'main').maybeSingle();
    if (error) throw new Error('Error leyendo credenciales de Google: ' + error.message);
    return data;
}

async function saveTokenRow(fields) {
    const sb = getServiceClient();
    const { error } = await sb.from('google_calendar_tokens').upsert({ id: 'main', ...fields });
    if (error) throw new Error('Error guardando credenciales de Google: ' + error.message);
}

// Devuelve un access_token válido, refrescándolo con el refresh_token si
// hace falta (Google los caduca cada ~1h) y guardando el nuevo en Supabase.
// null si no hay ninguna cuenta de Google conectada todavía.
async function getValidAccessToken() {
    const row = await getTokenRow();
    if (!row || !row.refresh_token) return null;

    const expiry = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
    if (row.access_token && expiry > Date.now() + 60000) {
        return row.access_token;
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: row.refresh_token,
            grant_type: 'refresh_token'
        })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error('Error refrescando token de Google: ' + (data.error_description || data.error));

    const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
    await saveTokenRow({ access_token: data.access_token, token_expiry: newExpiry });
    return data.access_token;
}

function getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}

module.exports = { getServiceClient, getTokenRow, saveTokenRow, getValidAccessToken, getBaseUrl };
