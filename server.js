const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// Swiss Ephemeris fallback
let swisseph = null;
try {
  swisseph = require('swisseph-v2');
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0);
  console.log('Swiss Ephemeris loaded as fallback!');
} catch(e) {
  console.log('Swiss Ephemeris not available:', e.message);
}

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.options('*', cors());
app.use(express.json());

const SUPABASE_URL = 'https://mqbpmjnufegoyrizarsf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ASTRO_KEY = process.env.ASTRO_API_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;

// In-memory OTP store {email: {otp, expiry}}
var otpStore = {};

// ===== SWISS EPHEMERIS FALLBACK CALCULATION =====
function calculateWithSwisseph(date, time, place) {
  try {
    if (!swisseph) return null;
    var coords = getCityCoords(place) || [20.5937, 78.9629];
    var lat = coords[0], lng = coords[1];

    // Convert IST to UTC
    var totalMinutes = time.hours * 60 + time.minutes - 330;
    if (totalMinutes < 0) { totalMinutes += 1440; date.day -= 1; }
    var utcHour = Math.floor(totalMinutes / 60) + (totalMinutes % 60) / 60.0;

    var julday = swisseph.swe_julday(date.year, date.month, date.day, utcHour, swisseph.SE_GREG_CAL);
    var flag = swisseph.SEFLG_SPEED | swisseph.SEFLG_SIDEREAL | swisseph.SEFLG_MOSEPH;

    var RASHIS = ['Mesh (Aries)','Vrishabh (Taurus)','Mithun (Gemini)','Kark (Cancer)',
      'Simha (Leo)','Kanya (Virgo)','Tula (Libra)','Vrishchik (Scorpio)',
      'Dhanu (Sagittarius)','Makar (Capricorn)','Kumbh (Aquarius)','Meen (Pisces)'];

    var NAKSHATRAS = ['Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra',
      'Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni',
      'Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
      'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha',
      'Purva Bhadrapada','Uttara Bhadrapada','Revati'];

    // Planet IDs in Swiss Ephemeris
    var PLANETS = [
      {id: swisseph.SE_SUN, key: 'sun'},
      {id: swisseph.SE_MOON, key: 'moon'},
      {id: swisseph.SE_MARS, key: 'mars'},
      {id: swisseph.SE_MERCURY, key: 'mercury'},
      {id: swisseph.SE_JUPITER, key: 'jupiter'},
      {id: swisseph.SE_VENUS, key: 'venus'},
      {id: swisseph.SE_SATURN, key: 'saturn'},
      {id: swisseph.SE_MEAN_NODE, key: 'rahu'}
    ];

    var result = {};

    for (var i = 0; i < PLANETS.length; i++) {
      var p = PLANETS[i];
      var calc = swisseph.swe_calc_ut(julday, p.id, flag);
      if (calc && calc.longitude !== undefined) {
        var deg = ((calc.longitude % 360) + 360) % 360;
        var rashiIdx = Math.floor(deg / 30);
        var normDeg = deg % 30;
        result[p.key + '_rashi'] = RASHIS[rashiIdx];
        result[p.key + '_degrees'] = normDeg.toFixed(2);
        if (p.key === 'rahu') {
          // Ketu is opposite Rahu
          var ketuDeg = (deg + 180) % 360;
          result.ketu_rashi = RASHIS[Math.floor(ketuDeg / 30)];
          result.ketu_degrees = (ketuDeg % 30).toFixed(2);
        }
        if (p.key === 'moon') {
          var nakIdx = Math.floor(deg / (360/27));
          result.nakshatra = NAKSHATRAS[nakIdx];
          result.nakshatra_pada = Math.floor((deg % (360/27)) / (360/108)) + 1;
          result.moon_abs_deg = deg; // Save for Dasha calculation
        }
      }
    }

    // Lagna calculation
    var houses = swisseph.swe_houses(julday, lat, lng, 'W');
    if (houses && houses.ascendant !== undefined) {
      var ascDeg = ((houses.ascendant % 360) + 360) % 360;
      result.lagna = RASHIS[Math.floor(ascDeg / 30)];
      result.lagna_degrees = (ascDeg % 30).toFixed(2);
    }

    // Map to standard format
    var mapped = {
      sun_rashi: result.sun_rashi, sun_degrees: result.sun_degrees,
      moon_rashi: result.moon_rashi, moon_degrees: result.moon_degrees,
      lagna: result.lagna, lagna_degrees: result.lagna_degrees,
      nakshatra: result.nakshatra, nakshatra_pada: result.nakshatra_pada,
      mars: result.mars_rashi, mars_deg: result.mars_degrees,
      mercury: result.mercury_rashi, mercury_deg: result.mercury_degrees,
      jupiter: result.jupiter_rashi, jupiter_deg: result.jupiter_degrees,
      venus: result.venus_rashi, venus_deg: result.venus_degrees,
      saturn: result.saturn_rashi, saturn_deg: result.saturn_degrees,
      rahu: result.rahu_rashi, rahu_deg: result.rahu_degrees,
      ketu: result.ketu_rashi, ketu_deg: result.ketu_degrees,
      moon_abs_deg: result.moon_abs_deg,
      location: place + ' (' + lat + 'N, ' + lng + 'E)',
      source: 'Swiss Ephemeris (Moshier) - Lahiri Ayanamsa'
    };

    console.log('Swiss Ephemeris calculated:', mapped.sun_rashi, mapped.moon_rashi, mapped.lagna);
    return mapped;
  } catch(e) {
    console.error('Swiss Ephemeris error:', e.message);
    return null;
  }
}

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
  'panaji': [15.4909, 73.8278], 'goa': [15.2993, 74.1240],
  // More Rajasthan
  'sujangarh': [27.8067, 74.5881], 'churu': [28.3023, 74.9686],
  'sikar': [27.6094, 75.1399], 'jhunjhunu': [28.1289, 75.3982],
  'barmer': [25.7521, 71.3967], 'jaisalmer': [26.9157, 70.9083],
  'pali': [25.7711, 73.3234], 'sirohi': [24.8867, 72.8604],
  'tonk': [26.1664, 75.7885], 'sawai madhopur': [26.0028, 76.3527],
  'bharatpur': [27.2152, 77.4941], 'dholpur': [26.7024, 77.8936],
  'bundi': [25.4385, 75.6389], 'chittorgarh': [24.8887, 74.6269],
  'bhilwara': [25.3407, 74.6313], 'rajsamand': [25.0667, 73.8833],
  'dungarpur': [23.8424, 73.7148], 'banswara': [23.5467, 74.4367],
  'pratapgarh': [24.0333, 74.7833], 'jalor': [25.3478, 72.6178],
  'sanchore': [24.7554, 71.7856], 'hanumangarh': [29.5833, 74.3333],
  'ganganagar': [29.9038, 73.8772], 'sri ganganagar': [29.9038, 73.8772],
  'nohar': [29.1833, 74.7667], 'bhadra': [29.1000, 75.1667],
  // More UP
  'jhansi': [25.4484, 78.5685], 'ghazipur': [25.5756, 83.5773],
  'azamgarh': [26.0689, 83.1847], 'sultanpur': [26.2648, 82.0727],
  'faizabad': [26.7922, 82.1998], 'bahraich': [27.5743, 81.5958],
  'sitapur': [27.5631, 80.6817], 'hardoi': [27.3956, 80.1264],
  'unnao': [26.5479, 80.4896], 'rae bareli': [26.2309, 81.2329],
  // More MP
  'chhindwara': [22.0574, 78.9382], 'balaghat': [21.8124, 80.1853],
  'seoni': [22.0850, 79.5381], 'mandla': [22.5982, 80.3749],
  'hoshangabad': [22.7547, 77.7270], 'betul': [21.9001, 77.9010],
  'vidisha': [23.5243, 77.8144], 'raisen': [23.3314, 77.7882],
  // More Maharashtra
  'akola': [20.7000, 77.0167], 'yavatmal': [20.3888, 78.1204],
  'buldhana': [20.5292, 76.1842], 'washim': [20.1117, 77.1336],
  'chandrapur': [19.9615, 79.2961], 'gadchiroli': [20.1808, 80.0084],
  'gondia': [21.4628, 80.1952], 'bhandara': [21.1663, 79.6506],
  // More Gujarat
  'anand': [22.5645, 72.9289], 'kheda': [22.7520, 72.6846],
  'mehsana': [23.5879, 72.3693], 'patan': [23.8493, 72.1266],
  'banaskantha': [24.1742, 72.4328], 'sabarkantha': [23.3667, 73.0167],
  'dahod': [22.8357, 74.2569],
  // More Bihar
  'bhagalpur': [25.2444, 86.9722], 'munger': [25.3728, 86.4742],
  'begusarai': [25.4182, 86.1272], 'samastipur': [25.8620, 85.7813],
  'darbhanga': [26.1542, 85.8918], 'sitamarhi': [26.5911, 85.4861],
  'madhubani': [26.3533, 86.0722], 'supaul': [26.1228, 86.6050],
  'araria': [26.1473, 87.4711], 'kishanganj': [26.0968, 87.9406],
  'purnia': [25.7771, 87.4753], 'katihar': [25.5377, 87.5785],
  'nawada': [24.8838, 85.5417], 'sheikhpura': [25.1403, 85.8439],
  'jamui': [24.9262, 86.2241], 'banka': [24.8858, 86.9200]
};

