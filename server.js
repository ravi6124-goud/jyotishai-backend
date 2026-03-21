const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('*', cors());
app.use(express.json());

const SUPABASE_URL = 'https://mqbpmjnufegoyrizarsf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ASTRO_KEY = process.env.ASTRO_API_KEY;

// ===== CITY DATABASE =====
const CITIES = {
  'chennai': [13.0827, 80.2707], 'madras': [13.0827, 80.2707],
  'coimbatore': [11.0168, 76.9558], 'kovai': [11.0168, 76.9558],
  'madurai': [9.9252, 78.1198], 'karur': [10.9601, 78.0766],
  'salem': [11.6643, 78.1460], 'trichy': [10.7905, 78.7047],
  'tiruchirappalli': [10.7905, 78.7047], 'tirunelveli': [8.7139, 77.7567],
  'vellore': [12.9165, 79.1325], 'erode': [11.3410, 77.7172],
  'tirupur': [11.1085, 77.3411], 'thanjavur': [10.7870, 79.1378],
  'dindigul': [10.3673, 77.9803], 'nagercoil': [8.1833, 77.4119],
  'bengaluru': [12.9716, 77.5946], 'bangalore': [12.9716, 77.5946],
  'mysuru': [12.2958, 76.6394], 'mysore': [12.2958, 76.6394],
  'hubli': [15.3647, 75.1240], 'mangalore': [12.8703, 74.8822],
  'belgaum': [15.8497, 74.4977], 'belagavi': [15.8497, 74.4977],
  'davangere': [14.4644, 75.9218], 'bellary': [15.1394, 76.9214],
  'thiruvananthapuram': [8.5241, 76.9366], 'trivandrum': [8.5241, 76.9366],
  'kochi': [9.9312, 76.2673], 'cochin': [9.9312, 76.2673],
  'kozhikode': [11.2588, 75.7804], 'calicut': [11.2588, 75.7804],
  'thrissur': [10.5276, 76.2144], 'kannur': [11.8745, 75.3704],
  'kollam': [8.8932, 76.6141], 'palakkad': [10.7867, 76.6548],
  'visakhapatnam': [17.6868, 83.2185], 'vizag': [17.6868, 83.2185],
  'vijayawada': [16.5062, 80.6480], 'guntur': [16.3067, 80.4365],
  'tirupati': [13.6288, 79.4192], 'kurnool': [15.8281, 78.0373],
  'hyderabad': [17.3850, 78.4867], 'secunderabad': [17.4399, 78.4983],
  'warangal': [17.9784, 79.5941], 'nizamabad': [18.6725, 78.0941],
  'mumbai': [19.0760, 72.8777], 'bombay': [19.0760, 72.8777],
  'pune': [18.5204, 73.8567], 'nagpur': [21.1458, 79.0882],
  'nashik': [20.0059, 73.7900], 'aurangabad': [19.8762, 75.3433],
  'solapur': [17.6868, 75.9064], 'kolhapur': [16.7050, 74.2433],
  'thane': [19.2183, 72.9781], 'nanded': [19.1383, 77.2946],
  'ahmedabad': [23.0225, 72.5714], 'surat': [21.1702, 72.8311],
  'vadodara': [22.3072, 73.1812], 'baroda': [22.3072, 73.1812],
  'rajkot': [22.3039, 70.8022], 'bhavnagar': [21.7645, 72.1519],
  'jamnagar': [22.4707, 70.0577], 'gandhinagar': [23.2156, 72.6369],
  'jaipur': [26.9124, 75.7873], 'jodhpur': [26.2389, 73.0243],
  'udaipur': [24.5854, 73.7125], 'kota': [25.2138, 75.8648],
  'ajmer': [26.4499, 74.6399], 'bikaner': [28.0229, 73.3119],
  'nagaur': [27.2040, 73.7333], 'alwar': [27.5530, 76.6346],
  'bhopal': [23.2599, 77.4126], 'indore': [22.7196, 75.8577],
  'jabalpur': [23.1815, 79.9864], 'gwalior': [26.2183, 78.1828],
  'ujjain': [23.1765, 75.7885],
  'lucknow': [26.8467, 80.9462], 'kanpur': [26.4499, 80.3319],
  'varanasi': [25.3176, 82.9739], 'benares': [25.3176, 82.9739],
  'agra': [27.1767, 78.0081], 'allahabad': [25.4358, 81.8463],
  'prayagraj': [25.4358, 81.8463], 'meerut': [28.9845, 77.7064],
  'gorakhpur': [26.7606, 83.3732], 'mathura': [27.4924, 77.6737],
  'ayodhya': [26.7922, 82.1998],
  'delhi': [28.7041, 77.1025], 'new delhi': [28.6139, 77.2090],
  'noida': [28.5355, 77.3910], 'gurgaon': [28.4595, 77.0266],
  'gurugram': [28.4595, 77.0266], 'faridabad': [28.4089, 77.3178],
  'amritsar': [31.6340, 74.8723], 'ludhiana': [30.9010, 75.8573],
  'jalandhar': [31.3260, 75.5762], 'chandigarh': [30.7333, 76.7794],
  'shimla': [31.1048, 77.1734], 'dehradun': [30.3165, 78.0322],
  'haridwar': [29.9457, 78.1642], 'rishikesh': [30.0869, 78.2676],
  'patna': [25.5941, 85.1376], 'gaya': [24.7955, 85.0002],
  'ranchi': [23.3441, 85.3096], 'jamshedpur': [22.8046, 86.2029],
  'kolkata': [22.5726, 88.3639], 'calcutta': [22.5726, 88.3639],
  'howrah': [22.5958, 88.2636], 'siliguri': [26.7271, 88.3953],
  'bhubaneswar': [20.2961, 85.8245], 'cuttack': [20.4625, 85.8830],
  'guwahati': [26.1445, 91.7362],
  'jammu': [32.7266, 74.8570], 'srinagar': [34.0837, 74.7973],
  'panaji': [15.4909, 73.8278], 'goa': [15.2993, 74.1240]
};

