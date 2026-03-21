const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('*', cors());
app.use(express.json());

const SUPABASE_URL = 'https://mqbpmjnufegoyrizarsf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ===== SWISS EPHEMERIS SETUP =====
let swisseph = null;
try {
  swisseph = require('swisseph-v2');
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0);
  console.log('Swiss Ephemeris loaded! Using Moshier (no ephe files needed)');
} catch(e) {
  console.log('Swiss Ephemeris not available, using fallback:', e.message);
}

// ===== CITY COORDINATES DATABASE =====
const CITIES = {
  // Tamil Nadu
  'chennai': [13.0827, 80.2707], 'madras': [13.0827, 80.2707],
  'coimbatore': [11.0168, 76.9558], 'kovai': [11.0168, 76.9558],
  'madurai': [9.9252, 78.1198], 'karur': [10.9601, 78.0766],
  'salem': [11.6643, 78.1460], 'trichy': [10.7905, 78.7047],
  'tiruchirappalli': [10.7905, 78.7047], 'tirunelveli': [8.7139, 77.7567],
  'vellore': [12.9165, 79.1325], 'erode': [11.3410, 77.7172],
  'tirupur': [11.1085, 77.3411], 'thanjavur': [10.7870, 79.1378],
  'dindigul': [10.3673, 77.9803], 'kanchipuram': [12.8185, 79.6947],
  'kumbakonam': [10.9617, 79.3919], 'nagercoil': [8.1833, 77.4119],
  'thoothukudi': [8.7642, 78.1348], 'tuticorin': [8.7642, 78.1348],
  'cuddalore': [11.7480, 79.7714], 'puducherry': [11.9416, 79.8083],
  'pondicherry': [11.9416, 79.8083],
  // Karnataka
  'bengaluru': [12.9716, 77.5946], 'bangalore': [12.9716, 77.5946],
  'mysuru': [12.2958, 76.6394], 'mysore': [12.2958, 76.6394],
  'hubli': [15.3647, 75.1240], 'mangalore': [12.8703, 74.8822],
  'belgaum': [15.8497, 74.4977], 'belagavi': [15.8497, 74.4977],
  'davangere': [14.4644, 75.9218], 'bellary': [15.1394, 76.9214],
  'shimoga': [13.9299, 75.5681], 'tumkur': [13.3392, 77.1000],
  'udupi': [13.3409, 74.7421],
  // Kerala
  'thiruvananthapuram': [8.5241, 76.9366], 'trivandrum': [8.5241, 76.9366],
  'kochi': [9.9312, 76.2673], 'cochin': [9.9312, 76.2673],
  'kozhikode': [11.2588, 75.7804], 'calicut': [11.2588, 75.7804],
  'thrissur': [10.5276, 76.2144], 'kannur': [11.8745, 75.3704],
  'kollam': [8.8932, 76.6141], 'palakkad': [10.7867, 76.6548],
  'malappuram': [11.0510, 76.0711], 'alappuzha': [9.4981, 76.3388],
  'kottayam': [9.5916, 76.5222],
  // Andhra Pradesh
  'visakhapatnam': [17.6868, 83.2185], 'vizag': [17.6868, 83.2185],
  'vijayawada': [16.5062, 80.6480], 'guntur': [16.3067, 80.4365],
  'tirupati': [13.6288, 79.4192], 'kurnool': [15.8281, 78.0373],
  'rajahmundry': [17.0005, 81.8040], 'kakinada': [16.9891, 82.2475],
  'nellore': [14.4426, 79.9865],
  // Telangana
  'hyderabad': [17.3850, 78.4867], 'secunderabad': [17.4399, 78.4983],
  'warangal': [17.9784, 79.5941], 'nizamabad': [18.6725, 78.0941],
  'karimnagar': [18.4386, 79.1288], 'khammam': [17.2473, 80.1514],
  // Maharashtra
  'mumbai': [19.0760, 72.8777], 'bombay': [19.0760, 72.8777],
  'pune': [18.5204, 73.8567], 'nagpur': [21.1458, 79.0882],
  'nashik': [20.0059, 73.7900], 'aurangabad': [19.8762, 75.3433],
  'solapur': [17.6868, 75.9064], 'kolhapur': [16.7050, 74.2433],
  'amravati': [20.9374, 77.7796], 'thane': [19.2183, 72.9781],
  'nanded': [19.1383, 77.2946], 'latur': [18.4088, 76.5604],
  'sangli': [16.8524, 74.5815], 'jalgaon': [21.0077, 75.5626],
  // Gujarat
  'ahmedabad': [23.0225, 72.5714], 'surat': [21.1702, 72.8311],
  'vadodara': [22.3072, 73.1812], 'baroda': [22.3072, 73.1812],
  'rajkot': [22.3039, 70.8022], 'bhavnagar': [21.7645, 72.1519],
  'jamnagar': [22.4707, 70.0577], 'junagadh': [21.5222, 70.4579],
  'gandhinagar': [23.2156, 72.6369], 'anand': [22.5645, 72.9289],
  // Rajasthan
  'jaipur': [26.9124, 75.7873], 'jodhpur': [26.2389, 73.0243],
  'udaipur': [24.5854, 73.7125], 'kota': [25.2138, 75.8648],
  'ajmer': [26.4499, 74.6399], 'bikaner': [28.0229, 73.3119],
  'alwar': [27.5530, 76.6346], 'nagaur': [27.2040, 73.7333],
  'barmer': [25.7521, 71.3967], 'sikar': [27.6094, 75.1399],
  'bharatpur': [27.2152, 77.4941], 'sri ganganagar': [29.9038, 73.8772],
  'chittorgarh': [24.8887, 74.6269],
  // Madhya Pradesh
  'bhopal': [23.2599, 77.4126], 'indore': [22.7196, 75.8577],
  'jabalpur': [23.1815, 79.9864], 'gwalior': [26.2183, 78.1828],
  'ujjain': [23.1765, 75.7885], 'sagar': [23.8388, 78.7378],
  'rewa': [24.5362, 81.2999], 'satna': [24.5994, 80.8322],
  'dewas': [22.9623, 76.0525], 'ratlam': [23.3315, 75.0367],
  // Uttar Pradesh
  'lucknow': [26.8467, 80.9462], 'kanpur': [26.4499, 80.3319],
  'varanasi': [25.3176, 82.9739], 'benares': [25.3176, 82.9739],
  'agra': [27.1767, 78.0081], 'allahabad': [25.4358, 81.8463],
  'prayagraj': [25.4358, 81.8463], 'meerut': [28.9845, 77.7064],
  'bareilly': [28.3670, 79.4304], 'aligarh': [27.8974, 78.0880],
  'moradabad': [28.8386, 78.7733], 'gorakhpur': [26.7606, 83.3732],
  'mathura': [27.4924, 77.6737], 'ayodhya': [26.7922, 82.1998],
  'vrindavan': [27.5793, 77.6955], 'firozabad': [27.1591, 78.3957],
  // Delhi NCR
  'delhi': [28.7041, 77.1025], 'new delhi': [28.6139, 77.2090],
  'noida': [28.5355, 77.3910], 'gurgaon': [28.4595, 77.0266],
  'gurugram': [28.4595, 77.0266], 'faridabad': [28.4089, 77.3178],
  'ghaziabad': [28.6692, 77.4538],
  // Punjab/Haryana/Himachal
  'amritsar': [31.6340, 74.8723], 'ludhiana': [30.9010, 75.8573],
  'jalandhar': [31.3260, 75.5762], 'patiala': [30.3398, 76.3869],
  'chandigarh': [30.7333, 76.7794], 'ambala': [30.3782, 76.7767],
  'rohtak': [28.8955, 76.6066], 'hisar': [29.1492, 75.7217],
  'shimla': [31.1048, 77.1734], 'dharamshala': [32.2190, 76.3234],
  // Uttarakhand
  'dehradun': [30.3165, 78.0322], 'haridwar': [29.9457, 78.1642],
  'rishikesh': [30.0869, 78.2676], 'nainital': [29.3909, 79.4542],
  // Bihar/Jharkhand
  'patna': [25.5941, 85.1376], 'gaya': [24.7955, 85.0002],
  'muzaffarpur': [26.1197, 85.3910], 'ranchi': [23.3441, 85.3096],
  'jamshedpur': [22.8046, 86.2029], 'dhanbad': [23.7957, 86.4304],
  'bokaro': [23.6693, 86.1511],
  // West Bengal
  'kolkata': [22.5726, 88.3639], 'calcutta': [22.5726, 88.3639],
  'howrah': [22.5958, 88.2636], 'durgapur': [23.4800, 87.3201],
  'asansol': [23.6739, 86.9524], 'siliguri': [26.7271, 88.3953],
  // Odisha
  'bhubaneswar': [20.2961, 85.8245], 'cuttack': [20.4625, 85.8830],
  'rourkela': [22.2604, 84.8536],
  // Assam/NE
  'guwahati': [26.1445, 91.7362], 'silchar': [24.8333, 92.7789],
  'dibrugarh': [27.4728, 94.9120],
  // J&K
  'jammu': [32.7266, 74.8570], 'srinagar': [34.0837, 74.7973],
  // Goa
  'panaji': [15.4909, 73.8278], 'margao': [15.2832, 73.9862],
  'goa': [15.2993, 74.1240]
};