function getCityCoords(place) {
  if (!place) return null;
  var lower = place.toLowerCase().trim();
  // Direct match
  if (CITIES[lower]) return CITIES[lower];
  // Partial match - check each word
  var words = lower.split(/[,\s]+/).filter(function(w) { return w.length > 2; });
  for (var word of words) {
    if (CITIES[word]) return CITIES[word];
    for (var city in CITIES) {
      if (city.includes(word) || word.includes(city)) return CITIES[city];
    }
  }
  return null;
}

async function getCityCoordsAsync(place) {
  // First try local DB
  var local = getCityCoords(place);
  if (local) return local;

  // Fallback: OpenStreetMap Nominatim (free, no API key, covers all cities!)
  try {
    var query = encodeURIComponent(place + ', India');
    var url = 'https://nominatim.openstreetmap.org/search?q=' + query + '&format=json&limit=1&countrycodes=in';
    var res = await fetch(url, {
      headers: { 'User-Agent': 'JyotishAI/1.0 (jyotishai@gmail.com)' }
    });
    var data = await res.json();
    if (data && data.length > 0) {
      var lat = parseFloat(data[0].lat);
      var lon = parseFloat(data[0].lon);
      console.log('Geocoded', place, '->', lat, lon, '(' + data[0].display_name + ')');
      return [lat, lon];
    }
  } catch(e) {
    console.log('Geocoding failed:', e.message);
  }

  // Final fallback: India center
  console.log('Using India center for:', place);
  return [20.5937, 78.9629];
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

// ===== VIMSHOTTARI DASHA CALCULATION (FIXED) =====
function calculateDashaLocal(moonDegree, birthDate) {
  var DASHA_LORDS = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
  var DASHA_YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17]; // Total 120 years
  var NAK_LORDS = [
    'Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury', // 1-9
    'Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury', // 10-18
    'Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'  // 19-27
  ];

  // Moon nakshatra (0-26)
  var nakIdx = Math.floor(moonDegree / (360/27));
  if (nakIdx >= 27) nakIdx = 26;
  var nakLord = NAK_LORDS[nakIdx];

  // Position within nakshatra
  var nakDegree = moonDegree % (360/27);
  var nakSpan = 360/27; // 13.333 degrees per nakshatra
  var fractionElapsed = nakDegree / nakSpan;

  // Find dasha lord index
  var lordIdx = DASHA_LORDS.indexOf(nakLord);

  // Years elapsed in current dasha at birth
  var currentDashaYears = DASHA_YEARS[lordIdx];
  var yearsElapsed = fractionElapsed * currentDashaYears;

  var birth = new Date(birthDate);

  // ✅ FIXED: Use milliseconds for precise decimal year calculation
  // setFullYear() loses precision with decimal years — use ms arithmetic instead
  var MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  var dashaStartMs = birth.getTime() - (yearsElapsed * MS_PER_YEAR);
  var cursor = new Date(dashaStartMs);

  var startLordIdx = lordIdx;
  var dashas = [];

  for (var i = 0; i < 9; i++) {
    var idx = (startLordIdx + i) % 9;
    var years = DASHA_YEARS[idx];
    var dashaStart = new Date(cursor);
    cursor = new Date(cursor.getTime() + years * MS_PER_YEAR);
    var dashaEnd = new Date(cursor);
    dashas.push({ planet: DASHA_LORDS[idx], start: dashaStart, end: dashaEnd, years: years });
  }

  return dashas;
}

