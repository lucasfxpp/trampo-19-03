module.exports = async function (req, res) {
  try {
    console.log('api/create-pix invoked', req.method);
    if (req.method === 'GET') return res.status(200).json({ ok: true });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const { amount, items, customer, metadata, postback_url } = body;

    // Convert amount to integer cents
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

    const normalizeDocument = (doc) => {
      if (!doc) return undefined;
      if (typeof doc === 'string') {
        const onlyDigits = doc.replace(/\D/g, '');
        return { number: onlyDigits, type: onlyDigits.length === 11 ? 'cpf' : 'cnpj' };
      }
      if (typeof doc === 'object') {
        const number = String(doc.number || '').replace(/\D/g, '');
        const type = doc.type || (number.length === 11 ? 'cpf' : 'cnpj');
        return { number, type };
      }
      return undefined;
    };

    const fpPayload = {
      amount: amountCents,
      payment_method: 'pix',
      postback_url: postback_url || process.env.FREEPAY_POSTBACK_URL || undefined,
      customer: {
        name: customer && customer.name,
        email: customer && customer.email,
        phone: customer && customer.phone,
        document: normalizeDocument(customer && customer.document),
      },
      items: Array.isArray(items) ? items : [],
      metadata: metadata && typeof metadata === 'object' ? metadata : {}
    };

    const _fetch = (typeof fetch !== 'undefined') ? fetch : (global && global.fetch) ? global.fetch : null;
    if (!_fetch) {
      console.error('fetch is not available in this runtime');
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
    return res.status(resp.status).json(json);
  } catch (err) {
    console.error('create-pix error', err);
    return res.status(500).json({ error: 'internal_error', detail: String(err) });
  }
}
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const { amount, items, customer, metadata, postback_url } = body;

    // Normalize amount into integer cents
    let amountCents = null;
    if (typeof amount === 'number') {
      // If already an integer, assume cents; otherwise treat as BRL and convert
      amountCents = Number.isInteger(amount) ? amount : Math.round(amount * 100);
    } else if (typeof amount === 'string') {
      const parsed = Number(amount.replace(',', '.'));
      if (!Number.isNaN(parsed)) amountCents = Math.round(parsed * 100);
    }

    if (!amountCents || amountCents <= 0) return res.status(400).json({ error: 'invalid_amount' });

    const publicKey = process.env.FREEPAY_PUBLIC_KEY;
    const secretKey = process.env.FREEPAY_SECRET_KEY;
    if (!publicKey || !secretKey) return res.status(500).json({ error: 'freepay_keys_missing' });

    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    const normalizeDocument = (doc) => {
      if (!doc) return undefined;
      if (typeof doc === 'string') {
        const onlyDigits = doc.replace(/\D/g, '');
        return { number: onlyDigits, type: onlyDigits.length === 11 ? 'cpf' : 'cnpj' };
      }
      if (typeof doc === 'object') {
        const number = String(doc.number || '').replace(/\D/g, '');
        const type = doc.type || (number.length === 11 ? 'cpf' : 'cnpj');
        return { number, type };
      }
      return undefined;
    };

    const fpPayload = {
      amount: amountCents,
      payment_method: 'pix',
      postback_url: postback_url || process.env.FREEPAY_POSTBACK_URL || undefined,
      customer: {
        name: (customer && customer.name) || undefined,
        email: (customer && customer.email) || undefined,
        phone: (customer && customer.phone) || undefined,
        document: normalizeDocument(customer && customer.document),
      },
      items: Array.isArray(items) ? items : [],
      metadata: (metadata && typeof metadata === 'object') ? metadata : {}
    };

    const resp = await fetch('https://api.freepaybrasil.com/v1/payment-transaction/create', {
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

    return res.status(resp.status).json(json);
  } catch (err) {
    console.error('create-pix error', err);
    return res.status(500).json({ error: 'internal_error', detail: String(err) });
  }
};
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const FREEPAY_PUBLIC = process.env.FREEPAY_PUBLIC_KEY;
  const FREEPAY_SECRET = process.env.FREEPAY_SECRET_KEY;
  if (!FREEPAY_PUBLIC || !FREEPAY_SECRET) {
    return res.status(500).json({ error: 'Freepay credentials not configured' });
  }

  let payload = req.body;
  if (!payload) payload = {};

  // Basic validation (amount must be integer cents)
  if (!payload.amount || typeof payload.amount !== 'number') {
    return res.status(400).json({ error: 'Invalid or missing amount (in cents integer)' });
  }
  if (!payload.payment_method) payload.payment_method = 'pix';
  if (!payload.postback_url) payload.postback_url = '';

  // Build auth header
  const auth = 'Basic ' + Buffer.from(`${FREEPAY_PUBLIC}:${FREEPAY_SECRET}`).toString('base64');

  try {
    const resp = await fetch('https://api.freepaybrasil.com/v1/payment-transaction/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': auth
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok) return res.status(resp.status || 500).json({ error: data || 'Freepay error' });

    return res.status(200).json({ data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const PUBLIC_KEY = process.env.FREEPAY_PUBLIC_KEY;
  const SECRET_KEY = process.env.FREEPAY_SECRET_KEY;

  try {
    const auth = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');
    const response = await axios.post(
      'https://api.freepaybrasil.com/v1/payment-transaction/create',
      req.body,
      {
        headers: {
          authorization: `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      }
    );
    res.status(200).json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
