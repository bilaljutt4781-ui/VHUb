// netlify/functions/airtable-check-verify.js
const fetch = require('node-fetch');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
  try {
    const { telegram, otp, createMember } = JSON.parse(event.body || '{}');
    if (!telegram || !otp) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing fields' }) };

    const base = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_TABLE;
    const key = process.env.AIRTABLE_API_KEY;
    if (!base || !table || !key) return { statusCode: 500, body: JSON.stringify({ ok:false, message: 'Airtable not configured' }) };

    const filter = `AND({Type}='OTP',{Telegram}='${telegram.replace("'", "\\'")}',{OTP}='${otp.replace("'", "\\'")}')`;
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?filterByFormula=${encodeURIComponent(filter)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const json = await r.json();
    if (!r.ok) return { statusCode: 500, body: JSON.stringify({ ok:false, error: json }) };

    const rec = (json.records || [])[0];
    if (!rec) return { statusCode: 404, body: JSON.stringify({ ok:false, message:'otp_not_found' }) };

    // mark Verified = Yes
    const patchUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${rec.id}`;
    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { Verified: 'Yes' } })
    });

    // optionally create member record if createMember object provided
    if (createMember && typeof createMember === 'object') {
      const memberPayload = {
        fields: {
          OrderID: createMember.orderId || '',
          Amount: createMember.amount || '',
          Name: createMember.name || '',
          Phone: createMember.phone || '',
          Email: createMember.email || '',
          Date: new Date().toISOString(),
          Verified: 'Yes'
        }
      };
      await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(memberPayload)
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, message:'verified' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};