function getCityCoords(place) {
  if (!place) return null;
  var lower = place.toLowerCase().trim();
  if (CITIES[lower]) return CITIES[lower];
  for (var city in CITIES) {
    if (lower.includes(city) || city.includes(lower.split(',')[0].trim())) {
      return CITIES[city];
    }
  }
  return null;
}

// ===== PARSE DATE =====
function parseDate(dateStr) {
  if (!dateStr) return null;
  var months = {
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
    january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,
    october:10,november:11,december:12
  };

  // YYYY-MM-DD
  var m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };

  // DD-MM-YYYY or DD/MM/YYYY
  m = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return { year: +m[3], month: +m[2], day: +m[1] };

  // DD Month YYYY or DD-Month-YYYY
  m = dateStr.match(/(\d{1,2})[-\/\s]([a-zA-Z]+)[-\/\s](\d{4})/i);
  if (m) {
    var mn = months[m[2].toLowerCase().substring(0,3)];
    if (mn) return { year: +m[3], month: mn, day: +m[1] };
  }
  return null;
}

// ===== PARSE TIME =====
function parseTime(timeStr) {
  if (!timeStr) return null;
  var m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i);
  if (!m) return null;
  var h = +m[1], min = +m[2];
  var ampm = m[3] ? m[3].toUpperCase() : '';
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return { hours: h, minutes: min };
}

// ===== RASHI NAMES =====
var RASHIS = [
  'Mesh (Aries)', 'Vrishabh (Taurus)', 'Mithun (Gemini)', 'Kark (Cancer)',
  'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrishchik (Scorpio)',
  'Dhanu (Sagittarius)', 'Makar (Capricorn)', 'Kumbh (Aquarius)', 'Meen (Pisces)'
];

// planet id 0=sun,1=moon,2=mars,3=mercury,4=jupiter,5=venus,6=saturn
// lagna = id 100 or ascendant

