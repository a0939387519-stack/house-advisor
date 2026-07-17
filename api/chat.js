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
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: [
          {
            type: 'text',
            text: system,
            cache_control: {type: 'ephemeral'}
          }
        ],
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

// 記錄usage到Supabase
    console.log('sessionId:', sessionId, 'usage:', data.usage ? JSON.stringify(data.usage) : 'none');
    if (sessionId && data.usage) {
      fetch(supabaseUrl + '/rest/v1/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey
        },
        body: JSON.stringify({
          session_id: sessionId,
          turn_count: turnCount,
          input_tokens: data.usage.input_tokens || 0,
          output_tokens: data.usage.output_tokens || 0,
          cache_read_tokens: data.usage.cache_read_input_tokens || 0,
          cache_write_tokens: data.usage.cache_creation_input_tokens || 0
        })
      }).catch(function(e) { console.log('Supabase save failed:', e); });
    }

    return res.status(200).json({ 
      text: text,
      usage: data.usage
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