function formatDashaLocal(dashas) {
  if (!dashas || !dashas.length) return null;
  var now = new Date();
  var result = '';
  var cutoff = now.getFullYear() + 40;
  var DASHA_LORDS = ['Ketu','Venus','Sun','Moon','Mars','Rahu','Jupiter','Saturn','Mercury'];
  var DASHA_YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17];

  // Helper: format date as "Mon YYYY"
  function fmtDate(d) {
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  // Helper: calculate all 9 antardashas for a given mahadasha
  function getAntardashas(maha) {
    var mIdx = DASHA_LORDS.indexOf(maha.planet);
    var antarCursor = new Date(maha.start);
    var antarList = [];
    for (var j = 0; j < 9; j++) {
      var aIdx = (mIdx + j) % 9;
      var aFrac = DASHA_YEARS[aIdx] / 120;
      var aDays = maha.years * 365.25 * aFrac;
      var aStart = new Date(antarCursor);
      antarCursor = new Date(antarCursor.getTime() + aDays * 86400000);
      var aEnd = new Date(antarCursor);
      antarList.push({ planet: DASHA_LORDS[aIdx], start: aStart, end: aEnd });
    }
    return antarList;
  }

  // All mahadashas (current + future within cutoff)
  for (var i = 0; i < dashas.length; i++) {
    var d = dashas[i];
    // Skip fully past mahadashas
    if (d.end.getFullYear() < now.getFullYear()) continue;
    if (d.start.getFullYear() > cutoff) break;

    var isCurrMaha = (now >= d.start && now <= d.end);
    result += (isCurrMaha ? '>>> CURRENT: ' : '    ') +
      d.planet + ' Mahadasha (' + fmtDate(d.start) + ' - ' + fmtDate(d.end) + ')' +
      (isCurrMaha ? ' (ACTIVE NOW)' : '') + '\n';

    // All 9 antardashas for this mahadasha
    var antarList = getAntardashas(d);
    for (var j = 0; j < antarList.length; j++) {
      var a = antarList[j];
      var isCurrAntar = isCurrMaha && (now >= a.start && now <= a.end);
      result += (isCurrAntar ? '    >>> CURRENT: ' : '        ') +
        d.planet + '-' + a.planet + ' Antardasha: ' +
        fmtDate(a.start) + ' - ' + fmtDate(a.end) +
        (isCurrAntar ? ' (ACTIVE NOW)' : '') + '\n';

      // Pratyantar dashas only for current antardasha
      if (isCurrAntar) {
        result += '        PRATYANTAR DASHAS within ' + d.planet + '-' + a.planet + ':\n';
        var pIdx = DASHA_LORDS.indexOf(a.planet);
        var pratCursor = new Date(a.start);
        var aDurationDays = (a.end - a.start) / 86400000;
        for (var k = 0; k < 9; k++) {
          var pIdx2 = (pIdx + k) % 9;
          var pFrac = DASHA_YEARS[pIdx2] / 120;
          var pDays = aDurationDays * pFrac;
          var pStart = new Date(pratCursor);
          pratCursor = new Date(pratCursor.getTime() + pDays * 86400000);
          var pEnd = new Date(pratCursor);
          var isPCurrent = (now >= pStart && now <= pEnd);
          result += '          ' + (isPCurrent ? '* ' : '  ') +
            d.planet + '-' + a.planet + '-' + DASHA_LORDS[pIdx2] + ': ' +
            fmtDate(pStart) + ' - ' + fmtDate(pEnd) +
            (isPCurrent ? ' (ACTIVE)' : '') + '\n';
        }
      }
    }
    result += '\n';
  }
  return result || null;
}

