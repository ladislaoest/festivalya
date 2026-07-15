const webpush = require('web-push');

webpush.setVapidDetails(
    'mailto:admin@festivalya.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const { subscriptions, payload } = req.body || {};

    if (!Array.isArray(subscriptions) || subscriptions.length === 0 || !payload) {
        res.status(400).json({ error: 'Missing subscriptions or payload' });
        return;
    }

    const results = await Promise.allSettled(
        subscriptions.map(sub => webpush.sendNotification(sub, JSON.stringify(payload)))
    );

    res.status(200).json({
        sent: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length
    });
};
