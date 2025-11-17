// netlify/functions/login.js
const jwt = require('jsonwebtoken');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
  try {
    const { password } = JSON.parse(event.body || '{}');
    if (!password) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing password' }) };

    const expected = process.env.MEMBERS_PAGE_PASSWORD;
    if (!expected) return { statusCode: 500, body: JSON.stringify({ ok:false, message:'members password not configured' }) };

    if (password !== expected) return { statusCode: 401, body: JSON.stringify({ ok:false, message:'invalid' }) };

    const secret = process.env.JWT_SECRET || 'devsecret';
    const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '6h' });
    return { statusCode: 200, body: JSON.stringify({ ok:true, token }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};