async function calculateChart(dob, birth_time, birth_place) {
  try {
    var date = parseDate(dob);
    var time = parseTime(birth_time);
    if (!date || !time) {
      console.log('Parse failed - date:', date, 'time:', time);
      return null;
    }

    var coords = getCityCoords(birth_place);
    if (!coords) {
      console.log('City not found:', birth_place, '- using India center');
      coords = [20.5937, 78.9629];
    }

    console.log('Calling FreeAstrologyAPI for:', date, time, birth_place, coords);

    var payload = {
      year: date.year,
      month: date.month,
      date: date.day,
      hours: time.hours,
      minutes: time.minutes,
      seconds: 0,
      latitude: coords[0],
      longitude: coords[1],
      timezone: 5.5,
      settings: {
        observation_point: 'topocentric',
        ayanamsha: 'lahiri'
      }
    };

    var response = await fetch('https://json.freeastrologyapi.com/planets/extended', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ASTRO_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.log('API error:', response.status);
      return null;
    }

    var data = await response.json();
    console.log('API response received, keys:', Object.keys(data));

    // Extract Sun, Moon, Ascendant
    var planets = data.output || data;
    var sunData = null, moonData = null, lagnaData = null;

    if (Array.isArray(planets)) {
      for (var p of planets) {
        if (p.id === 0 || p.name === 'Sun') sunData = p;
        if (p.id === 1 || p.name === 'Moon') moonData = p;
        if (p.id === 100 || p.name === 'Ascendant' || p.name === 'Lagna') lagnaData = p;
      }
    } else if (data.planets) {
      for (var p of data.planets) {
        if (p.id === 0 || p.name === 'Sun') sunData = p;
        if (p.id === 1 || p.name === 'Moon') moonData = p;
        if (p.id === 100 || p.name === 'Ascendant') lagnaData = p;
      }
    }

    // Build result
    var result = {};

    if (sunData) {
      var sunRashiIdx = sunData.zodiac_sign_id !== undefined ? sunData.zodiac_sign_id :
                        sunData.rasi_id !== undefined ? sunData.rasi_id :
                        Math.floor((sunData.normDegree || sunData.degree || 0) / 30);
      result.sun_rashi = RASHIS[sunRashiIdx] || sunData.zodiac_sign || sunData.rasi || 'Unknown';
      result.sun_degrees = (sunData.normDegree || sunData.degree || 0).toFixed(2);
    }

    if (moonData) {
      var moonRashiIdx = moonData.zodiac_sign_id !== undefined ? moonData.zodiac_sign_id :
                         moonData.rasi_id !== undefined ? moonData.rasi_id :
                         Math.floor((moonData.normDegree || moonData.degree || 0) / 30);
      result.moon_rashi = RASHIS[moonRashiIdx] || moonData.zodiac_sign || moonData.rasi || 'Unknown';
      result.moon_degrees = (moonData.normDegree || moonData.degree || 0).toFixed(2);
      result.nakshatra = moonData.nakshatra || moonData.nakshatraName || '';
      result.nakshatra_pada = moonData.nakshatra_pada || moonData.pada || '';
    }

    if (lagnaData) {
      var lagnaRashiIdx = lagnaData.zodiac_sign_id !== undefined ? lagnaData.zodiac_sign_id :
                          lagnaData.rasi_id !== undefined ? lagnaData.rasi_id :
                          Math.floor((lagnaData.normDegree || lagnaData.degree || 0) / 30);
      result.lagna = RASHIS[lagnaRashiIdx] || lagnaData.zodiac_sign || lagnaData.rasi || 'Unknown';
      result.lagna_degrees = (lagnaData.normDegree || lagnaData.degree || 0).toFixed(2);
    }

    result.location = birth_place + ' (' + coords[0] + 'N, ' + coords[1] + 'E)';
    result.source = 'FreeAstrologyAPI - Lahiri Ayanamsa';

    console.log('Chart result:', JSON.stringify(result));
    return result;

  } catch(e) {
    console.error('Chart calculation error:', e.message);
    return null;
  }
}