function formatDashaData(dashaData) {
  if (!dashaData || !dashaData.output) return null;
  try {
    var output = dashaData.output;
    var result = '';
    var now = new Date();
    var cutoff = now.getFullYear() + 40;
    if (Array.isArray(output)) {
      for (var i = 0; i < output.length; i++) {
        var maha = output[i];
        var mStart = new Date(maha.start_date || maha.startDate || '');
        var mEnd = new Date(maha.end_date || maha.endDate || '');
        var mName = maha.planet || maha.name || maha.dasa_planet || '';
        if (now >= mStart && now <= mEnd) {
          result += 'CURRENT MAHADASHA: ' + mName + ' Mahadasha (until ' + mEnd.getFullYear() + ')\n';
          var antarList = maha.antardasa || maha.antar_dasa || maha.sub_periods || [];
          if (Array.isArray(antarList)) {
            for (var j = 0; j < antarList.length; j++) {
              var antar = antarList[j];
              var aStart = new Date(antar.start_date || antar.startDate || '');
              var aEnd = new Date(antar.end_date || antar.endDate || '');
              var aName = antar.planet || antar.name || antar.dasa_planet || '';
              if (now >= aStart && now <= aEnd) {
                result += 'CURRENT ANTARDASHA: ' + aName + ' Antardasha (until ' + aEnd.toLocaleDateString('en-IN', {month:'short',year:'numeric'}) + ')\n';
              }
            }
          }
        }
      }
      result += 'FULL DASHA TIMELINE (40 years):\n';
      for (var k = 0; k < output.length; k++) {
        var d = output[k];
        var dEnd = new Date(d.end_date || d.endDate || '');
        var dStart = new Date(d.start_date || d.startDate || '');
        var dName = d.planet || d.name || d.dasa_planet || '';
        if (dEnd.getFullYear() >= now.getFullYear() && dStart.getFullYear() <= cutoff) {
          result += dName + ' Mahadasha: ' + dStart.getFullYear() + ' - ' + dEnd.getFullYear() + '\n';
        }
      }
    }
    return result || null;
  } catch(e) { console.error('Dasha format error:', e.message); return null; }
}

