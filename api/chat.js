module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  var body = req.body;
  var messages = body.messages;
  var system = body.system;
  var sessionId = body.session_id;
  var turnCount = body.turn_count || 0;
  var apiKey = process.env.ANTHROPIC_API_KEY;
  var supabaseUrl = 'https://csijnoonsdyppxpmbtpx.supabase.co';
  var supabaseKey = 'sb_publishable_85WrMl95Q9po_rapfgt38A_UXcY5Ueb';

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: system,
        messages: messages
      })
    });
    var data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error ? data.error.message : 'API error' });
    }
    var text = '抱歉，我現在沒辦法回應，請再試一次。';
    if (data.content && data.content[0] && data.content[0].text) {
      text = data.content[0].text;
    }

    // 儲存到Supabase
    if (sessionId && turnCount > 0) {
      fetch(supabaseUrl + '/rest/v1/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          session_id: sessionId,
          turn_count: turnCount,
          api_calls: body.api_calls || 1,
          messages: messages.slice(-4)
        })
      }).catch(function(e) { console.log('Supabase save failed:', e); });
    }

    return res.status(200).json({ text: text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
