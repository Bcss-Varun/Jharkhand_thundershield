/**
 * Leaflet helpers shared by the dashboard, risk map, lightning, and sensor views.
 */

import { track } from './router.js';
import { RISK_LEVELS } from './data/mock.js';
import { esc, num } from './components.js';

export const JHARKHAND_BOUNDS = [
    [21.96, 83.33], // SW
    [25.33, 87.96]  // NE
];

const BASEMAPS = {
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};

/**
 * Create a map fitted to Jharkhand and register it for teardown.
 * Always call this from a view's mount() — Leaflet needs the container to
 * have real dimensions, which it only has after insertion into the DOM.
 */
export function createMap(elId, { zoomControl = true, basemap = 'light', bounds = JHARKHAND_BOUNDS } = {}) {
    const el = document.getElementById(elId);
    if (!el) return null;

    const map = L.map(elId, {
        zoomControl: false,
        attributionControl: false,
        // Scroll-wheel zoom hijacks page scrolling and made the map creep in
        // on hover — use the +/- control (or double-click) to zoom instead.
        scrollWheelZoom: false,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        minZoom: 6
    }).fitBounds(bounds);

    L.tileLayer(BASEMAPS[basemap] || BASEMAPS.light, { maxZoom: 19 }).addTo(map);
    if (zoomControl) L.control.zoom({ position: 'topright' }).addTo(map);

    // A map created while its container is still settling measures 0x0 and
    // renders grey. Re-measure once layout is final.
    setTimeout(() => map.invalidateSize(), 0);

    return track(map);
}


/**
 * The GeoJSON `Dist_Name` field spells a few districts differently from the
 * mock data. Without this, those districts fail to match and silently fall
 * back to a default — colouring the choropleth differently from every table.
 */
const NAME_ALIASES = {
    'sahebganj': 'sahibganj',
    'kodarma': 'koderma',
    'seraikela-kharsawan': 'saraikela-kharsawan',
    'seraikela kharsawan': 'saraikela-kharsawan',
    'saraikela kharsawan': 'saraikela-kharsawan'
};

function normalizeName(name) {
    const key = String(name || '').trim().toLowerCase();
    return NAME_ALIASES[key] || key;
}

/** Resolve a GeoJSON district name to its record in the live data. */
function findDistrict(name, districts) {
    const key = normalizeName(name);
    return districts.find((d) => normalizeName(d.name) === key) || null;
}

function getColorForRisk(level) {
    return RISK_LEVELS[level]?.color || '#22C55E';
}

/** District risk GeoJSON choropleth layer. `onHover(d)` fires when the pointer
    enters a district (and the district highlights); `onClick(d)` on click. */
