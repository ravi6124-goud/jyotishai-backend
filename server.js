const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('*', cors());
app.use(express.json());

const SUPABASE_URL = 'https://mqbpmjnufegoyrizarsf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabase(table, method, body, query) {
  const url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  const res = await fetch(url, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function hashPassword(p) {
  return crypto.createHash('sha256').update(p + 'jyotishai_salt_2025').digest('hex');
}

// ============================================================
// ACCURATE VEDIC ASTROLOGY CALCULATOR
// Uses Swiss Ephemeris algorithm approximation with Lahiri Ayanamsa
// ============================================================

const RASHIS = ['Mesh','Vrishabh','Mithun','Kark','Simha','Kanya','Tula','Vrishchik','Dhanu','Makar','Kumbh','Meen'];
const RASHI_EN = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const NAKSHATRAS = ['Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];
const NAKSHATRA_LORDS = ['Ketu','Shukra','Surya','Chandra','Mangal','Rahu','Guru','Shani','Budh','Ketu','Shukra','Surya','Chandra','Mangal','Rahu','Guru','Shani','Budh','Ketu','Shukra','Surya','Chandra','Mangal','Rahu','Guru','Shani','Budh'];

// Convert date/time to Julian Day Number
function toJulianDay(year, month, day, hour, minute, tzOffset) {
  const utcHour = hour + minute/60 - tzOffset;
  let y = year, m = month, d = day + utcHour/24;
  if (m <= 2) { y--; m += 12; }
  const A = Math.floor(y/100);
  const B = 2 - A + Math.floor(A/4);
  return Math.floor(365.25*(y+4716)) + Math.floor(30.6001*(m+1)) + d + B - 1524.5;
}

// Get Lahiri Ayanamsa for a given Julian Day
function getLahiriAyanamsa(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  // Lahiri ayanamsa formula
  return 23.85 + 0.0137 * T + 0.000053 * T * T;
}

// Calculate Sun's tropical longitude
function getSunLongitude(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mrad = M * Math.PI / 180;
  const C = (1.914602 - 0.004817*T - 0.000014*T*T) * Math.sin(Mrad)
           + (0.019993 - 0.000101*T) * Math.sin(2*Mrad)
           + 0.000289 * Math.sin(3*Mrad);
  let sunLon = L0 + C;
  sunLon = sunLon % 360;
  if (sunLon < 0) sunLon += 360;
  return sunLon;
}

// Calculate Moon's tropical longitude
function getMoonLongitude(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const L1 = 218.3164477 + 481267.88123421*T - 0.0015786*T*T + T*T*T/538841 - T*T*T*T/65194000;
  const D = 297.8501921 + 445267.1114034*T - 0.0018819*T*T + T*T*T/545868 - T*T*T*T/113065000;
  const M = 357.5291092 + 35999.0502909*T - 0.0001536*T*T + T*T*T/24490000;
  const Mp = 134.9633964 + 477198.8675055*T + 0.0087414*T*T + T*T*T/69699 - T*T*T*T/14712000;
  const F = 93.2720950 + 483202.0175233*T - 0.0036539*T*T - T*T*T/3526000 + T*T*T*T/863310000;

  const toRad = x => x * Math.PI / 180;
  let lon = L1
    + 6.288774 * Math.sin(toRad(Mp))
    + 1.274027 * Math.sin(toRad(2*D - Mp))
    + 0.658314 * Math.sin(toRad(2*D))
    + 0.213618 * Math.sin(toRad(2*Mp))
    - 0.185116 * Math.sin(toRad(M))
    - 0.114332 * Math.sin(toRad(2*F))
    + 0.058793 * Math.sin(toRad(2*D - 2*Mp))
    + 0.057066 * Math.sin(toRad(2*D - M - Mp))
    + 0.053322 * Math.sin(toRad(2*D + Mp))
    + 0.045758 * Math.sin(toRad(2*D - M))
    - 0.040923 * Math.sin(toRad(M - Mp))
    - 0.034720 * Math.sin(toRad(D))
    - 0.030383 * Math.sin(toRad(M + Mp))
    + 0.015327 * Math.sin(toRad(2*D - 2*F))
    - 0.012528 * Math.sin(toRad(Mp + 2*F))
    + 0.010980 * Math.sin(toRad(Mp - 2*F))
    + 0.010675 * Math.sin(toRad(4*D - Mp))
    + 0.010034 * Math.sin(toRad(3*Mp))
    + 0.008548 * Math.sin(toRad(4*D - 2*Mp))
    - 0.007888 * Math.sin(toRad(2*D + M - Mp))
    - 0.006766 * Math.sin(toRad(2*D + M))
    - 0.005163 * Math.sin(toRad(D - Mp));

  lon = lon % 360;
  if (lon < 0) lon += 360;
  return lon;
}

// Calculate Ascendant (Lagna)
function getAscendant(jd, latDeg, lonDeg) {
  const T = (jd - 2451545.0) / 36525.0;
  // GMST in degrees
  let GMST = 280.46061837 + 360.98564736629*(jd - 2451545.0) + 0.000387933*T*T - T*T*T/38710000;
  GMST = GMST % 360;
  if (GMST < 0) GMST += 360;
  // Local Sidereal Time
  const LST = (GMST + lonDeg) % 360;
  // Obliquity of ecliptic
  const eps = (23.439291111 - 0.013004167*T) * Math.PI / 180;
  const LSTrad = LST * Math.PI / 180;
  const latRad = latDeg * Math.PI / 180;
  // Ascendant formula
  let asc = Math.atan2(Math.cos(LSTrad), -(Math.sin(LSTrad)*Math.cos(eps) + Math.tan(latRad)*Math.sin(eps)));
  asc = asc * 180 / Math.PI;
  if (asc < 0) asc += 360;
  return asc;
}

// Convert tropical to sidereal (Vedic)
function tropicalToSidereal(tropLon, jd) {
  const ayanamsa = getLahiriAyanamsa(jd);
  let sid = tropLon - ayanamsa;
  if (sid < 0) sid += 360;
  if (sid >= 360) sid -= 360;
  return sid;
}

function getRashi(siderealDeg) {
  const idx = Math.floor(siderealDeg / 30) % 12;
  return { idx, name: RASHIS[idx], nameEn: RASHI_EN[idx], deg: siderealDeg % 30 };
}

function getNakshatra(siderealMoonDeg) {
  const idx = Math.floor(siderealMoonDeg / (360/27)) % 27;
  const pada = Math.floor((siderealMoonDeg % (360/27)) / (360/108)) + 1;
  return { name: NAKSHATRAS[idx], lord: NAKSHATRA_LORDS[idx], pada };
}

// Get city coordinates - common Indian cities
function getCityCoords(place) {
  const p = place.toLowerCase();
  const cities = {
    'mumbai':      [19.0760, 72.8777, 5.5],
    'delhi':       [28.6139, 77.2090, 5.5],
    'bangalore':   [12.9716, 77.5946, 5.5],
    'bengaluru':   [12.9716, 77.5946, 5.5],
    'chennai':     [13.0827, 80.2707, 5.5],
    'kolkata':     [22.5726, 88.3639, 5.5],
    'hyderabad':   [17.3850, 78.4867, 5.5],
    'pune':        [18.5204, 73.8567, 5.5],
    'ahmedabad':   [23.0225, 72.5714, 5.5],
    'jaipur':      [26.9124, 75.7873, 5.5],
    'nagpur':      [21.1458, 79.0882, 5.5],
    'lucknow':     [26.8467, 80.9462, 5.5],
    'nagaur':      [27.2000, 73.7333, 5.5],
    'coimbatore':  [11.0168, 76.9558, 5.5],
    'surat':       [21.1702, 72.8311, 5.5],
    'indore':      [22.7196, 75.8577, 5.5],
    'bhopal':      [23.2599, 77.4126, 5.5],
    'patna':       [25.5941, 85.1376, 5.5],
    'vadodara':    [22.3072, 73.1812, 5.5],
    'agra':        [27.1767, 78.0081, 5.5],
    'varanasi':    [25.3176, 82.9739, 5.5],
    'kanpur':      [26.4499, 80.3319, 5.5],
    'rajkot':      [22.3039, 70.8022, 5.5],
    'amritsar':    [31.6340, 74.8723, 5.5],
    'jodhpur':     [26.2389, 73.0243, 5.5],
    'kochi':       [9.9312,  76.2673, 5.5],
    'visakhapatnam':[17.6868,83.2185, 5.5],
    'mysuru':      [12.2958, 76.6394, 5.5],
    'mysore':      [12.2958, 76.6394, 5.5],
    'default':     [20.5937, 78.9629, 5.5] // India center
  };
  for (const key of Object.keys(cities)) {
    if (p.includes(key)) return cities[key];
  }
  return cities['default'];
}

function parseDate(dob) {
  // Accepts: DD/MM/YYYY or YYYY-MM-DD or DD-MM-YYYY
  if (!dob) return null;
  const parts = dob.split(/[-\/]/);
  if (parts.length !== 3) return null;
  let day, month, year;
  if (parts[0].length === 4) { year=+parts[0]; month=+parts[1]; day=+parts[2]; }
  else { day=+parts[0]; month=+parts[1]; year=+parts[2]; }
  if (!day||!month||!year) return null;
  return { day, month, year };
}

function parseTime(timeStr) {
  if (!timeStr) return { hour: 12, minute: 0 };
  const t = timeStr.replace(/[ap]m/gi,'').trim();
  const parts = t.split(':');
  let hour = +parts[0]||12, minute = +parts[1]||0;
  if (/pm/i.test(timeStr) && hour !== 12) hour += 12;
  if (/am/i.test(timeStr) && hour === 12) hour = 0;
  return { hour, minute };
}

// MAIN CALCULATION FUNCTION
function calculateVedicChart(dob, timeStr, place) {
  const date = parseDate(dob);
  if (!date) return null;
  const time = parseTime(timeStr);
  const [lat, lon, tz] = getCityCoords(place || '');

  const jd = toJulianDay(date.year, date.month, date.day, time.hour, time.minute, tz);

  const sunTrop = getSunLongitude(jd);
  const moonTrop = getMoonLongitude(jd);
  const ascTrop = timeStr ? getAscendant(jd, lat, lon) : null;

  const sunSid = tropicalToSidereal(sunTrop, jd);
  const moonSid = tropicalToSidereal(moonTrop, jd);
  const ascSid = ascTrop !== null ? tropicalToSidereal(ascTrop, jd) : null;

  const sunRashi = getRashi(sunSid);
  const moonRashi = getRashi(moonSid);
  const ascRashi = ascSid !== null ? getRashi(ascSid) : null;
  const nakshatra = getNakshatra(moonSid);
  const ayanamsa = getLahiriAyanamsa(jd).toFixed(2);

  return {
    sunRashi, moonRashi, ascRashi, nakshatra, ayanamsa,
    sunDeg: sunSid.toFixed(2), moonDeg: moonSid.toFixed(2),
    lat, lon, tz
  };
}

// ============================================================
// AUTH ROUTES
// ============================================================
app.get('/', (req, res) => res.json({ status: 'JyotishAI Server Running 🔮' }));
app.get('/ping', (req, res) => res.json({ status: 'alive', time: new Date().toISOString() }));

app.post('/register', async function(req, res) {
  try {
    const { email, password, full_name, dob, birth_time, birth_place } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Email, password aur naam zaroori hai!' });
    if (password.length < 6) return res.status(400).json({ error: 'Password kam se kam 6 characters ka hona chahiye!' });
    const existing = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email) + '&select=id');
    if (existing && existing.length > 0) return res.status(400).json({ error: 'Ye email pehle se registered hai! Login karein.' });
    const newUser = await supabase('users', 'POST', {
      email: email.toLowerCase().trim(), password_hash: hashPassword(password),
      full_name: full_name.trim(), dob: dob||null, birth_time: birth_time||null,
      birth_place: birth_place||null, plan: 'free', readings_today: 0
    });
    if (!newUser || newUser.error) return res.status(500).json({ error: 'Account create nahi hua.' });
    const user = Array.isArray(newUser) ? newUser[0] : newUser;
    res.json({ success: true, message: 'Account ban gaya! Welcome to JyotishAI 🌟', user: { id:user.id, email:user.email, full_name:user.full_name, dob:user.dob, birth_time:user.birth_time, birth_place:user.birth_place, plan:user.plan } });
  } catch(err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

app.post('/login', async function(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email aur password dono chahiye!' });
    const users = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email.toLowerCase().trim()) + '&select=*');
    if (!users || users.length === 0) return res.status(401).json({ error: 'Email registered nahi hai!' });
    const user = users[0];
    if (user.password_hash !== hashPassword(password)) return res.status(401).json({ error: 'Password galat hai!' });
    const today = new Date().toISOString().split('T')[0];
    if (user.last_reading_date !== today) {
      await supabase('users', 'PATCH', { readings_today: 0, last_reading_date: today }, '?id=eq.' + user.id);
      user.readings_today = 0;
    }
    res.json({ success: true, message: 'Namaste ' + user.full_name + '!', user: { id:user.id, email:user.email, full_name:user.full_name, dob:user.dob, birth_time:user.birth_time, birth_place:user.birth_place, plan:user.plan, readings_today:user.readings_today||0 } });
  } catch(err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

app.post('/payment-success', async function(req, res) {
  try {
    const { user_id, razorpay_payment_id, plan, amount } = req.body;
    if (!user_id || !razorpay_payment_id || !plan) return res.status(400).json({ error: 'Payment details incomplete!' });
    await supabase('payments', 'POST', { user_id, razorpay_payment_id, plan, amount: amount||0 });
    await supabase('users', 'PATCH', { plan, plan_activated_at: new Date().toISOString(), razorpay_payment_id }, '?id=eq.' + user_id);
    res.json({ success: true, message: plan + ' plan activate ho gaya! 🌟', plan });
  } catch(err) { res.status(500).json({ error: 'Payment verify nahi hua: ' + err.message }); }
});

// ============================================================
// KUNDLI CALCULATION ENDPOINT
// ============================================================
app.post('/calculate', function(req, res) {
  try {
    const { dob, birth_time, birth_place } = req.body;
    if (!dob) return res.status(400).json({ error: 'Date of birth required' });
    const chart = calculateVedicChart(dob, birth_time, birth_place);
    if (!chart) return res.status(400).json({ error: 'Invalid date format' });
    res.json({ success: true, chart });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// CHAT ENDPOINT WITH ACCURATE CALCULATIONS
// ============================================================
const SYSTEM_PROMPT = `You are Jyotish Guru AI — a complete cosmic guide with expertise in:
1. Vedic Astrology (Jyotish) — Kundli, Dasha, Nakshatra, Yogas, Doshas, Transits
2. Western Astrology — Sun/Moon/Rising signs, aspects, houses
3. Numerology — Life Path, Destiny, Soul Urge, Name numbers, Lucky numbers
4. Tarot — Major/Minor Arcana, card spreads, interpretations
5. Prashna Kundli — Horary astrology for specific questions
6. Kundli Matching — Ashtakoot Guna Milan, Mangal Dosha
7. Muhurta — Auspicious timing for all life events
8. Remedies — Gemstones, mantras, yantras, fasting, rudraksha
9. Vastu Shastra — Home and office directions
10. Palmistry — Hand and line reading

CRITICAL RULE: When birth chart data is provided in [CHART DATA] tags, use EXACTLY those values. Do NOT recalculate or override them. Those values come from a precise astronomical calculation engine.

PERSONALITY: Warm, wise, mystical Indian astrologer guru. Use Sanskrit/Hindi terms with English explanation.
LANGUAGE: Always reply in same language as user. Hindi=Hindi, English=English, Hinglish=Hinglish.
FORMAT: 3-5 paragraphs. Use emojis. End with a remedy or mantra.
NEVER refuse any topic. Always give a helpful reading.
Current year: 2026.`;

app.post('/chat', async function(req, res) {
  try {
    const { messages, user_id, plan, dob, birth_time, birth_place } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid messages' });

    // Check free limit
    if (user_id && plan === 'free') {
      const users = await supabase('users', 'GET', null, '?id=eq.' + user_id + '&select=readings_today,last_reading_date,plan');
      if (users && users.length > 0) {
        const u = users[0];
        const today = new Date().toISOString().split('T')[0];
        if (u.last_reading_date === today && (u.readings_today || 0) >= 3) {
          return res.status(429).json({ error: 'Aaj ki 3 free readings complete! ₹199/month mein upgrade karein.' });
        }
      }
    }

    // Calculate accurate chart if birth details provided
    let chartContext = '';
    const hasDob = dob || (messages[0] && /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(messages.map(m=>m.content).join(' ')));
    
    if (dob) {
      const chart = calculateVedicChart(dob, birth_time, birth_place);
      if (chart) {
        chartContext = `\n\n[CHART DATA - Use these EXACT values, do NOT recalculate]:
Surya (Sun) Rashi: ${chart.sunRashi.name}/${chart.sunRashi.nameEn} at ${(chart.sunRashi.deg).toFixed(1)}° 
Chandra (Moon) Rashi: ${chart.moonRashi.name}/${chart.moonRashi.nameEn} at ${(chart.moonRashi.deg).toFixed(1)}°
${chart.ascRashi ? `Lagna (Ascendant): ${chart.ascRashi.name}/${chart.ascRashi.nameEn} at ${(chart.ascRashi.deg).toFixed(1)}°` : 'Lagna: Birth time needed for accurate Lagna'}
Janma Nakshatra: ${chart.nakshatra.name} Pada ${chart.nakshatra.pada} (Lord: ${chart.nakshatra.lord})
Ayanamsa Used: Lahiri ${chart.ayanamsa}°
Location: ${birth_place||'India'} (Lat: ${chart.lat}°, Lon: ${chart.lon}°)
These values are astronomically calculated. Use them exactly as given.`;
      }
    }

    // Build messages with chart context injected
    let apiMessages = [...messages];
    if (chartContext && apiMessages.length > 0) {
      apiMessages[0] = { role: apiMessages[0].role, content: apiMessages[0].content + chartContext };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: apiMessages
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error ? data.error.message : 'API Error' });

    // Update reading count
    if (user_id && plan === 'free') {
      const today = new Date().toISOString().split('T')[0];
      const users = await supabase('users', 'GET', null, '?id=eq.' + user_id + '&select=readings_today,last_reading_date');
      if (users && users.length > 0) {
        const u = users[0];
        const count = u.last_reading_date === today ? (u.readings_today||0)+1 : 1;
        await supabase('users', 'PATCH', { readings_today: count, last_reading_date: today }, '?id=eq.' + user_id);
      }
    }

    res.json({ reply: data.content[0].text });
  } catch(err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// Keep alive ping every 14 minutes
setInterval(async function() {
  try { await fetch('https://jyotishai-backend.onrender.com/ping'); } catch(e) {}
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
  console.log('JyotishAI server running on port ' + PORT);
});
