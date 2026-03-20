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
    try { console.log('incoming create-pix body:', JSON.stringify(body)); } catch(e) {}
    const amount = body.amount;

    // helper to parse money-like values into integer cents
    const parseMoneyToCents = v => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 100);
      if (typeof v === 'string') {
        const cleaned = v.replace(/[^0-9,\.]/g, '').replace(',', '.');
        const parsed = Number(cleaned);
        if (!Number.isNaN(parsed)) return Math.round(parsed * 100);
      }
      return null;
    };

    // Normalize amount to integer cents if provided directly
    let amountCents = parseMoneyToCents(amount);

    const publicKey = process.env.FREEPAY_PUBLIC_KEY;
    const secretKey = process.env.FREEPAY_SECRET_KEY;
    if (!publicKey || !secretKey) return res.status(500).json({ error: 'freepay_keys_missing' });

    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    // Build Freepay payload with normalized values according to Freepay docs
    const fpPayload = { payment_method: 'pix' };

    // postback url from env if provided
    if (process.env.FREEPAY_POSTBACK_URL) fpPayload.postback_url = process.env.FREEPAY_POSTBACK_URL;

    // Normalize customer.document into object { type, number }
    if (body.customer) {
      const customer = Object.assign({}, body.customer);
      const doc = customer.document;
      if (doc) {
        if (typeof doc === 'string') {
          const digits = doc.replace(/\D/g, '');
          const type = digits.length === 11 ? 'cpf' : digits.length === 14 ? 'cnpj' : undefined;
          customer.document = { ...(type ? { type } : {}), number: digits };
        } else if (typeof doc === 'object' && doc.number) {
          const digits = String(doc.number).replace(/\D/g, '');
          const type = doc.type || (digits.length === 11 ? 'cpf' : digits.length === 14 ? 'cnpj' : undefined);
          customer.document = { ...(type ? { type } : {}), number: digits };
        }
      }
      fpPayload.customer = customer;
    }

    // Normalize items: ensure unit_price in cents and integer quantity
    if (Array.isArray(body.items) && body.items.length) {
      const items = body.items.map(it => {
        const unit = it.unit_price;
        let unitCents = 0;
        if (typeof unit === 'number') unitCents = Number.isInteger(unit) ? unit : Math.round(unit * 100);
        else if (typeof unit === 'string') {
          const parsed = Number(unit.replace(',', '.'));
          if (!Number.isNaN(parsed)) unitCents = Math.round(parsed * 100);
        }
        const quantity = Number.isNaN(Number(it.quantity)) ? 1 : Math.max(1, parseInt(it.quantity, 10));
        return {
          name: it.name || 'item',
          quantity,
          unit_price: unitCents,
          description: it.description,
          metadata: it.metadata
        };
      });
      fpPayload.items = items;
      // compute amount from items sum (in cents)
      const sum = items.reduce((s, it) => s + (Number(it.unit_price || 0) * Number(it.quantity || 0)), 0);
      fpPayload.amount = sum;
    } else {
      // fallback to provided amount (already normalized to cents)
      // try alternate keys if amount wasn't provided directly
      if (!amountCents) {
        const altKeys = ['total','price','preco','valor','value','ida_total','volta_total','calculatedAmount','total_out','total_in'];
        for (const k of altKeys) {
          if (body[k] != null) {
            amountCents = parseMoneyToCents(body[k]);
            if (amountCents) break;
          }
        }
      }

      // also check singular item fields
      if (!amountCents && body.item) {
        const it = body.item;
        amountCents = parseMoneyToCents(it.price || it.preco || it.unit_price || it.valor || it.total);
      }

      fpPayload.amount = amountCents;
    }

    // include metadata if present
    if (body.metadata) fpPayload.metadata = body.metadata;

    const _fetch = (typeof fetch !== 'undefined') ? fetch : (global && global.fetch) ? global.fetch : null;
    if (!_fetch) {
      console.error('fetch not available');
      return res.status(500).json({ error: 'fetch_not_available' });
    }

    // final validation for amount
    if (!fpPayload.amount || Number(fpPayload.amount) <= 0) return res.status(400).json({ error: 'invalid_amount' });

    try { console.log('fpPayload to send:', JSON.stringify(fpPayload)); } catch(e) {}

    const resp = await _fetch('https://api.freepaybrasil.com/v1/payment-transaction/create', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fpPayload)
    });
    const text = await resp.text();
    try { console.log('freepay response status:', resp.status, 'body:', text); } catch (e) {}
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
    return res.status(resp.status || 200).json(json);
  } catch (err) {
    console.error('create-pix error', err && err.stack || err);
    return res.status(500).json({ error: 'internal_error', detail: String(err) });
  }
};
