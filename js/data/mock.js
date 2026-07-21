/**
 * Single mock data source for every view.
 * Seeded PRNG so charts stay stable across re-renders and navigation.
 */

function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

const rng = makeRng(20260717);

function pick(arr) {
    return arr[Math.floor(rng() * arr.length)];
}

function range(n, fn) {
    return Array.from({ length: n }, (_, i) => fn(i));
}

/* ---------------------------------------------------------------- Districts */

/** All 24 Jharkhand districts with centroid, population, and exposure counts. */
export const DISTRICTS = [
    { id: 'ranchi',        name: 'Ranchi',           lat: 23.3441, lng: 85.3096, population: 2914253, area: 5097 },
    { id: 'east-singhbhum',name: 'East Singhbhum',   lat: 22.8046, lng: 86.2029, population: 2293919, area: 3562 },
    { id: 'dhanbad',       name: 'Dhanbad',          lat: 23.7957, lng: 86.4304, population: 2684487, area: 2052 },
    { id: 'bokaro',        name: 'Bokaro',           lat: 23.6693, lng: 86.1511, population: 2062330, area: 2861 },
    { id: 'giridih',       name: 'Giridih',          lat: 24.1913, lng: 86.3095, population: 2445474, area: 4854 },
    { id: 'palamu',        name: 'Palamu',           lat: 24.0333, lng: 84.0667, population: 1939869, area: 4393 },
    { id: 'hazaribagh',    name: 'Hazaribagh',       lat: 23.9925, lng: 85.3637, population: 1734495, area: 4302 },
    { id: 'west-singhbhum',name: 'West Singhbhum',   lat: 22.5600, lng: 85.8200, population: 1502338, area: 5290 },
    { id: 'deoghar',       name: 'Deoghar',          lat: 24.4823, lng: 86.6997, population: 1492073, area: 2479 },
    { id: 'garhwa',        name: 'Garhwa',           lat: 24.1600, lng: 83.8100, population: 1322784, area: 4093 },
    { id: 'godda',         name: 'Godda',            lat: 24.8270, lng: 87.2130, population: 1313551, area: 2110 },
    { id: 'sahibganj',     name: 'Sahibganj',        lat: 25.2380, lng: 87.6390, population: 1150038, area: 1599 },
    { id: 'dumka',         name: 'Dumka',            lat: 24.2676, lng: 87.2497, population: 1321442, area: 3761 },
    { id: 'chatra',        name: 'Chatra',           lat: 24.2064, lng: 84.8712, population: 1042886, area: 3706 },
    { id: 'gumla',         name: 'Gumla',            lat: 23.0444, lng: 84.5385, population: 1025213, area: 5327 },
    { id: 'koderma',       name: 'Koderma',          lat: 24.4677, lng: 85.5940, population: 716259,  area: 1312 },
    { id: 'jamtara',       name: 'Jamtara',          lat: 23.9600, lng: 86.8000, population: 791042,  area: 1802 },
    { id: 'latehar',       name: 'Latehar',          lat: 23.7450, lng: 84.4998, population: 726978,  area: 3630 },
    { id: 'lohardaga',     name: 'Lohardaga',        lat: 23.4333, lng: 84.6833, population: 461790,  area: 1491 },
    { id: 'pakur',         name: 'Pakur',            lat: 24.6333, lng: 87.8500, population: 900422,  area: 1811 },
    { id: 'ramgarh',       name: 'Ramgarh',          lat: 23.6300, lng: 85.5600, population: 949159,  area: 1341 },
    { id: 'saraikela',     name: 'Saraikela-Kharsawan', lat: 22.7000, lng: 85.9300, population: 1065056, area: 2657 },
    { id: 'simdega',       name: 'Simdega',          lat: 22.6167, lng: 84.5167, population: 599578,  area: 3774 },
    { id: 'khunti',        name: 'Khunti',           lat: 23.0760, lng: 85.2778, population: 531885,  area: 2535 }
];

export const RISK_LEVELS = {
    severe:  { label: 'Severe',  color: '#EF4444', rank: 4 },
    warning: { label: 'Warning', color: '#FF8A00', rank: 3 },
    watch:   { label: 'Watch',   color: '#F59E0B', rank: 2 },
    normal:  { label: 'Normal',  color: '#22C55E', rank: 1 }
};

/** Districts currently in each risk band. Everything else is normal. */
const RISK_ASSIGNMENT = {
    ranchi: 'severe',
    khunti: 'severe',
    'east-singhbhum': 'severe',
    dhanbad: 'warning',
    bokaro: 'warning',
    ramgarh: 'watch',
    hazaribagh: 'watch',
    giridih: 'watch',
    saraikela: 'watch'
};

