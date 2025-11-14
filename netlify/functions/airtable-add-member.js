// netlify/functions/airtable-add-member.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body:'Method not allowed' };
  try {
    const { member } = JSON.parse(event.body || '{}');
    if (!member) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing member' }) };

    const base = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TABLE_NAME;
    const key = process.env.AIRTABLE_API_KEY;
    if (!base || !table || !key) return { statusCode: 500, body: JSON.stringify({ ok:false, message:'Airtable not configured' }) };

    const payload = { fields: {
      OrderID: member.orderId || '',
      Amount: member.amount || '',
      Name: member.name || '',
      Phone: member.phone || '',
      Email: member.email || '',
      Date: member.date || new Date().toISOString(),
      Verified: member.verified ? 'Yes' : 'No'
    }};

    const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await r.json();
    if (!r.ok) return { statusCode: 500, body: JSON.stringify({ ok:false, error: json }) };

    return { statusCode: 200, body: JSON.stringify({ ok:true, record: json }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
