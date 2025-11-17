// netlify/functions/check-status.js
const fetch = require('node-fetch');

exports.handler = async function(event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  try {
    const orderId = (event.queryStringParameters && event.queryStringParameters.orderId) || null;
    if (!orderId) return { statusCode: 400, headers, body: JSON.stringify({ ok:false, message:'missing orderId' }) };

    const base = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TABLE || process.env.AIRTABLE_TABLE_NAME || 'Payments';
    const key = process.env.AIRTABLE_API_KEY;
    if (!base || !table || !key) return { statusCode: 500, headers, body: JSON.stringify({ ok:false, message:'Airtable not configured' }) };

    const filter = `({OrderID}='${orderId.replace(/'/g, "\\'")}')`;
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?filterByFormula=${encodeURIComponent(filter)}&pageSize=1`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: 500, headers, body: JSON.stringify({ ok:false, message: 'airtable error', detail: txt }) };
    }
    const json = await res.json();
    const record = (json.records && json.records[0]) || null;
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, record }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
