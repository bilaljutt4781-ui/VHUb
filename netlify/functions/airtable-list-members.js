// netlify/functions/airtable-list-members.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const base = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TABLE_NAME;
    const key = process.env.AIRTABLE_API_KEY;
    if (!base || !table || !key) return { statusCode: 500, body: JSON.stringify({ ok:false, message: 'Airtable not configured' }) };

    const params = new URLSearchParams({ pageSize: '100', sort: 'Date' });
    const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    const json = await r.json();
    if (!r.ok) return { statusCode: 500, body: JSON.stringify({ ok:false, error: json }) };

    const list = (json.records || []).map(rec => ({ id: rec.id, ...rec.fields }));
    return { statusCode: 200, body: JSON.stringify({ ok:true, members: list }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