async function calculateChart(dob, birth_time, birth_place) {
  try {
    var date = parseDate(dob);
    var time = parseTime(birth_time);
    if (!date || !time) {
      console.log('Parse failed - date:', date, 'time:', time);
      return null;
    }

    // Clean birth_place - take only first meaningful part
    var cleanPlace = birth_place;
    cleanPlace = cleanPlace.replace(/,?\s*(need|want|give|tell|what|how|please|pls|bata|mujhe|mera|meri).*/i, '').trim();
    var placeParts = cleanPlace.split(',');
    cleanPlace = placeParts.slice(0, 2).join(',').trim();
    console.log('Original place:', birth_place, '-> Cleaned:', cleanPlace);

    var coords = await getCityCoordsAsync(cleanPlace);

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
      console.log('API error:', response.status, '- trying Swiss Ephemeris fallback');
      // Fallback to Swiss Ephemeris
      var swissResult = calculateWithSwisseph(date, time, cleanPlace);
      if (swissResult) {
        // Calculate Dasha with swisseph result
        if (swissResult.moon_abs_deg !== undefined) {
          var dashaList = calculateDashaLocal(swissResult.moon_abs_deg, date.year + '-' + date.month + '-' + date.day);
          var dashaFormatted = formatDashaLocal(dashaList);
          if (dashaFormatted) swissResult.dasha = dashaFormatted;
        }
        return swissResult;
      }
      return null;
    }

    var data = await response.json();
    console.log('API response received, keys:', Object.keys(data));
    console.log('Status code:', data.statusCode);
    if (data.output) console.log('Output type:', typeof data.output, 'isArray:', Array.isArray(data.output), 'length:', Array.isArray(data.output) ? data.output.length : 'N/A');
    if (data.output && !Array.isArray(data.output)) console.log('Output sample:', JSON.stringify(data.output).substring(0, 300));
    if (Array.isArray(data.output) && data.output.length > 0) console.log('First item:', JSON.stringify(data.output[0]).substring(0, 300));

    // Extract Sun, Moon, Ascendant
    var output = data.output || {};
    console.log('Output keys:', Object.keys(output).slice(0, 10));

    // Try object format first (new format)
    var sunData = output.Sun || output.sun || null;
    var moonData = output.Moon || output.moon || null;
    var lagnaData = output.Ascendant || output.ascendant || output.Lagna || null;
    var marsData = output.Mars || output.mars || null;
    var mercuryData = output.Mercury || output.mercury || null;
    var jupiterData = output.Jupiter || output.jupiter || null;
    var venusData = output.Venus || output.venus || null;
    var saturnData = output.Saturn || output.saturn || null;
    var rahuData = output['Rahu (North node)'] || output.Rahu || output.rahu || null;
    var ketuData = output['Ketu (South node)'] || output.Ketu || output.ketu || null;

    // Fallback: array format
    if (!sunData && Array.isArray(output)) {
      for (var p of output) {
        var name = (p.name || p.localized_name || '').toLowerCase();
        if (name === 'sun' || p.id === 0) sunData = p;
        else if (name === 'moon' || p.id === 1) moonData = p;
        else if (name === 'ascendant' || name === 'lagna' || p.id === 100) lagnaData = p;
        else if (name === 'mars' || p.id === 4) marsData = p;
        else if (name === 'mercury' || p.id === 2) mercuryData = p;
        else if (name === 'jupiter' || p.id === 5) jupiterData = p;
        else if (name === 'venus' || p.id === 3) venusData = p;
        else if (name === 'saturn' || p.id === 6) saturnData = p;
        else if (name.includes('rahu') || p.id === 101) rahuData = p;
        else if (name.includes('ketu') || p.id === 102) ketuData = p;
      }
    }
    console.log('All planets - Mars:', marsData ? marsData.zodiac_sign_name : 'NO',
      'Venus:', venusData ? venusData.zodiac_sign_name : 'NO',
      'Saturn:', saturnData ? saturnData.zodiac_sign_name : 'NO',
      'Rahu:', rahuData ? rahuData.zodiac_sign_name : 'NO');

    console.log('Sun found:', sunData ? 'YES' : 'NO');
    console.log('Moon found:', moonData ? 'YES' : 'NO');
    console.log('Lagna found:', lagnaData ? 'YES' : 'NO');

    // Build result
    var result = {};

    var SIGN_MAP = {
      'Aries': 'Mesh (Aries)', 'Taurus': 'Vrishabh (Taurus)',
      'Gemini': 'Mithun (Gemini)', 'Cancer': 'Kark (Cancer)',
      'Leo': 'Simha (Leo)', 'Virgo': 'Kanya (Virgo)',
      'Libra': 'Tula (Libra)', 'Scorpio': 'Vrishchik (Scorpio)',
      'Sagittarius': 'Dhanu (Sagittarius)', 'Capricorn': 'Makar (Capricorn)',
      'Aquarius': 'Kumbh (Aquarius)', 'Pisces': 'Meen (Pisces)'
    };

    if (sunData) {
      var sunSignName = sunData.zodiac_sign_name || '';
      result.sun_rashi = SIGN_MAP[sunSignName] || sunSignName || 'Unknown';
      result.sun_degrees = (sunData.normDegree || 0).toFixed(2);
    }
    if (moonData) {
      var moonSignName = moonData.zodiac_sign_name || '';
      result.moon_rashi = SIGN_MAP[moonSignName] || moonSignName || 'Unknown';
      result.moon_degrees = (moonData.normDegree || 0).toFixed(2);
      result.nakshatra = moonData.nakshatra_name || moonData.nakshatraName || moonData.nakshatra || '';
      result.nakshatra_pada = moonData.nakshatra_pada || moonData.pada || '';
    }
    if (lagnaData) {
      var lagnaSignName = lagnaData.zodiac_sign_name || '';
      result.lagna = SIGN_MAP[lagnaSignName] || lagnaSignName || 'Unknown';
      result.lagna_degrees = (lagnaData.normDegree || 0).toFixed(2);
    }
    // All 9 planets
    if (marsData) { result.mars = SIGN_MAP[marsData.zodiac_sign_name] || marsData.zodiac_sign_name || ''; result.mars_deg = (marsData.normDegree||0).toFixed(1); }
    if (mercuryData) { result.mercury = SIGN_MAP[mercuryData.zodiac_sign_name] || mercuryData.zodiac_sign_name || ''; result.mercury_deg = (mercuryData.normDegree||0).toFixed(1); }
    if (jupiterData) { result.jupiter = SIGN_MAP[jupiterData.zodiac_sign_name] || jupiterData.zodiac_sign_name || ''; result.jupiter_deg = (jupiterData.normDegree||0).toFixed(1); }
    if (venusData) { result.venus = SIGN_MAP[venusData.zodiac_sign_name] || venusData.zodiac_sign_name || ''; result.venus_deg = (venusData.normDegree||0).toFixed(1); }
    if (saturnData) { result.saturn = SIGN_MAP[saturnData.zodiac_sign_name] || saturnData.zodiac_sign_name || ''; result.saturn_deg = (saturnData.normDegree||0).toFixed(1); }
    if (rahuData) { result.rahu = SIGN_MAP[rahuData.zodiac_sign_name] || rahuData.zodiac_sign_name || ''; result.rahu_deg = (rahuData.normDegree||0).toFixed(1); }
    if (ketuData) { result.ketu = SIGN_MAP[ketuData.zodiac_sign_name] || ketuData.zodiac_sign_name || ''; result.ketu_deg = (ketuData.normDegree||0).toFixed(1); }
    console.log('Chart complete:', JSON.stringify(result));

    result.location = cleanPlace + ' (' + coords[0].toFixed(4) + 'N, ' + coords[1].toFixed(4) + 'E)';
    result.source = 'FreeAstrologyAPI - Lahiri Ayanamsa';

    // Calculate Dasha using Swiss Ephemeris for precise Moon degree
    // FreeAstrologyAPI normDegree can be off by ~0.8 deg causing ~14 month dasha error
    // Swiss Ephemeris gives exact degree -> correct dasha dates
    var moonAbsForDasha = null;
    var swissForDasha = calculateWithSwisseph(date, time, cleanPlace);
    if (swissForDasha && swissForDasha.moon_abs_deg !== undefined) {
      moonAbsForDasha = swissForDasha.moon_abs_deg;
      console.log('Moon abs deg (Swiss Ephemeris - precise):', moonAbsForDasha);
    } else if (result.moon_rashi && result.moon_degrees) {
      // Fallback: use API normDegree + sign offset
      var SIGN_ORDER = [
        'Mesh (Aries)', 'Vrishabh (Taurus)', 'Mithun (Gemini)', 'Kark (Cancer)',
        'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrishchik (Scorpio)',
        'Dhanu (Sagittarius)', 'Makar (Capricorn)', 'Kumbh (Aquarius)', 'Meen (Pisces)'
      ];
      var moonSignIdx = SIGN_ORDER.indexOf(result.moon_rashi);
      var moonNormDeg = parseFloat(result.moon_degrees);
      moonAbsForDasha = (moonSignIdx >= 0 ? moonSignIdx * 30 : 0) + moonNormDeg;
      moonAbsForDasha = ((moonAbsForDasha % 360) + 360) % 360;
      console.log('Moon abs deg (API fallback):', moonAbsForDasha, '| sign:', result.moon_rashi, '| norm:', moonNormDeg);
    }
    if (moonAbsForDasha !== null) {
      var dashaList = calculateDashaLocal(moonAbsForDasha, date.year + '-' + date.month + '-' + date.day);
      var dashaFormatted = formatDashaLocal(dashaList);
      if (dashaFormatted) {
        result.dasha = dashaFormatted;
        console.log('Dasha calculated:', dashaFormatted.split('\n')[0]);
      }
    }

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
  var headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
  };
  var res = await fetch(url, {
    method: method || 'GET',
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  });
  // Handle empty responses (PATCH/DELETE return 204 with no body)
  var text = await res.text();
  if (!text || text.trim() === '') return { success: true };
  try { return JSON.parse(text); } catch(e) { return { success: true, raw: text }; }
}