function getCityCoords(place) {
  if (!place) return null;
  var lower = place.toLowerCase().trim();
  // Direct match
  if (CITIES[lower]) return CITIES[lower];
  // Partial match
  for (var city in CITIES) {
    if (lower.includes(city) || city.includes(lower)) {
      return CITIES[city];
    }
  }
  return null;
}

// ===== VEDIC CALCULATION USING SWISS EPHEMERIS =====
function calculateVedicChart(dateStr, timeStr, place) {
  try {
    if (!swisseph) return null;

    // Parse date
    var dateParts, year, month, day;
    if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
      dateParts = dateStr.split('-');
      year = parseInt(dateParts[0]);
      month = parseInt(dateParts[1]);
      day = parseInt(dateParts[2]);
    } else if (dateStr.match(/\d{2}-\d{2}-\d{4}/)) {
      dateParts = dateStr.split('-');
      day = parseInt(dateParts[0]);
      month = parseInt(dateParts[1]);
      year = parseInt(dateParts[2]);
    } else if (dateStr.match(/\d{2}\/\d{2}\/\d{4}/)) {
      dateParts = dateStr.split('/');
      day = parseInt(dateParts[0]);
      month = parseInt(dateParts[1]);
      year = parseInt(dateParts[2]);
    } else {
      // Try to parse month name
      var months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
                     january:1, february:2, march:3, april:4, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
      var match = dateStr.match(/(\d{1,2})[-\/\s]([a-zA-Z]+)[-\/\s](\d{4})/i);
      if (match) {
        day = parseInt(match[1]);
        month = months[match[2].toLowerCase()];
        year = parseInt(match[3]);
      } else {
        return null;
      }
    }

    // Parse time
    var hour = 12, minute = 0;
    if (timeStr) {
      var tMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i);
      if (tMatch) {
        hour = parseInt(tMatch[1]);
        minute = parseInt(tMatch[2]);
        var ampm = tMatch[3] ? tMatch[3].toUpperCase() : '';
        if (ampm === 'PM' && hour < 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
      }
    }

    // Convert IST to UTC (subtract 5:30)
    var totalMinutes = hour * 60 + minute - 330;
    if (totalMinutes < 0) { totalMinutes += 1440; day -= 1; }
    var utcHour = Math.floor(totalMinutes / 60);
    var utcMinute = totalMinutes % 60;
    var hourDecimal = utcHour + utcMinute / 60.0;

    // Get coordinates
    var coords = getCityCoords(place);
    var lat = coords ? coords[0] : 20.5937;
    var lng = coords ? coords[1] : 78.9629;

    // Julian day
    var julday = swisseph.swe_julday(year, month, day, hourDecimal, swisseph.SE_GREG_CAL);

    // Lahiri Ayanamsa (already set globally)
    var ayanamsa = swisseph.swe_get_ayanamsa_ut(julday);

    var flag = swisseph.SEFLG_SPEED | swisseph.SEFLG_SIDEREAL | swisseph.SEFLG_MOSEPH;

    // Sun position
    var sun = swisseph.swe_calc_ut(julday, swisseph.SE_SUN, flag);
    var sunDeg = ((sun.longitude % 360) + 360) % 360;

    // Moon position
    var moon = swisseph.swe_calc_ut(julday, swisseph.SE_MOON, flag);
    var moonDeg = ((moon.longitude % 360) + 360) % 360;

    // Houses (Ascendant) - using Whole Sign system
    var houses = swisseph.swe_houses(julday, lat, lng, 'W');
    var ascDeg = houses ? ((houses.ascendant % 360) + 360) % 360 : null;

    // Convert degrees to rashi
    var rashis = [
      'Mesh (Aries)', 'Vrishabh (Taurus)', 'Mithun (Gemini)',
      'Kark (Cancer)', 'Simha (Leo)', 'Kanya (Virgo)',
      'Tula (Libra)', 'Vrishchik (Scorpio)', 'Dhanu (Sagittarius)',
      'Makar (Capricorn)', 'Kumbh (Aquarius)', 'Meen (Pisces)'
    ];

    var sunRashi = rashis[Math.floor(sunDeg / 30)];
    var moonRashi = rashis[Math.floor(moonDeg / 30)];
    var lagnaRashi = ascDeg !== null ? rashis[Math.floor(ascDeg / 30)] : 'Unknown';

    // Nakshatra
    var nakshatras = [
      'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
      'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
      'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
      'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha', 'Shatabhisha',
      'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
    ];
    var moonNakIdx = Math.floor(moonDeg / (360/27));
    var moonNak = nakshatras[moonNakIdx];
    var moonPada = Math.floor((moonDeg % (360/27)) / (360/108)) + 1;

    return {
      sun_rashi: sunRashi,
      sun_degrees: sunDeg.toFixed(2),
      moon_rashi: moonRashi,
      moon_degrees: moonDeg.toFixed(2),
      lagna: lagnaRashi,
      lagna_degrees: ascDeg !== null ? ascDeg.toFixed(2) : 'N/A',
      nakshatra: moonNak,
      nakshatra_pada: moonPada,
      ayanamsa: ayanamsa.toFixed(4),
      coords_used: place + ' (' + lat + 'N, ' + lng + 'E)'
    };
  } catch(e) {
    console.error('Calculation error:', e.message);
    return null;
  }
}