export function addDistrictRiskLayer(map, districts, { onClick, onHover } = {}) {
    // A clicked district stays selected (warm amber outline) until another is
    // clicked; hover gives a lighter orange preview.
    let selected = null;
    const SELECT = { weight: 4, color: '#F59E0B', fillOpacity: 0.95 };
    const HOVER = { weight: 3, color: '#FB923C', fillOpacity: 0.9 };
    const geojsonLayer = L.geoJSON(null, {
        style: function(feature) {
            const d = findDistrict(feature.properties.Dist_Name, districts);
            const risk = d ? d.level : 'normal';
            const color = getColorForRisk(risk);
            return {
                fillColor: color,
                weight: 1.5,
                opacity: 1,
                color: '#FFFFFF',
                fillOpacity: risk === 'normal' ? 0.35 : 0.75
            };
        },
        onEachFeature: function(feature, layer) {
            const name = feature.properties.Dist_Name || '';
            const d = findDistrict(name, districts);
            const level = d ? d.level : 'normal';
            const meta = RISK_LEVELS[level] || { color: '#22C55E', label: 'Normal' };
            // No fabricated stats when a district isn't in the dataset — show '—'.
            layer.bindPopup(`
                <div class="map-popup">
                    <div class="map-popup-title">${esc(d ? d.name : name)}</div>
                    <div class="map-popup-row"><span>Risk level</span><strong style="color:${meta.color}">${esc(meta.label)}</strong></div>
                    <div class="map-popup-row"><span>Risk Score</span><strong>${d ? esc(d.riskScore) + '/100' : '—'}</strong></div>
                    <div class="map-popup-row"><span>Strikes (24h)</span><strong>${d ? num(d.strikes24h) : '—'}</strong></div>
                    <div class="map-popup-row"><span>Population</span><strong>${d ? num(d.population) : '—'}</strong></div>
                </div>`);

            if (!d) return; // districts absent from the dataset aren't interactive

            // Hover → light orange preview (unless this one is the selected).
            layer.on('mouseover', () => {
                if (layer !== selected) {
                    layer.setStyle(HOVER);
                    layer.bringToFront();
                }
                if (onHover) onHover(d);
            });
            layer.on('mouseout', () => {
                if (layer !== selected) geojsonLayer.resetStyle(layer);
            });

            // Click → select: warm amber highlight that persists, plus detail.
            layer.on('click', () => {
                if (selected && selected !== layer) geojsonLayer.resetStyle(selected);
                layer.setStyle(SELECT);
                layer.bringToFront();
                selected = layer;
                if (onClick) onClick(d);
            });
        }
    }).addTo(map);

    fetch('assets/jharkhand.geojson')
        .then(res => res.json())
        .then(data => {
            geojsonLayer.addData(data);

            // Add custom labels at district centroids
            geojsonLayer.eachLayer(layer => {
                const name = layer.feature.properties.Dist_Name;
                const centroid = layer.getBounds().getCenter();
                L.marker(centroid, {
                    icon: L.divIcon({
                        className: 'district-label',
                        html: `<span>${name}</span>`,
                        iconSize: [80, 20]
                    })
                }).addTo(map);
            });

            // Lock the view to Jharkhand: fit the state, and stop pan/zoom-out
            // from leaving it.
            const b = geojsonLayer.getBounds();
            if (b.isValid()) {
                map.fitBounds(b, { padding: [8, 8] });
                map.setMaxBounds(b.pad(0.08));
                map.setMinZoom(map.getZoom());
            }
        })
        .catch(err => console.error('Error loading Jharkhand GeoJSON:', err));

    return geojsonLayer;
}

/** Circle markers for lightning strikes, styled as custom icons. */
export function addStrikeLayer(map, strikes, { onClick } = {}) {
    const layer = L.layerGroup();
    strikes.forEach((s) => {
        const marker = L.marker([s.lat, s.lng], {
            icon: L.divIcon({
                className: 'map-strike-marker',
                html: `<div class="pulse-strike ${s.type === 'CG' ? 'cg' : 'ic'}"><i data-lucide="zap"></i></div>`,
                iconSize: [20, 20]
            })
        });
        marker.bindPopup(`
            <div class="map-popup">
                <div class="map-popup-title">${esc(s.id)}</div>
                <div class="map-popup-row"><span>District</span><strong>${esc(s.districtName)}</strong></div>
                <div class="map-popup-row"><span>Peak current</span><strong>${esc(s.peakCurrent)} kA</strong></div>
                <div class="map-popup-row"><span>Type</span><strong>${s.type === 'CG' ? 'Cloud-to-Ground' : 'Intra-Cloud'}</strong></div>
            </div>`);
        if (onClick) marker.on('click', () => onClick(s));
        layer.addLayer(marker);
    });
    layer.addTo(map);
    return layer;
}

/** Storm cells with a movement-direction arrow. */
export function addStormCellLayer(map, cells) {
    const layer = L.layerGroup();
    cells.forEach((c) => {
        const color = RISK_LEVELS[c.severity].color;
        L.circle([c.lat, c.lng], {
            radius: c.radiusKm * 1000,
            fillColor: color,
            color,
            weight: 2,
            dashArray: '6 4',
            fillOpacity: 0.12
        })
            .bindPopup(`
                <div class="map-popup">
                    <div class="map-popup-title">${esc(c.id)}</div>
                    <div class="map-popup-row"><span>Severity</span><strong style="color:${color}">${esc(RISK_LEVELS[c.severity].label)}</strong></div>
                    <div class="map-popup-row"><span>Speed</span><strong>${esc(c.speedKmh)} km/h</strong></div>
                    <div class="map-popup-row"><span>ETA</span><strong>${esc(c.etaMins)} min</strong></div>
                </div>`)
            .addTo(layer);

        // Movement vector: project the cell forward along its bearing.
        const distDeg = (c.speedKmh * 0.5) / 111;
        const rad = (c.bearing * Math.PI) / 180;
        const end = [c.lat + Math.cos(rad) * distDeg, c.lng + Math.sin(rad) * distDeg];
        L.polyline([[c.lat, c.lng], end], { color, weight: 2, opacity: 0.8 }).addTo(layer);
        L.circleMarker(end, { radius: 4, fillColor: color, color: '#fff', weight: 2, fillOpacity: 1 }).addTo(layer);
    });
    layer.addTo(map);
    return layer;
}