function hashPassword(p) {
  return crypto.createHash('sha256').update(p + 'jyotishai_salt_2025').digest('hex');
}

// ===== SYSTEM PROMPT =====
var BASE_PROMPT = 'You are Jyotish Guru, India\'s most accurate Vedic astrologer. Current year: 2026. Lahiri Ayanamsa Vedic Sidereal system only.\n\nCRITICAL: When BIRTH CHART DATA is shown below, USE THOSE EXACT VALUES immediately. Do NOT ask user for chart details. Just give the reading directly.\n\nSOURCE CONFIDENTIALITY: NEVER mention or reveal data sources, APIs, calculation methods, or technical terms like NASA JPL, Lahiri Ayanamsa, ephemeris, sidereal system, Swiss Ephemeris, FreeAstrologyAPI, calculated from, or any technical backend details in your response. Speak only as a wise astrologer who has studied the cosmic positions.\n\nVEDIC SUN SIGN DATES (Lahiri Sidereal):\nMesh(Aries):Apr14-May14, Vrishabh(Taurus):May15-Jun14, Mithun(Gemini):Jun15-Jul14, Kark(Cancer):Jul15-Aug14, Simha(Leo):Aug15-Sep15, Kanya(Virgo):Sep16-Oct15, Tula(Libra):Oct16-Nov14, Vrishchik(Scorpio):Nov15-Dec14, Dhanu(Sagittarius):Dec15-Jan13, Makar(Capricorn):Jan14-Feb11, Kumbh(Aquarius):Feb12-Mar12, Meen(Pisces):Mar13-Apr13\n\nLANGUAGE RULE: ALWAYS reply in ENGLISH by default. ONLY switch to another language if the user explicitly writes in Hindi/Tamil/Telugu/Kannada/Malayalam etc. Never automatically use Hindi.\n\nServices: Kundli analysis, Dasha 2026, Nakshatra, Numerology, Tarot, Prashna Kundli, Vivah Milan, Muhurta, Ratna Shastra. PDF REPORTS: When user asks for PDF or download - tell them to click the Full Kundli PDF button on screen.\n\nFORMATTING: Never use markdown tables, never use | characters, never use ## headers. Write in flowing paragraphs only.\n\nStyle: Warm, mystical. Use Sanskrit terms with English explanation. 3-4 paragraphs. End: "Note: Jyotish is for spiritual guidance only."';

