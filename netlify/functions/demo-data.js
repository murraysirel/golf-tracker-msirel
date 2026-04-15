// netlify/functions/demo-data.js
// Returns pre-generated demo data (DEMO01 group) without any DB dependency.
// No auth required — called directly by the "Try the demo" button.

const { generateDemoData } = require('./seed-demo');

function makeCors(event) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': event?.headers?.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

exports.handler = async (event) => {
  const CORS = makeCors(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  try {
    const data = generateDemoData();
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  } catch (err) {
    console.error('demo-data error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