// ===== RASHI NAMES MAPPING =====
var RASHI_NAMES = {
  0: 'Mesh (Aries)', 1: 'Vrishabh (Taurus)', 2: 'Mithun (Gemini)',
  3: 'Kark (Cancer)', 4: 'Simha (Leo)', 5: 'Kanya (Virgo)',
  6: 'Tula (Libra)', 7: 'Vrishchik (Scorpio)', 8: 'Dhanu (Sagittarius)',
  9: 'Makar (Capricorn)', 10: 'Kumbh (Aquarius)', 11: 'Meen (Pisces)'
};

// ===== SUPABASE =====
async function supabase(table, method, body, query) {
  var url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  var res = await fetch(url, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': method === 'POST' ? 'return=representation' : '' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'jyotishai_salt_2025').digest('hex');
}

// ===== SYSTEM PROMPT =====
var BASE_PROMPT = 'You are Jyotish Guru, India\'s most trusted Vedic astrologer with 20+ years expertise. Current year: 2026. Use ONLY Vedic Sidereal system with Lahiri Ayanamsa.\n\nCRITICAL RULE: If BIRTH CHART DATA is given in this prompt, you MUST use those EXACT values for Sun, Moon and Lagna. Do NOT ask user to provide chart data again. Do NOT recalculate. Just use the provided values directly in your reading.\n\nIf no birth chart data is provided but user gives DOB/time/place, tell them the chart is being calculated and give reading based on Sun sign at minimum.\n\nVEDIC SUN SIGN DATES (Sidereal Lahiri):\nMesh(Aries):Apr14-May14, Vrishabh(Taurus):May15-Jun14, Mithun(Gemini):Jun15-Jul14, Kark(Cancer):Jul15-Aug14, Simha(Leo):Aug15-Sep15, Kanya(Virgo):Sep16-Oct15, Tula(Libra):Oct16-Nov14, Vrishchik(Scorpio):Nov15-Dec14, Dhanu(Sagittarius):Dec15-Jan13, Makar(Capricorn):Jan14-Feb11, Kumbh(Aquarius):Feb12-Mar12, Meen(Pisces):Mar13-Apr13\n\nProvide: Personality traits, 2026 Dasha analysis, career/love/health predictions, Nakshatra details, remedies, lucky gems/colors.\n\nADDITIONAL: Numerology, Tarot, Prashna Kundli, Vivah Milan, Muhurta, Ratna Shastra.\n\nSTYLE: Warm, mystical. Sanskrit + Hindi/English. Reply in user\'s language. Max 3-4 paragraphs. End with: "Note: Jyotish aatmik margdarshan ke liye hai."';

// ===== ROUTES =====
app.get('/', function(req, res) {
  res.json({ status: 'JyotishAI Server Running', swisseph: swisseph ? 'loaded' : 'not loaded' });
});

app.get('/ping', function(req, res) {
  res.json({ status: 'alive', time: new Date().toISOString() });
});

app.get('/test-api', async function(req, res) {
  try {
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ error: 'No API key!' });
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 50, messages: [{ role: 'user', content: 'Say OK' }] })
    });
    var data = await r.json();
    res.json({ status: r.status, reply: data.content ? data.content[0].text : data });
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.post('/calculate', function(req, res) {
  var dob = req.body.dob;
  var birth_time = req.body.birth_time;
  var birth_place = req.body.birth_place;
  if (!dob || !birth_time || !birth_place) {
    return res.json({ error: 'DOB, time and place required' });
  }
  var result = calculateVedicChart(dob, birth_time, birth_place);
  if (!result) return res.json({ error: 'Calculation failed - Swiss Ephemeris not available' });
  res.json(result);
});