// ===== ROUTES =====
app.get('/', function(req, res) {
  res.json({ status: 'JyotishAI Server Running', astro_api: ASTRO_KEY ? 'configured' : 'missing' });
});

app.get('/ping', function(req, res) {
  res.json({ status: 'alive', time: new Date().toISOString() });
});

app.get('/config', function(req, res) {
  var key = process.env.RAZORPAY_KEY_ID || '';
  res.json({ razorpay_key: key });
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
      systemPrompt += '\n\nBIRTH CHART CALCULATED BY FREEASTROLOGYAPI (NASA JPL DATA + LAHIRI AYANAMSA):';
      systemPrompt += '\nTHESE ARE 100% CORRECT. DO NOT CHANGE THEM. DO NOT RECALCULATE.';
      if (chartData.sun_rashi) systemPrompt += '\nSUN SIGN = ' + chartData.sun_rashi + ' (EXACT: ' + chartData.sun_degrees + ' degrees)';
      if (chartData.moon_rashi) systemPrompt += '\nMOON SIGN = ' + chartData.moon_rashi + ' (EXACT: ' + chartData.moon_degrees + ' degrees)';
      if (chartData.lagna) systemPrompt += '\nASCENDANT/LAGNA = ' + chartData.lagna + ' (EXACT: ' + chartData.lagna_degrees + ' degrees)';
      if (chartData.nakshatra) systemPrompt += '\nNAKSHATRA = ' + chartData.nakshatra + (chartData.nakshatra_pada ? ' Pada ' + chartData.nakshatra_pada : '');
      systemPrompt += '\nLOCATION USED = ' + chartData.location;
      if (chartData.mars) systemPrompt += '\nMARS = ' + chartData.mars + ' (' + chartData.mars_deg + ' deg)';
      if (chartData.mercury) systemPrompt += '\nMERCURY = ' + chartData.mercury + ' (' + chartData.mercury_deg + ' deg)';
      if (chartData.jupiter) systemPrompt += '\nJUPITER = ' + chartData.jupiter + ' (' + chartData.jupiter_deg + ' deg)';
      if (chartData.venus) systemPrompt += '\nVENUS = ' + chartData.venus + ' (' + chartData.venus_deg + ' deg)';
      if (chartData.saturn) systemPrompt += '\nSATURN = ' + chartData.saturn + ' (' + chartData.saturn_deg + ' deg)';
      if (chartData.rahu) systemPrompt += '\nRAHU = ' + chartData.rahu + ' (' + chartData.rahu_deg + ' deg)';
      if (chartData.ketu) systemPrompt += '\nKETU = ' + chartData.ketu + ' (' + chartData.ketu_deg + ' deg)';
      if (chartData.dasha) {
        systemPrompt += '\n\nVIMSHOTTARI DASHA (EXACT FROM CALCULATION - USE THESE VALUES ONLY):\n' + chartData.dasha;
        systemPrompt += '\nWARNING: Use ONLY the dasha periods listed above. Do NOT calculate or guess dasha periods.';
      }
      systemPrompt += '\nWARNING: If you give different values than above, you are WRONG. Use ONLY these exact planetary positions.';
    }

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, system: systemPrompt, messages })
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