// ===== SUPABASE =====
async function supabase(table, method, body, query) {
  var url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  var res = await fetch(url, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': method === 'POST' ? 'return=representation' : '' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function hashPassword(p) {
  return crypto.createHash('sha256').update(p + 'jyotishai_salt_2025').digest('hex');
}

// ===== SYSTEM PROMPT =====
var BASE_PROMPT = 'You are Jyotish Guru, India\'s most accurate Vedic astrologer. Current year: 2026. Lahiri Ayanamsa Vedic Sidereal system only.\n\nCRITICAL: When BIRTH CHART DATA is shown below, USE THOSE EXACT VALUES immediately. Do NOT ask user for chart details again. Do NOT say "I need your chart". Just give the reading directly using those values.\n\nVEDIC SUN SIGN DATES (Lahiri Sidereal - NOT Western):\nMesh(Aries):Apr14-May14, Vrishabh(Taurus):May15-Jun14, Mithun(Gemini):Jun15-Jul14, Kark(Cancer):Jul15-Aug14, Simha(Leo):Aug15-Sep15, Kanya(Virgo):Sep16-Oct15, Tula(Libra):Oct16-Nov14, Vrishchik(Scorpio):Nov15-Dec14, Dhanu(Sagittarius):Dec15-Jan13, Makar(Capricorn):Jan14-Feb11, Kumbh(Aquarius):Feb12-Mar12, Meen(Pisces):Mar13-Apr13\n\nServices: Kundli, Dasha 2026, Nakshatra, Numerology, Tarot, Prashna, Vivah Milan, Muhurta, Ratna.\nStyle: Warm, mystical. Sanskrit+Hindi/English. Reply in user\'s language. 3-4 paragraphs. End: "Note: Jyotish aatmik margdarshan ke liye hai."';

// ===== ROUTES =====
app.get('/', function(req, res) {
  res.json({ status: 'JyotishAI Server Running', astro_api: ASTRO_KEY ? 'configured' : 'missing' });
});

app.get('/ping', function(req, res) {
  res.json({ status: 'alive', time: new Date().toISOString() });
});

app.get('/test-api', async function(req, res) {
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 50, messages: [{ role: 'user', content: 'Say OK' }] })
    });
    var d = await r.json();
    res.json({ status: r.status, reply: d.content ? d.content[0].text : d });
  } catch(e) { res.json({ error: e.message }); }
});

app.post('/calculate', async function(req, res) {
  var result = await calculateChart(req.body.dob, req.body.birth_time, req.body.birth_place);
  if (!result) return res.json({ error: 'Calculation failed' });
  res.json(result);
});

