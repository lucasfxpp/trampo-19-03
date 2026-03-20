/**
 * /api/create-pix
 * Single clean handler (CommonJS) - forwards to Freepay using global fetch
 */
module.exports = async function (req, res) {
  try {
    console.log('create-pix invoked', req.method);
    if (req.method === 'GET') return res.status(200).json({ ok: true });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const amount = body.amount;

    // Normalize amount to integer cents
    let amountCents = null;
    if (typeof amount === 'number') amountCents = Number.isInteger(amount) ? amount : Math.round(amount * 100);
    else if (typeof amount === 'string') {
      const parsed = Number(amount.replace(',', '.'));
      if (!Number.isNaN(parsed)) amountCents = Math.round(parsed * 100);
    }
    if (!amountCents || amountCents <= 0) return res.status(400).json({ error: 'invalid_amount' });

    const publicKey = process.env.FREEPAY_PUBLIC_KEY;
    const secretKey = process.env.FREEPAY_SECRET_KEY;
    if (!publicKey || !secretKey) return res.status(500).json({ error: 'freepay_keys_missing' });

    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    const fpPayload = Object.assign({}, body, { amount: amountCents, payment_method: 'pix' });

    const _fetch = (typeof fetch !== 'undefined') ? fetch : (global && global.fetch) ? global.fetch : null;
    if (!_fetch) {
      console.error('fetch not available');
      return res.status(500).json({ error: 'fetch_not_available' });
    }

    const resp = await _fetch('https://api.freepaybrasil.com/v1/payment-transaction/create', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fpPayload)
    });

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
    return res.status(resp.status || 200).json(json);
  } catch (err) {
    console.error('create-pix error', err && err.stack || err);
    return res.status(500).json({ error: 'internal_error', detail: String(err) });
  }
};