// ===== FORGOT PASSWORD ROUTES =====

app.post('/forgot-password', async function(req, res) {
  try {
    var { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email zaroori hai!' });
    email = email.toLowerCase().trim();

    // Check if user exists
    var users = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email) + '&select=id,full_name');
    if (!users || users.length === 0) return res.status(404).json({ error: 'Yeh email registered nahi hai!' });

    // Generate 6 digit OTP
    var otp = Math.floor(100000 + Math.random() * 900000).toString();
    var expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore[email] = { otp, expiry };

    // Send email via Gmail SMTP using nodemailer
    console.log('Sending OTP to:', email);
    var emailHtml = '<div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;background:#1a0533;color:#fff;border-radius:12px;">' +
      '<div style="text-align:center;margin-bottom:20px;">' +
      '<h1 style="color:#f5a623;font-size:28px;margin:0;">JyotishAI</h1></div>' +
      '<h2 style="color:#f5a623;">Password Reset OTP</h2>' +
      '<p>Namaste! Your OTP for password reset is:</p>' +
      '<div style="background:#2d0a4e;padding:20px;border-radius:8px;text-align:center;margin:20px 0;">' +
      '<h1 style="color:#f5a623;font-size:42px;letter-spacing:8px;margin:0;">' + otp + '</h1></div>' +
      '<p style="color:#ccc;">This OTP is valid for <strong style="color:#f5a623;">10 minutes</strong> only.</p>' +
      '<p style="color:#ccc;">If you did not request this, please ignore this email.</p>' +
      '<p style="color:#888;font-size:12px;margin-top:20px;">Note: Jyotish is for spiritual guidance only.</p></div>';

    // Send via Resend API using Node.js https module
    await new Promise(function(resolve, reject) {
      var https = require('https');
      var payload = JSON.stringify({
        from: 'JyotishAI <noreply@askjyotishai.com>',
        to: [email],
        subject: 'JyotishAI - Password Reset OTP',
        html: emailHtml
      });
      var options = {
        hostname: 'api.resend.com',
        port: 443,
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + RESEND_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      var req = https.request(options, function(resp) {
        var body = '';
        resp.on('data', function(chunk) { body += chunk; });
        resp.on('end', function() {
          console.log('Resend response:', resp.statusCode, body);
          if (resp.statusCode >= 200 && resp.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error('Resend failed: ' + resp.statusCode + ' ' + body));
          }
        });
      });
      req.on('error', function(err) {
        console.error('Resend request error:', err.message);
        reject(err);
      });
      req.setTimeout(15000, function() {
        req.destroy();
        reject(new Error('Resend request timeout'));
      });
      req.write(payload);
      req.end();
    });

    console.log('OTP sent successfully to:', email, '| OTP:', otp);
    res.json({ success: true, message: 'OTP sent! Check your email.' });
  } catch(e) {
    console.error('Forgot password error FULL:', e);
    res.status(500).json({ error: e.message || 'Email send failed' });
  }
});

app.post('/verify-otp', async function(req, res) {
  try {
    var { email, otp, new_password } = req.body;
    if (!email || !otp || !new_password) return res.status(400).json({ error: 'Email, OTP aur naya password chahiye!' });
    email = email.toLowerCase().trim();

    // Check OTP
    var stored = otpStore[email];
    if (!stored) return res.status(400).json({ error: 'OTP nahi mila. Pehle forgot password karo.' });
    if (Date.now() > stored.expiry) {
      delete otpStore[email];
      return res.status(400).json({ error: 'OTP expire ho gaya! Dobara try karo.' });
    }
    if (stored.otp !== otp.toString().trim()) return res.status(400).json({ error: 'Galat OTP! Dobara check karo.' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Password min 6 characters hona chahiye!' });

    // Update password
    var updated = await supabase('users', 'PATCH', { password_hash: hashPassword(new_password) }, '?email=eq.' + encodeURIComponent(email) + '&select=id');
    // Supabase PATCH returns empty array on success - that's ok
    console.log('Password update result:', JSON.stringify(updated));

    // Clear OTP
    delete otpStore[email];
    console.log('Password reset successful for:', email);
    res.json({ success: true, message: 'Password successfully reset! Ab login karo.' });
  } catch(e) {
    console.error('Verify OTP error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Keep alive
setInterval(async function() {
  try { await fetch('https://jyotishai-backend.onrender.com/ping'); console.log('Keep alive ping sent'); } catch(e) {}
}, 9 * 60 * 1000); // 9 min - keeps Render free tier alive (spins down after 15 min)

var PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
  console.log('JyotishAI server running on port ' + PORT);
  console.log('ASTRO_API_KEY:', ASTRO_KEY ? 'SET' : 'MISSING');
});
