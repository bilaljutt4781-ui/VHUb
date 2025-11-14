// netlify/functions/airtable-check-verify.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body:'Method not allowed' };
  try {
    const { telegram, otp, createMember } = JSON.parse(event.body || '{}');
    if (!telegram || !otp) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing fields' }) };

    const base = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TABLE_NAME;
    const key = process.env.AIRTABLE_API_KEY;
    if (!base || !table || !key) return { statusCode: 500, body: JSON.stringify({ ok:false, message:'Airtable not configured' }) };

    const filter = `AND({Type}='OTP',{Telegram}='${telegram}',{OTP}='${otp}')`;
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?filterByFormula=${encodeURIComponent(filter)}`;

    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const json = await r.json();
    const rec = (json.records || [])[0];
    if (!rec) return { statusCode: 404, body: JSON.stringify({ ok:false, message:'otp_not_found' }) };

    // mark OTP row Verified = Yes
    await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ fields: { Verified: 'Yes' } })
    });

    // Optionally create a member record if createMember object provided
    if (createMember && typeof createMember === 'object') {
      const memberPayload = { fields: {
        OrderID: createMember.orderId || '',
        Amount: createMember.amount || '',
        Name: createMember.name || '',
        Phone: createMember.phone || '',
        Email: createMember.email || '',
        Date: new Date().toISOString(),
        Verified: 'Yes'
      }};
      await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type':'application/json' },
        body: JSON.stringify(memberPayload)
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, message:'verified' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