/** Districts enriched with live risk score, exposure, and deployment counts. */
export const DISTRICT_RISK = DISTRICTS.map((d, i) => {
    const level = RISK_ASSIGNMENT[d.id] || 'normal';
    const base = { severe: 82, warning: 62, watch: 42, normal: 14 }[level];
    return {
        ...d,
        level,
        riskScore: Math.round(base + rng() * 14),
        strikes24h: Math.round(
            { severe: 600, warning: 260, watch: 90, normal: 15 }[level] * (0.6 + rng() * 0.9)
        ),
        schools: Math.round(d.population / 2000),
        hospitals: Math.max(3, Math.round(d.population / 65000)),
        powerStations: Math.max(1, Math.round(d.population / 360000)),
        criticalInfra: Math.max(4, Math.round(d.population / 120000)),
        teamsDeployed: level === 'severe' ? 4 + Math.floor(rng() * 6) : level === 'warning' ? 2 + Math.floor(rng() * 3) : 0,
        sheltersOpen: level === 'severe' ? 8 + Math.floor(rng() * 10) : level === 'warning' ? 3 + Math.floor(rng() * 5) : 0
    };
});

export function districtById(id) {
    return DISTRICT_RISK.find((d) => d.id === id);
}

/** Districts sorted most-dangerous-first. */
export function districtsByRisk() {
    return [...DISTRICT_RISK].sort((a, b) => b.riskScore - a.riskScore);
}

/* ---------------------------------------------------------------- Lightning */

/** Recent strikes, newest first. `secondsAgo` drives the live feed. */
export const STRIKES = range(180, (i) => {
    const d = pick(DISTRICT_RISK.filter((x) => x.level !== 'normal'));
    const jitter = () => (rng() - 0.5) * 0.55;
    const cg = rng() > 0.28;
    return {
        id: `STK-${String(24910 - i).padStart(5, '0')}`,
        lat: d.lat + jitter(),
        lng: d.lng + jitter(),
        districtId: d.id,
        districtName: d.name,
        secondsAgo: Math.round(2 + i * (14 + rng() * 40)),
        peakCurrent: Math.round((rng() > 0.8 ? 1 : -1) * (8 + rng() * 92)),
        type: cg ? 'CG' : 'IC', // cloud-to-ground vs intra-cloud
        altitude: cg ? 0 : Math.round(3000 + rng() * 7000)
    };
});

export const STRIKE_SUMMARY = {
    today: 3492,
    lastHour: 284,
    cgShare: 0.72,
    peakCurrentMax: -98,
    trend7d: [420, 850, 1200, 310, 45, 2100, 3492],
    alertsIssued7d: [12, 25, 42, 5, 1, 65, 84],
    hourly: range(24, (h) => Math.round(20 + Math.pow(Math.max(0, h - 8), 1.9) * (0.6 + rng() * 0.8)))
};

/** Tracked storm cells with movement vectors. */
export const STORM_CELLS = [
    { id: 'CELL-01', lat: 23.42, lng: 85.18, radiusKm: 18, severity: 'severe',  bearing: 68,  speedKmh: 32, etaMins: 15, districtId: 'ranchi' },
    { id: 'CELL-02', lat: 22.88, lng: 86.05, radiusKm: 12, severity: 'warning', bearing: 310, speedKmh: 24, etaMins: 38, districtId: 'east-singhbhum' },
    { id: 'CELL-03', lat: 23.72, lng: 86.32, radiusKm: 9,  severity: 'watch',   bearing: 45,  speedKmh: 18, etaMins: 62, districtId: 'dhanbad' }
];

/* ------------------------------------------------------------------ Weather */

export const WEATHER_NOW = {
    stationId: 'AWS-RNC-01',
    location: 'Ranchi',
    temperature: 28,
    humidity: 85,
    rainfall: 12,
    windSpeed: 45,
    windDir: 'NE',
    pressure: 1002,
    visibility: 2,
    uvIndex: 6,
    dewPoint: 25,
    cape: 2840,   // J/kg — convective available potential energy
    cin: -45,     // J/kg — convective inhibition
    liftedIndex: -6.2
};