/** Sensor markers coloured by status. */
export function addSensorLayer(map, sensors, { onClick } = {}) {
    const colors = { online: '#22C55E', degraded: '#F59E0B', offline: '#EF4444' };
    const layer = L.layerGroup();
    sensors.forEach((s) => {
        const marker = L.circleMarker([s.lat, s.lng], {
            radius: 5,
            fillColor: colors[s.status],
            color: '#FFFFFF',
            weight: 2,
            fillOpacity: 0.9
        });
        const detailHtml = `
            <div class="map-popup">
                <div class="map-popup-title">${esc(s.name || s.id)}</div>
                <div class="map-popup-row"><span>ID</span><strong>${esc(s.id)}</strong></div>
                <div class="map-popup-row"><span>Type</span><strong>${esc(s.type)}</strong></div>
                ${s.vendor ? `<div class="map-popup-row"><span>Vendor</span><strong>${esc(s.vendor)}</strong></div>` : ''}
                <div class="map-popup-row"><span>District</span><strong>${esc(s.districtName)}</strong></div>
                <div class="map-popup-row"><span>Status</span><strong style="color:${colors[s.status]}">${esc(s.status)}</strong></div>
                ${s.protocol ? `<div class="map-popup-row"><span>Protocol</span><strong>${esc(s.protocol)}</strong></div>` : ''}
                <div class="map-popup-row"><span>Battery</span><strong>${esc(s.battery)}%</strong></div>
                <div class="map-popup-row"><span>Signal</span><strong>${esc(s.signal)}%</strong></div>
            </div>`;
        marker.bindPopup(detailHtml);
        // Point at a sensor → its details show (and the dot enlarges).
        marker.bindTooltip(detailHtml, { direction: 'top', sticky: true, opacity: 1, className: 'sensor-tooltip' });
        marker.on('mouseover', function () {
            this.setStyle({ radius: 8, weight: 3 });
        });
        marker.on('mouseout', function () {
            this.setStyle({ radius: 5, weight: 2 });
        });
        if (onClick) marker.on('click', () => onClick(s));
        layer.addLayer(marker);
    });
    layer.addTo(map);
    return layer;
}

/** Incident markers coloured by severity. Incidents carry no coordinates, so
    the caller enriches each with lat/lng (district centroid + a jitter). */
export function addIncidentLayer(map, incidents, { onClick } = {}) {
    const colors = { severe: '#EF4444', warning: '#FF8A00', watch: '#F59E0B' };
    const layer = L.layerGroup();
    incidents.forEach((i) => {
        const marker = L.circleMarker([i.lat, i.lng], {
            radius: 6,
            fillColor: colors[i.severity] || '#94A3B8',
            color: '#FFFFFF',
            weight: 2,
            fillOpacity: 0.9
        });
        marker.bindPopup(`
            <div class="map-popup">
                <div class="map-popup-title">${esc(i.id)}</div>
                <div class="map-popup-row"><span>Type</span><strong>${esc(i.type)}</strong></div>
                <div class="map-popup-row"><span>District</span><strong>${esc(i.districtName)}</strong></div>
                <div class="map-popup-row"><span>Status</span><strong>${esc(i.status)}</strong></div>
            </div>`);
        if (onClick) marker.on('click', () => onClick(i));
        layer.addLayer(marker);
    });
    layer.addTo(map);
    return layer;
}

/** Wire checkbox inputs to toggle layers on/off. */
export function bindLayerToggles(map, root, mapping) {
    root.querySelectorAll('[data-layer]').forEach((input) => {
        input.addEventListener('change', () => {
            const layer = mapping[input.dataset.layer];
            if (!layer) return;
            if (input.checked) map.addLayer(layer);
            else map.removeLayer(layer);
        });
    });
}
