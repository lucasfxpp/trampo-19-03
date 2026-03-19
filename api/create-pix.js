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
