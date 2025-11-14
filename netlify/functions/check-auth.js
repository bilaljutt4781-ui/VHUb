// netlify/functions/check-auth.js
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  const auth = (event.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ ok:false, message:'missing token' }) };
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    return { statusCode: 200, body: JSON.stringify({ ok:true, decoded }) };
  } catch (err) {
    return { statusCode: 401, body: JSON.stringify({ ok:false, message:'invalid token' }) };
  }
};
