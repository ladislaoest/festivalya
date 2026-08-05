const { saveTokenRow, getBaseUrl } = require('./_googleAuth');

// Google vuelve acá después de que el admin autoriza el acceso. Cambia el
// "code" de un solo uso por un access_token + refresh_token y los guarda
// (ver _googleAuth.js -esta tabla no es legible desde el cliente).
module.exports = async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const { code, error: oauthError } = req.query || {};

    if (oauthError) {
        res.writeHead(302, { Location: `${baseUrl}/?google_calendar=error` });
        res.end();
        return;
    }
    if (!code) {
        res.status(400).send('Falta el parámetro "code" en la respuesta de Google.');
        return;
    }

    try {
        const redirectUri = `${baseUrl}/api/google-oauth-callback`;
        const resp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error_description || data.error || 'Error desconocido de Google');

        const tokenExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
        await saveTokenRow({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            token_expiry: tokenExpiry
        });

        res.writeHead(302, { Location: `${baseUrl}/?google_calendar=connected` });
        res.end();
    } catch (err) {
        console.error('[google-oauth-callback]', err);
        res.writeHead(302, { Location: `${baseUrl}/?google_calendar=error` });
        res.end();
    }
};