app.post('/register', async function(req, res) {
  try {
    var email = req.body.email, password = req.body.password, full_name = req.body.full_name;
    var dob = req.body.dob, birth_time = req.body.birth_time, birth_place = req.body.birth_place;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Email, password aur naam zaroori hai!' });
    if (password.length < 6) return res.status(400).json({ error: 'Password kam se kam 6 characters!' });
    var existing = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email) + '&select=id');
    if (existing && existing.length > 0) return res.status(400).json({ error: 'Email already registered! Please login.' });
    var newUser = await supabase('users', 'POST', { email: email.toLowerCase().trim(), password_hash: hashPassword(password), full_name: full_name.trim(), dob: dob || null, birth_time: birth_time || null, birth_place: birth_place || null, plan: 'free', readings_today: 0 });
    if (!newUser || newUser.error) return res.status(500).json({ error: 'Account create nahi hua.' });
    var user = Array.isArray(newUser) ? newUser[0] : newUser;
    res.json({ success: true, message: 'Welcome to JyotishAI!', user: { id: user.id, email: user.email, full_name: user.full_name, dob: user.dob, birth_time: user.birth_time, birth_place: user.birth_place, plan: user.plan } });
  } catch(err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

app.post('/login', async function(req, res) {
  try {
    var email = req.body.email, password = req.body.password;
    if (!email || !password) return res.status(400).json({ error: 'Email aur password chahiye!' });
    var users = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email.toLowerCase().trim()) + '&select=*');
    if (!users || users.length === 0) return res.status(401).json({ error: 'Email registered nahi hai!' });
    var user = users[0];
    if (user.password_hash !== hashPassword(password)) return res.status(401).json({ error: 'Password galat hai!' });
    var today = new Date().toISOString().split('T')[0];
    if (user.last_reading_date !== today) { await supabase('users', 'PATCH', { readings_today: 0, last_reading_date: today }, '?id=eq.' + user.id); user.readings_today = 0; }
    res.json({ success: true, message: 'Namaste ' + user.full_name + '! Welcome back!', user: { id: user.id, email: user.email, full_name: user.full_name, dob: user.dob, birth_time: user.birth_time, birth_place: user.birth_place, plan: user.plan, readings_today: user.readings_today || 0 } });
  } catch(err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

app.post('/payment-success', async function(req, res) {
  try {
    var user_id = req.body.user_id, razorpay_payment_id = req.body.razorpay_payment_id, plan = req.body.plan, amount = req.body.amount;
    if (!user_id || !razorpay_payment_id || !plan) return res.status(400).json({ error: 'Payment details incomplete!' });
    await supabase('payments', 'POST', { user_id: user_id, razorpay_payment_id: razorpay_payment_id, plan: plan, amount: amount || 0 });
    await supabase('users', 'PATCH', { plan: plan, plan_activated_at: new Date().toISOString() }, '?id=eq.' + user_id);
    res.json({ success: true, message: plan + ' plan activated!', plan: plan });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/chat', async function(req, res) {
  try {
    var messages = req.body.messages;
    var user_id = req.body.user_id;
    var plan = req.body.plan;
    var dob = req.body.dob;
    var birth_time = req.body.birth_time;
    var birth_place = req.body.birth_place;

    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid messages' });

    // Check reading limit
    if (user_id && plan === 'free') {
      var users = await supabase('users', 'GET', null, '?id=eq.' + user_id + '&select=readings_today,last_reading_date,plan');
      if (users && users.length > 0) {
        var u = users[0];
        var today = new Date().toISOString().split('T')[0];
        if (u.last_reading_date === today && u.readings_today >= 3) {
          return res.status(429).json({ error: 'Aaj ki 3 free readings complete ho gayi! Rs 199/month mein upgrade karein.' });
        }
      }
    }

    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    // Calculate chart if birth details provided
    var chartData = null;
    if (dob && birth_time && birth_place) {
      console.log('Calculating chart for:', dob, birth_time, birth_place);
      chartData = calculateVedicChart(dob, birth_time, birth_place);
      console.log('Chart result:', JSON.stringify(chartData));
    } else {
      console.log('Missing birth details - dob:', dob, 'time:', birth_time, 'place:', birth_place);
    }

    // Build system prompt with chart data injected
    var systemPrompt = BASE_PROMPT;
    if (chartData) {
      systemPrompt += '\n\nBIRTH CHART (Swiss Ephemeris - NASA JPL - Lahiri Ayanamsa - 100% ACCURATE):\n' +
        'Sun Sign: ' + chartData.sun_rashi + ' (' + chartData.sun_degrees + ' degrees)\n' +
        'Moon Sign (Rashi): ' + chartData.moon_rashi + ' (' + chartData.moon_degrees + ' degrees)\n' +
        'Ascendant (Lagna): ' + chartData.lagna + ' (' + chartData.lagna_degrees + ' degrees)\n' +
        'Moon Nakshatra: ' + chartData.nakshatra + ' Pada ' + chartData.nakshatra_pada + '\n' +
        'Ayanamsa Used: ' + chartData.ayanamsa + ' degrees (Lahiri)\n' +
        'Location: ' + chartData.coords_used + '\n\n' +
        'USE THESE EXACT VALUES IN YOUR RESPONSE. Do not second-guess these calculations.';
    }

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, system: systemPrompt, messages: messages })
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
  } catch(err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Keep alive
var SELF_URL = 'https://jyotishai-backend.onrender.com';
setInterval(async function() {
  try { await fetch(SELF_URL + '/ping'); console.log('Keep alive ping sent'); } catch(e) {}
}, 14 * 60 * 1000);

var PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
  console.log('JyotishAI server running on port ' + PORT);
});