app.post('/register', async function(req, res) {
  try {
    var { email, password, full_name, dob, birth_time, birth_place } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Email, password aur naam zaroori hai!' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters!' });
    var ex = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email) + '&select=id');
    if (ex && ex.length > 0) return res.status(400).json({ error: 'Email already registered!' });
    var nu = await supabase('users', 'POST', { email: email.toLowerCase().trim(), password_hash: hashPassword(password), full_name: full_name.trim(), dob: dob||null, birth_time: birth_time||null, birth_place: birth_place||null, plan: 'free', readings_today: 0 });
    if (!nu || nu.error) return res.status(500).json({ error: 'Account create nahi hua.' });
    var user = Array.isArray(nu) ? nu[0] : nu;
    res.json({ success: true, message: 'Welcome to JyotishAI!', user: { id: user.id, email: user.email, full_name: user.full_name, dob: user.dob, birth_time: user.birth_time, birth_place: user.birth_place, plan: user.plan } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/login', async function(req, res) {
  try {
    var { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email aur password chahiye!' });
    var users = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email.toLowerCase().trim()) + '&select=*');
    if (!users || users.length === 0) return res.status(401).json({ error: 'Email registered nahi hai!' });
    var user = users[0];
    if (user.password_hash !== hashPassword(password)) return res.status(401).json({ error: 'Password galat hai!' });
    var today = new Date().toISOString().split('T')[0];
    if (user.last_reading_date !== today) { await supabase('users', 'PATCH', { readings_today: 0, last_reading_date: today }, '?id=eq.' + user.id); user.readings_today = 0; }
    res.json({ success: true, message: 'Namaste ' + user.full_name + '! Welcome back!', user: { id: user.id, email: user.email, full_name: user.full_name, dob: user.dob, birth_time: user.birth_time, birth_place: user.birth_place, plan: user.plan, readings_today: user.readings_today || 0 } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment-success', async function(req, res) {
  try {
    var { user_id, razorpay_payment_id, plan, amount } = req.body;
    if (!user_id || !razorpay_payment_id || !plan) return res.status(400).json({ error: 'Payment details incomplete!' });
    await supabase('payments', 'POST', { user_id, razorpay_payment_id, plan, amount: amount||0 });
    await supabase('users', 'PATCH', { plan, plan_activated_at: new Date().toISOString() }, '?id=eq.' + user_id);
    res.json({ success: true, message: plan + ' plan activated!', plan });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/chat', async function(req, res) {
  try {
    var { messages, user_id, plan, dob, birth_time, birth_place } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid messages' });

    // Check reading limit
    if (user_id && plan === 'free') {
      var users = await supabase('users', 'GET', null, '?id=eq.' + user_id + '&select=readings_today,last_reading_date');
      if (users && users.length > 0) {
        var u = users[0];
        var today = new Date().toISOString().split('T')[0];
        if (u.last_reading_date === today && u.readings_today >= 3) {
          return res.status(429).json({ error: 'Aaj ki 3 free readings complete ho gayi! Rs 199/month mein upgrade karein.' });
        }
      }
    }

    // Calculate chart
    var chartData = null;
    if (dob && birth_time && birth_place) {
      chartData = await calculateChart(dob, birth_time, birth_place);
    }

    // Build system prompt
    var systemPrompt = BASE_PROMPT;
    if (chartData) {
      systemPrompt += '\n\n====== BIRTH CHART (FreeAstrologyAPI - Lahiri Ayanamsa - 100% ACCURATE) ======\n';
      if (chartData.sun_rashi) systemPrompt += 'SUN SIGN: ' + chartData.sun_rashi + ' (' + chartData.sun_degrees + ' deg)\n';
      if (chartData.moon_rashi) systemPrompt += 'MOON SIGN (RASHI): ' + chartData.moon_rashi + ' (' + chartData.moon_degrees + ' deg)\n';
      if (chartData.lagna) systemPrompt += 'ASCENDANT (LAGNA): ' + chartData.lagna + ' (' + chartData.lagna_degrees + ' deg)\n';
      if (chartData.nakshatra) systemPrompt += 'NAKSHATRA: ' + chartData.nakshatra + (chartData.nakshatra_pada ? ' Pada ' + chartData.nakshatra_pada : '') + '\n';
      systemPrompt += 'LOCATION: ' + chartData.location + '\n';
      systemPrompt += '====== USE THESE EXACT VALUES. START READING NOW. ======';
    }

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, system: systemPrompt, messages })
    });
    var data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error ? data.error.message : 'API Error' });

    // Update reading count
    if (user_id && plan === 'free') {
      var today2 = new Date().toISOString().split('T')[0];
      var users2 = await supabase('users', 'GET', null, '?id=eq.' + user_id + '&select=readings_today,last_reading_date');
      if (users2 && users2.length > 0) {
        var u2 = users2[0];
        var count = u2.last_reading_date === today2 ? (u2.readings_today || 0) + 1 : 1;
        await supabase('users', 'PATCH', { readings_today: count, last_reading_date: today2 }, '?id=eq.' + user_id);
      }
    }

    res.json({ reply: data.content[0].text, chart: chartData });
  } catch(e) {
    console.error('Chat error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Keep alive
setInterval(async function() {
  try { await fetch('https://jyotishai-backend.onrender.com/ping'); console.log('Keep alive ping sent'); } catch(e) {}
}, 14 * 60 * 1000);

var PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
  console.log('JyotishAI server running on port ' + PORT);
  console.log('ASTRO_API_KEY:', ASTRO_KEY ? 'SET' : 'MISSING');
});