/** One row per AWS station. */
export const WEATHER_STATIONS = DISTRICT_RISK.slice(0, 12).map((d, i) => ({
    id: `AWS-${d.id.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
    districtId: d.id,
    districtName: d.name,
    temperature: Math.round(24 + rng() * 9),
    humidity: Math.round(58 + rng() * 38),
    rainfall: Math.round(rng() * 34),
    windSpeed: Math.round(6 + rng() * 48),
    windDir: pick(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']),
    pressure: Math.round(996 + rng() * 12),
    status: rng() > 0.12 ? 'online' : 'offline'
}));

/** 24h of hourly readings for trend charts. */
export const WEATHER_TREND = {
    hours: range(24, (h) => `${String(h).padStart(2, '0')}:00`),
    temperature: range(24, (h) => Math.round((24 + Math.sin((h - 6) / 3.8) * 6 + rng() * 1.5) * 10) / 10),
    humidity: range(24, (h) => Math.round(62 + Math.sin((h - 18) / 3.8) * 18 + rng() * 4)),
    pressure: range(24, () => Math.round((1002 + (rng() - 0.5) * 6) * 10) / 10),
    windSpeed: range(24, (h) => Math.round(10 + Math.pow(Math.max(0, h - 10), 1.4) * 0.8 + rng() * 6))
};

/* -------------------------------------------------------- Electric field EFM */

export const EFM = {
    current: 4.2,
    thresholds: { safe: 2, warning: 4 },
    trend: [1.2, 1.5, 2.1, 2.8, 3.5, 4.2],
    stations: DISTRICT_RISK.slice(0, 8).map((d, i) => ({
        id: `EFM-${String(i + 1).padStart(3, '0')}`,
        districtId: d.id,
        districtName: d.name,
        reading: Math.round((0.4 + rng() * 4.6) * 10) / 10,
        status: rng() > 0.15 ? 'online' : 'offline'
    }))
};

/* ------------------------------------------------------------------ Sensors */

export const SENSOR_TYPES = ['Lightning Detector', 'EFM', 'AWS', 'Rain Gauge', 'Wind Sensor'];

/** Every measurable a sensor can report — the multi-select in the add wizard. */
export const DATA_PARAMETERS = [
    'Temperature', 'Humidity', 'Pressure', 'Rainfall', 'Wind Speed', 'Wind Direction',
    'Electric Field', 'Lightning Count', 'Strike Distance', 'Peak Current', 'Visibility'
];

/** Per-type defaults: what it measures, its unit, and warning/critical bands. */
export const SENSOR_TYPE_META = {
    'Lightning Detector': { params: ['Lightning Count', 'Strike Distance', 'Peak Current'], unit: 'strikes/min', warn: 15, crit: 30, freq: '1 Hz' },
    'EFM':                { params: ['Electric Field'], unit: 'kV/m', warn: 2, crit: 4, freq: '10 Hz' },
    'AWS':                { params: ['Temperature', 'Humidity', 'Pressure', 'Wind Speed', 'Wind Direction'], unit: 'mixed', warn: 60, crit: 90, freq: '1/min' },
    'Rain Gauge':         { params: ['Rainfall'], unit: 'mm', warn: 50, crit: 100, freq: '1/min' },
    'Wind Sensor':        { params: ['Wind Speed', 'Wind Direction'], unit: 'km/h', warn: 40, crit: 60, freq: '1 Hz' }
};

export const SENSOR_VENDORS = ['Vaisala', 'Campbell Scientific', 'Biral', 'Earth Networks', 'Lufft', 'NESA'];
export const DEPARTMENTS = ['Disaster Management', 'IMD Jharkhand', 'Mining Department', 'Power Utilities', 'Forest Department'];
export const PROTOCOLS = ['REST API', 'MQTT', 'Modbus', 'OPC-UA', 'TCP/IP', 'LoRaWAN', 'NB-IoT', 'RS485'];
export const CONNECTION_METHODS = ['API', 'Gateway', 'Direct'];
export const AUTH_TYPES = ['API Key', 'Username & Password', 'OAuth', 'Certificate'];
export const POLLING_INTERVALS = ['30 sec', '1 min', '5 min'];
const SITE_KINDS = ['Control Room', 'Block Office', 'Grid Station', 'Mine Site', 'Forest Range', 'School Campus', 'AWS Tower'];

export const SENSORS = range(64, (i) => {
    // The base object keeps the ORIGINAL rng() sequence untouched, so existing
    // sensor data (and everything generated after it) is identical to before.
    const d = pick(DISTRICT_RISK);
    const status = rng() > 0.92 ? 'offline' : rng() > 0.88 ? 'degraded' : 'online';
    const base = {
        id: `SEN-${String(1001 + i)}`,
        type: pick(SENSOR_TYPES),
        districtId: d.id,
        districtName: d.name,
        lat: d.lat + (rng() - 0.5) * 0.3,
        lng: d.lng + (rng() - 0.5) * 0.3,
        status,
        battery: Math.round(status === 'offline' ? rng() * 20 : 40 + rng() * 60),
        signal: Math.round(status === 'offline' ? 0 : 45 + rng() * 55),
        latencyMs: status === 'offline' ? null : Math.round(14 + rng() * 40),
        lastSeenMins: status === 'offline' ? Math.round(30 + rng() * 900) : Math.round(rng() * 3),
        firmware: `v${2 + Math.floor(rng() * 2)}.${Math.floor(rng() * 9)}.${Math.floor(rng() * 9)}`,
        installedOn: `20${20 + Math.floor(rng() * 5)}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-15`,
        lastCalibrated: `2026-${String(1 + Math.floor(rng() * 6)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`
    };
    // Enrichment is DETERMINISTIC (index-based, no rng) so it doesn't perturb
    // the seeded sequence — the existing sensors' core data is unchanged.
    const meta = SENSOR_TYPE_META[base.type];
    const pfx = d.id.slice(0, 3).toUpperCase();
    return {
        ...base,
        name: `${base.type.split(' ')[0]}-${pfx}-${String(i + 1).padStart(3, '0')}`,
        vendor: SENSOR_VENDORS[i % SENSOR_VENDORS.length],
        model: `${base.type.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${1000 + ((i * 137) % 9000)}`,
        department: DEPARTMENTS[i % DEPARTMENTS.length],
        location: `${d.name} ${SITE_KINDS[i % SITE_KINDS.length]}`,
        description: `${base.type} monitoring unit deployed at ${d.name}.`,
        protocol: PROTOCOLS[i % PROTOCOLS.length],
        connectionMethod: CONNECTION_METHODS[i % CONNECTION_METHODS.length],
        gateway: `GW-${pfx}-${(i % 9) + 1}`,
        ipHost: `10.42.${i % 255}.${((i * 7) % 254) + 1}`,
        port: [1883, 502, 8080, 443, 5683][i % 5],
        apiEndpoint: base.type === 'AWS' ? '/api/v1/weather' : '/api/v1/telemetry',
        authType: AUTH_TYPES[i % AUTH_TYPES.length],
        pollingInterval: POLLING_INTERVALS[i % POLLING_INTERVALS.length],
        dataParameters: meta.params,
        unit: meta.unit,
        samplingFrequency: meta.freq,
        warningThreshold: meta.warn,
        criticalThreshold: meta.crit
    };
});

export const SENSOR_HEALTH = {
    uptime: 99.8,
    latencyMs: 24,
    offlineEfm: 3,
    lowBattery: 12,
    imdSync: 'connected',
    latencyTrend: [22, 24, 23, 26, 24, 25, 23, 24],
    uptimeTrend30d: range(30, () => Math.round((99.2 + rng() * 0.8) * 100) / 100)
};

/* ---------------------------------------------------------------- Incidents */

const INCIDENT_TYPES = ['Lightning Casualty', 'Power Grid Trip', 'Structure Damage', 'Livestock Loss', 'Tree Fall', 'Waterlogging'];
const INCIDENT_STATUS = ['open', 'assigned', 'in-progress', 'resolved', 'closed'];

export const INCIDENTS = range(28, (i) => {
    const d = pick(DISTRICT_RISK);
    const status = pick(INCIDENT_STATUS);
    const severity = pick(['severe', 'warning', 'watch']);
    return {
        id: `INC-2026-${String(4210 - i).padStart(4, '0')}`,
        type: pick(INCIDENT_TYPES),
        districtId: d.id,
        districtName: d.name,
        severity,
        status,
        reportedAt: `2026-07-${String(17 - Math.floor(i / 4)).padStart(2, '0')} ${String(6 + Math.floor(rng() * 17)).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}`,
        casualties: severity === 'severe' ? Math.floor(rng() * 4) : 0,
        injured: severity === 'severe' ? Math.floor(rng() * 8) : Math.floor(rng() * 2),
        assignedTo: status === 'open' ? null : pick(['SDRF Team 3', 'NDRF Bn-9', 'District Control Room', 'Fire Services', 'Block Officer']),
        damageEstimate: Math.round(rng() * 40) * 25000
    };
});

export const INCIDENT_SUMMARY = {
    open: INCIDENTS.filter((i) => i.status === 'open').length,
    active: INCIDENTS.filter((i) => ['assigned', 'in-progress'].includes(i.status)).length,
    resolved24h: INCIDENTS.filter((i) => ['resolved', 'closed'].includes(i.status)).length,
    casualtiesYtd: 47,
    avgResponseMins: 18
};

/* ------------------------------------------------------------------- Alerts */

export const ALERTS = [
    { id: 'ALT-8841', severity: 'severe',  time: '14:28', title: 'Lightning Strike Alert',  desc: 'Ranchi District - 45kA strike detected.', districtId: 'ranchi', icon: 'alert-octagon' },
    { id: 'ALT-8840', severity: 'warning', time: '14:15', title: 'High Electric Field',      desc: 'Khunti EFM station reading > 4.2 kV/m.', districtId: 'khunti', icon: 'alert-triangle' },
    { id: 'ALT-8839', severity: 'watch',   time: '13:50', title: 'Storm Cell Approaching',   desc: 'Storm cell moving NW towards East Singhbhum.', districtId: 'east-singhbhum', icon: 'cloud-lightning' },
    { id: 'ALT-8838', severity: 'warning', time: '13:32', title: 'Wind Gust Threshold',      desc: 'Dhanbad AWS recorded 62 km/h gust.', districtId: 'dhanbad', icon: 'wind' },
    { id: 'ALT-8837', severity: 'severe',  time: '13:11', title: 'Cluster Strike Density',   desc: '38 CG strikes within 10 km of Ranchi city.', districtId: 'ranchi', icon: 'zap' },
    { id: 'ALT-8836', severity: 'normal',  time: '13:00', title: 'System Daily Check',       desc: 'All sensors online and operational.', districtId: null, icon: 'info' }
];

export const ALERT_CHANNELS = [
    { id: 'sms',    name: 'SMS Gateway',      status: 'active',   sent: 84520, delivered: 82104, failed: 2416, icon: 'message-square' },
    { id: 'siren',  name: 'Sirens',           status: 'partial',  sent: 42,    delivered: 38,    failed: 4,    icon: 'siren' },
    { id: 'pa',     name: 'Public Address',   status: 'idle',     sent: 0,     delivered: 0,     failed: 0,    icon: 'megaphone' },
    { id: 'app',    name: 'Mobile App Push',  status: 'active',   sent: 612480, delivered: 601233, failed: 11247, icon: 'smartphone' },
    { id: 'email',  name: 'Email',            status: 'active',   sent: 1840,  delivered: 1822,  failed: 18,   icon: 'mail' },
    { id: 'ivr',    name: 'IVR Voice Call',   status: 'active',   sent: 9240,  delivered: 8109,  failed: 1131, icon: 'phone-call' }
];

export const RECIPIENT_GROUPS = [
    { id: 'public',    name: 'General Public',        count: 1240000, channels: ['sms', 'app', 'siren'] },
    { id: 'officials', name: 'District Officials',    count: 480,     channels: ['sms', 'email', 'ivr'] },
    { id: 'responders',name: 'Emergency Responders',  count: 2140,    channels: ['sms', 'app', 'ivr'] },
    { id: 'schools',   name: 'School Administrators', count: 8420,    channels: ['sms', 'email'] },
    { id: 'mines',     name: 'Mining Operations',     count: 320,     channels: ['sms', 'ivr', 'siren'] }
];

export const ALERT_TEMPLATES = [
    { id: 'TPL-01', name: 'Severe Thunderstorm Warning', severity: 'severe',  channels: ['sms', 'app', 'siren'], body: 'SEVERE THUNDERSTORM WARNING for {{district}}. Seek shelter immediately. Avoid open fields, tall trees, and water bodies. Valid until {{validUntil}}.' },
    { id: 'TPL-02', name: 'Lightning Watch',             severity: 'watch',   channels: ['sms', 'app'],          body: 'Lightning activity detected near {{district}}. Suspend outdoor activities for the next {{duration}}.' },
    { id: 'TPL-03', name: 'All Clear',                   severity: 'normal',  channels: ['sms', 'app'],          body: 'ALL CLEAR for {{district}}. Thunderstorm activity has subsided. Normal activities may resume.' },
    { id: 'TPL-04', name: 'Shelter-in-Place',            severity: 'severe',  channels: ['sms', 'app', 'siren', 'ivr'], body: 'SHELTER IN PLACE - {{district}}. Move indoors now. Nearest shelter: {{shelter}}.' }
];

/* ---------------------------------------------------------------- Resources */

export const RESOURCES = [
    { type: 'SDRF/NDRF Teams',  deployed: 12, standby: 5,   color: 'blue' },
    { type: 'Safe Shelters Open', deployed: 45, standby: 120, color: 'green' },
    { type: 'Ambulances (Active)', deployed: 28, standby: 15, color: 'orange' },
    { type: 'Fire Tenders',     deployed: 14, standby: 32,  color: 'dark' }
];

export const SHELTER_OCCUPANCY = { current: 8420, capacity: 18700, pct: 45 };

export const INFRA_IMPACT = [
    { icon: 'zap-off',     tone: 'red',    title: 'Power Grid Trip',        detail: 'Ranchi Substation 4' },
    { icon: 'shield-alert',tone: 'orange', title: 'Open-Cast Mine Warning', detail: 'Bokaro Collieries' },
    { icon: 'train',       tone: 'yellow', title: 'Rail Traffic Slowdown',  detail: 'Dhanbad Division' },
    { icon: 'tree-pine',   tone: 'green',  title: 'Forest Fire Risk',       detail: 'Normal (Palamu)' }
];

/* ------------------------------------------------------ Automated response */

export const RESPONSE_STEPS = [
    { label: 'SMS Alerts Dispatched',    state: 'completed' },
    { label: 'Collector Alerted (Ranchi)', state: 'completed' },
    { label: 'Control Room Notified',    state: 'completed' },
    { label: 'Police & Fire Dispatching', state: 'pending' },
    { label: 'Ambulance Standby',        state: 'pending' },
    { label: 'Sirens Activated',         state: 'idle' },
    { label: 'Public Address',           state: 'idle' },
    { label: 'SOP Triggered (Level 3)',  state: 'completed' },
    { label: 'Initial Reports Generated', state: 'completed' }
];

/* --------------------------------------------------------- AI risk forecast */

export const AI_FORECAST = {
    riskScore: 94,
    severity: 'severe',
    etaMins: 15,
    direction: 'NE',
    durationMins: 45,
    confidence: 94,
    recommendation: 'Issue immediate shelter-in-place warning for Ranchi district.',
    modelVersion: 'thunderscope-v4.2',
    lastTrained: '2026-06-28',
    /** Next 6 hours of predicted risk per hour. */
    timeline: range(6, (h) => ({
        hour: `+${h + 1}h`,
        risk: Math.max(8, Math.round(94 - h * 13 + (rng() - 0.5) * 10)),
        confidence: Math.round(94 - h * 6)
    })),
    /** Nowcast accuracy — predicted vs observed over 7 days. */
    accuracy: {
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
        predicted: [38, 72, 88, 24, 6, 84, 94],
        observed: [42, 68, 91, 19, 4, 88, null]
    }
};

/* ------------------------------------------------------------------ Reports */

export const REPORTS = [
    { id: 'RPT-0912', name: 'Daily Thunderstorm Summary',   type: 'Daily',    format: 'PDF',   schedule: 'Every day 06:00',  lastRun: '2026-07-17 06:00', status: 'ready' },
    { id: 'RPT-0911', name: 'District Risk Assessment',     type: 'Weekly',   format: 'PDF',   schedule: 'Mon 08:00',        lastRun: '2026-07-13 08:00', status: 'ready' },
    { id: 'RPT-0910', name: 'Sensor Network Health Audit',  type: 'Weekly',   format: 'Excel', schedule: 'Fri 18:00',        lastRun: '2026-07-11 18:00', status: 'ready' },
    { id: 'RPT-0909', name: 'Incident Register',            type: 'Monthly',  format: 'Excel', schedule: '1st of month',     lastRun: '2026-07-01 00:00', status: 'ready' },
    { id: 'RPT-0908', name: 'Alert Delivery Compliance',    type: 'Monthly',  format: 'PDF',   schedule: '1st of month',     lastRun: '2026-07-01 00:00', status: 'generating' },
    { id: 'RPT-0907', name: 'Seasonal Lightning Analysis',  type: 'Seasonal', format: 'PDF',   schedule: 'Manual',           lastRun: '2026-06-30 12:00', status: 'ready' }
];

export const AUDIT_LOG = range(14, (i) => ({
    id: `AUD-${String(9840 - i)}`,
    user: pick(['admin@jharkhand.gov.in', 'coordinator.ranchi', 'sdrf.ops', 'system']),
    action: pick(['Issued severe alert', 'Acknowledged incident', 'Updated SOP rule', 'Exported report', 'Modified threshold', 'Added user', 'Sensor recalibrated']),
    target: pick(['Ranchi', 'INC-2026-4210', 'SOP-Level-3', 'RPT-0912', 'EFM-003']),
    at: `2026-07-${String(17 - Math.floor(i / 3)).padStart(2, '0')} ${String(8 + Math.floor(rng() * 12)).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}`,
    ip: `10.42.${Math.floor(rng() * 255)}.${Math.floor(rng() * 255)}`
}));

/* ----------------------------------------------------------- SOP automation */

export const SOP_RULES = [
    {
        id: 'SOP-001', name: 'Severe Strike Density Response', level: 3, enabled: true,
        trigger: 'CG strike count > 25 within 10 km radius in 15 min',
        conditions: ['District population > 500,000', 'Time between 06:00-22:00'],
        actions: ['Dispatch SMS to General Public', 'Alert District Collector', 'Activate sirens', 'Notify SDRF'],
        lastFired: '2026-07-17 13:11', fireCount: 42
    },
    {
        id: 'SOP-002', name: 'Electric Field Critical', level: 2, enabled: true,
        trigger: 'EFM reading > 4.0 kV/m sustained 5 min',
        conditions: ['Sensor status = online'],
        actions: ['Alert control room', 'Pre-position ambulances', 'Issue lightning watch'],
        lastFired: '2026-07-17 14:15', fireCount: 118
    },
    {
        id: 'SOP-003', name: 'Mining Operations Suspension', level: 3, enabled: true,
        trigger: 'Storm cell ETA < 20 min to mining zone',
        conditions: ['Active mining shift'],
        actions: ['Notify mine control', 'Sound site sirens', 'Log suspension order'],
        lastFired: '2026-07-16 11:04', fireCount: 9
    },
    {
        id: 'SOP-004', name: 'School Closure Advisory', level: 2, enabled: false,
        trigger: 'District risk score > 75 before 07:00',
        conditions: ['Weekday', 'School term active'],
        actions: ['Email school administrators', 'SMS to parents group'],
        lastFired: '2026-06-22 06:30', fireCount: 3
    },
    {
        id: 'SOP-005', name: 'All Clear Automation', level: 1, enabled: true,
        trigger: 'No CG strikes in district for 30 min',
        conditions: ['Prior alert was active'],
        actions: ['Issue all-clear SMS', 'Stand down sirens', 'Close incident window'],
        lastFired: '2026-07-17 09:42', fireCount: 76
    }
];

export const ESCALATION_MATRIX = [
    { level: 1, name: 'Advisory',   owner: 'Control Room Operator',  notify: 'Control room', timeoutMins: 30 },
    { level: 2, name: 'Watch',      owner: 'District Coordinator',   notify: 'District officials, responders', timeoutMins: 15 },
    { level: 3, name: 'Warning',    owner: 'District Collector',     notify: 'All channels, public', timeoutMins: 5 },
    { level: 4, name: 'Emergency',  owner: 'State Relief Commissioner', notify: 'All channels, SDRF/NDRF, CM office', timeoutMins: 2 }
];

export const SOP_EXECUTIONS = range(12, (i) => ({
    id: `EXE-${String(3320 - i)}`,
    ruleId: pick(SOP_RULES).id,
    ruleName: pick(SOP_RULES).name,
    at: `2026-07-17 ${String(14 - Math.floor(i / 2)).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}`,
    districtName: pick(DISTRICT_RISK).name,
    outcome: rng() > 0.15 ? 'success' : 'partial',
    actionsRun: 2 + Math.floor(rng() * 3),
    durationMs: Math.round(200 + rng() * 2400)
}));

/* ----------------------------------------------------------- Administration */

export const USERS = [
    { id: 'U-001', name: 'A. Kumar',      email: 'admin@jharkhand.gov.in',   role: 'State Coordinator', district: 'All',            status: 'active',   lastLogin: '2026-07-17 14:02' },
    { id: 'U-002', name: 'S. Mahato',     email: 'collector.ranchi@jh.gov.in', role: 'District Collector', district: 'Ranchi',       status: 'active',   lastLogin: '2026-07-17 13:48' },
    { id: 'U-003', name: 'R. Oraon',      email: 'sdrf.ops@jh.gov.in',       role: 'Responder',         district: 'Ranchi',         status: 'active',   lastLogin: '2026-07-17 14:11' },
    { id: 'U-004', name: 'P. Singh',      email: 'control.dhanbad@jh.gov.in', role: 'Control Room Operator', district: 'Dhanbad',   status: 'active',   lastLogin: '2026-07-17 12:30' },
    { id: 'U-005', name: 'M. Hembrom',    email: 'analyst@jh.gov.in',        role: 'Analyst',           district: 'All',            status: 'inactive', lastLogin: '2026-07-09 17:20' },
    { id: 'U-006', name: 'K. Tirkey',     email: 'collector.bokaro@jh.gov.in', role: 'District Collector', district: 'Bokaro',      status: 'active',   lastLogin: '2026-07-17 11:05' }
];

export const ROLES = [
    { id: 'R-01', name: 'State Coordinator',     users: 2,  permissions: ['View all', 'Issue alerts', 'Manage SOPs', 'Manage users', 'Export reports'] },
    { id: 'R-02', name: 'District Collector',    users: 24, permissions: ['View district', 'Issue alerts', 'Acknowledge incidents', 'Export reports'] },
    { id: 'R-03', name: 'Control Room Operator', users: 48, permissions: ['View district', 'Acknowledge incidents', 'Dispatch resources'] },
    { id: 'R-04', name: 'Responder',             users: 214,permissions: ['View assigned', 'Update incident status'] },
    { id: 'R-05', name: 'Analyst',               users: 12, permissions: ['View all', 'Export reports'] }
];

export const THRESHOLDS = [
    { id: 'TH-01', name: 'EFM Warning',            value: 2.0,  unit: 'kV/m', scope: 'Statewide' },
    { id: 'TH-02', name: 'EFM Critical',           value: 4.0,  unit: 'kV/m', scope: 'Statewide' },
    { id: 'TH-03', name: 'Strike Density Alert',   value: 25,   unit: 'strikes/15min', scope: 'Per district' },
    { id: 'TH-04', name: 'Wind Gust Advisory',     value: 60,   unit: 'km/h', scope: 'Statewide' },
    { id: 'TH-05', name: 'Risk Score Escalation',  value: 75,   unit: 'score', scope: 'Per district' },
    { id: 'TH-06', name: 'Sensor Offline Timeout', value: 15,   unit: 'minutes', scope: 'Statewide' }
];

export const INTEGRATIONS = [
    { id: 'INT-01', name: 'IMD Weather API',        status: 'connected',  lastSync: '2 min ago',  icon: 'cloud' },
    { id: 'INT-02', name: 'Lightning Network Feed', status: 'connected',  lastSync: '4 sec ago',  icon: 'zap' },
    { id: 'INT-03', name: 'SMS Gateway (NIC)',      status: 'connected',  lastSync: '1 min ago',  icon: 'message-square' },
    { id: 'INT-04', name: 'State GIS Portal',       status: 'connected',  lastSync: '18 min ago', icon: 'map' },
    { id: 'INT-05', name: 'NDMA Reporting',         status: 'degraded',   lastSync: '2 hrs ago',  icon: 'file-text' },
    { id: 'INT-06', name: 'Siren Control Network',  status: 'connected',  lastSync: '30 sec ago', icon: 'siren' }
];

/* ------------------------------------------------- Historical / analytics */

export const HISTORICAL = {
    years: ['2021', '2022', '2023', '2024', '2025', '2026'],
    annualStrikes: [412000, 448200, 501300, 476800, 538400, 312900],
    annualCasualties: [312, 289, 341, 298, 276, 47],
    /** Strikes per month, averaged across years — shows monsoon seasonality. */
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthlyAvg: [4200, 8100, 22400, 48200, 71300, 92800, 88400, 76200, 54100, 21800, 6400, 3100],
    /** Top hotspot districts by strike count, current year. */
    hotspots: districtsByRisk().slice(0, 8).map((d) => ({
        districtId: d.id,
        name: d.name,
        strikes: d.strikes24h * 60 + Math.round(rng() * 4000),
        casualties: Math.round(rng() * 12),
        trend: rng() > 0.5 ? 'up' : 'down'
    }))
};

/* ------------------------------------------------------------------ Ticker */

export const ADVISORY_TEXT =
    'Severe thunderstorm activity detected across Ranchi, Khunti, and East Singhbhum. District officials have been notified. ' +
    'Citizens are advised to avoid open fields and suspend outdoor activities. • Electric Field readings elevated in Dhanbad. • ' +
    'Normal weather conditions in Garhwa and Palamu.';

export const DATA_SOURCES = 'Lightning Network • EFM • AWS • Rain Gauges • Wind Sensors • IMD';

/* ------------------------------------------------------------ Notifications */

export const NOTIFICATIONS = [
    { id: 'N-01', severity: 'severe',  title: 'Severe alert issued',   desc: 'Ranchi district shelter-in-place', time: '2 min ago', read: false },
    { id: 'N-02', severity: 'warning', title: 'Sensor offline',        desc: 'EFM-003 (Khunti) unreachable 32 min', time: '32 min ago', read: false },
    { id: 'N-03', severity: 'watch',   title: 'SOP-002 fired',         desc: 'Electric Field Critical → 3 actions run', time: '1 hr ago', read: false }
];

/* ------------------------------------------------- Derived selectors -------
   Single source of truth for every "how many …" figure. The Dashboard, the
   shell, and the detail views must all read these so they can never disagree
   (previously the Dashboard hardcoded numbers that contradicted the data). */

/** Districts in each risk band, e.g. { severe, warning, watch, normal }. */
export function riskCounts() {
    return DISTRICT_RISK.reduce(
        (acc, d) => ((acc[d.level] = (acc[d.level] || 0) + 1), acc),
        { severe: 0, warning: 0, watch: 0, normal: 0 }
    );
}

/** Districts above 'normal' (severe + warning + watch). */
export function elevatedDistrictCount() {
    return DISTRICT_RISK.filter((d) => d.level !== 'normal').length;
}

/** High-risk districts = severe or warning. */
export function highRiskDistrictCount() {
    return DISTRICT_RISK.filter((d) => ['severe', 'warning'].includes(d.level)).length;
}

/** Total population living in any non-normal district. */
export function populationUnderAlert() {
    return DISTRICT_RISK
        .filter((d) => d.level !== 'normal')
        .reduce((sum, d) => sum + d.population, 0);
}

/** Alert tallies: total issued, active (non-normal), and by top severities. */
export function alertCounts() {
    return {
        total: ALERTS.length,
        active: ALERTS.filter((a) => a.severity !== 'normal').length,
        severe: ALERTS.filter((a) => a.severity === 'severe').length,
        warning: ALERTS.filter((a) => a.severity === 'warning').length
    };
}

/** Sensor fleet counts by status: { total, online, degraded, offline }. */
export function sensorCounts() {
    return {
        total: SENSORS.length,
        online: SENSORS.filter((s) => s.status === 'online').length,
        degraded: SENSORS.filter((s) => s.status === 'degraded').length,
        offline: SENSORS.filter((s) => s.status === 'offline').length
    };
}
