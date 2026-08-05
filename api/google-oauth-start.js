const { getBaseUrl } = require('./_googleAuth');

// Botón "Conectar con Google" (pestaña Admin): redirige a la pantalla de
// consentimiento de Google. access_type=offline + prompt=consent garantizan
// que Google siempre mande un refresh_token (si no, solo lo manda la
// primerísima vez que se autoriza la app, y aquí hace falta cada vez que
// alguien reconecta).
module.exports = async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
        res.status(500).send('Falta configurar GOOGLE_CLIENT_ID en las variables de entorno de Vercel.');
        return;
    }

    const redirectUri = `${getBaseUrl(req)}/api/google-oauth-callback`;
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: 'https://www.googleapis.com/auth/calendar'
    });

    res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
    res.end();
};
