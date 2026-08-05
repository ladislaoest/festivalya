const { getValidAccessToken, getTokenRow, saveTokenRow } = require('./_googleAuth');

// Único punto de contacto del frontend con la API de Google Calendar: el
// access_token y el refresh_token nunca salen de aquí. Acciones vía
// ?action=... (GET) o { action: ... } en el body (POST).
module.exports = async (req, res) => {
    try {
        const action = req.method === 'GET' ? req.query.action : (req.body || {}).action;

        if (action === 'status') {
            const row = await getTokenRow();
            res.status(200).json({
                connected: !!(row && row.refresh_token),
                calendarId: row ? row.calendar_id : null,
                calendarName: row ? row.calendar_name : null
            });
            return;
        }

        if (action === 'disconnect') {
            await saveTokenRow({ access_token: null, refresh_token: null, token_expiry: null, calendar_id: null, calendar_name: null });
            res.status(200).json({ ok: true });
            return;
        }

        const accessToken = await getValidAccessToken();
        if (!accessToken) {
            res.status(401).json({ error: 'No hay ninguna cuenta de Google conectada.' });
            return;
        }

        if (action === 'list-calendars') {
            const data = await googleFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', accessToken);
            res.status(200).json({ calendars: (data.items || []).map(c => ({ id: c.id, name: c.summary })) });
            return;
        }

        if (action === 'set-calendar') {
            const { calendarId, calendarName } = req.body || {};
            if (!calendarId) { res.status(400).json({ error: 'Falta calendarId.' }); return; }
            await saveTokenRow({ calendar_id: calendarId, calendar_name: calendarName || calendarId });
            res.status(200).json({ ok: true });
            return;
        }

        // El resto de acciones operan sobre el calendario ya elegido
        const row = await getTokenRow();
        if (!row || !row.calendar_id) {
            res.status(400).json({ error: 'Todavía no elegiste qué calendario sincronizar.' });
            return;
        }
        const calId = encodeURIComponent(row.calendar_id);

        if (action === 'list-events') {
            const params = new URLSearchParams({
                singleEvents: 'true',
                orderBy: 'startTime',
                timeMin: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
                maxResults: '250'
            });
            const data = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params.toString()}`, accessToken);
            res.status(200).json({ events: data.items || [] });
            return;
        }

        if (action === 'create-event') {
            const { event } = req.body || {};
            if (!event) { res.status(400).json({ error: 'Falta event.' }); return; }
            const data = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, accessToken, 'POST', event);
            res.status(200).json({ event: data });
            return;
        }

        if (action === 'update-event') {
            const { googleEventId, event } = req.body || {};
            if (!googleEventId || !event) { res.status(400).json({ error: 'Falta googleEventId o event.' }); return; }
            const data = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(googleEventId)}`, accessToken, 'PATCH', event);
            res.status(200).json({ event: data });
            return;
        }

        if (action === 'delete-event') {
            const { googleEventId } = req.body || {};
            if (!googleEventId) { res.status(400).json({ error: 'Falta googleEventId.' }); return; }
            await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(googleEventId)}`, accessToken, 'DELETE');
            res.status(200).json({ ok: true });
            return;
        }

        res.status(400).json({ error: 'Acción no reconocida: ' + action });
    } catch (err) {
        console.error('[google-calendar]', err);
        res.status(500).json({ error: err.message });
    }
};

async function googleFetch(url, accessToken, method = 'GET', body) {
    const resp = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (resp.status === 204) return {}; // DELETE sin contenido

    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok) {
        // Si el evento ya no existe en Google (borrado a mano ahí), no es un
        // error real desde el punto de vista de festivalya -no hay nada que
        // sincronizar. El llamador decide si lo ignora (ver deleteEventFromGoogle).
        throw new Error(data.error ? (data.error.message || JSON.stringify(data.error)) : `Error ${resp.status} de Google Calendar`);
    }
    return data;
}
