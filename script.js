/* ============================================
   WHISPERS OF BIRMINGHAM — MAIN SCRIPT
   ============================================ */

// ==================== GLOBALS ====================
let map, heatLayer, geoJsonLayer, clusterGroup;
let allFeatures = [];
let allMarkers = [];
let userMarker = null;
let routeLine = null;
let nearestHighlight = null;
let bgMusic, ambienceAudio, paperAudio, compassAudio;
let musicPlaying = false;
let timelineActive = false;
let popupOpen = false;

// ==================== COLOR CONFIG ====================
const COLORS = {
    Low: '#8C6A2F',
    Medium: '#C9A55C',
    High: '#F2E3B3'
};
const SIZES = { Low: 8, Medium: 10, High: 12 };

// ==================== AUDIO SETUP ====================
function initAudio() {
    bgMusic = new Audio('assets/audio/red-right-hand.mp3');
    bgMusic.loop = true;
    bgMusic.volume = 0.2;

    ambienceAudio = new Audio('assets/audio/ambience.mp3');
    ambienceAudio.volume = 0.3;

    paperAudio = new Audio('assets/audio/paper.mp3');
    paperAudio.volume = 0.25;
    paperAudio.addEventListener('error', () => {
        paperAudio = ambienceAudio;
    });

    compassAudio = new Audio('assets/audio/compass.mp3');
    compassAudio.volume = 0.3;
    compassAudio.addEventListener('error', () => {
        compassAudio = ambienceAudio;
    });
}

// ==================== HERO / INTRO ====================
function initHero() {
    // Spawn hero particles
    const container = document.getElementById('hero-particles');
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        p.className = 'hero-particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 6 + 's';
        p.style.animationDuration = (4 + Math.random() * 4) + 's';
        container.appendChild(p);
    }

    const tl = gsap.timeline();
    tl.to('#hero-quote', { opacity: 1, y: 0, duration: 1.5, ease: 'power2.out', delay: 0.5 })
        .to('#hero-subtitle', { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, '-=0.6')
        .to('#enter-btn', { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, '-=0.4');

    document.getElementById('enter-btn').addEventListener('click', enterMap);
}

function enterMap() {
    initAudio();
    bgMusic.play().catch(() => { });
    musicPlaying = true;
    document.getElementById('music-btn').textContent = '🔊 Music';

    gsap.to('#hero-screen', {
        opacity: 0,
        duration: 1.2,
        ease: 'power2.inOut',
        onComplete: () => {
            document.getElementById('hero-screen').style.display = 'none';
            const mc = document.getElementById('map-container');
            mc.style.display = 'block';
            gsap.to(mc, {
                opacity: 1, duration: 1.2, ease: 'power2.inOut', onComplete: () => {
                    initMap();
                    spawnDust();
                }
            });
        }
    });
}

// ==================== DUST PARTICLES ====================
function spawnDust() {
    const container = document.getElementById('dust-container');
    for (let i = 0; i < 25; i++) {
        const d = document.createElement('div');
        d.className = 'dust-particle';
        d.style.left = Math.random() * 100 + '%';
        d.style.top = (40 + Math.random() * 60) + '%';
        d.style.animationDelay = Math.random() * 12 + 's';
        d.style.animationDuration = (8 + Math.random() * 8) + 's';
        d.style.width = (1 + Math.random() * 2) + 'px';
        d.style.height = d.style.width;
        container.appendChild(d);
    }
}

// ==================== MAP INITIALIZATION ====================
function initMap() {
    map = L.map('map', {
        center: [52.48, -1.89],
        zoom: 13,
        zoomControl: true,
        attributionControl: false
    });

    // Basemap: Esri World Dark Gray Base
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        zIndex: 1
    }).addTo(map);

    // Reference: Esri World Dark Gray Reference (street labels and location names on top of base)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        zIndex: 2
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
    });

    loadGeoJSON();
}

// ==================== GEOJSON LOADING ====================
function loadGeoJSON() {
    fetch('data/Pub_Birmingham(Point).geojson')
        .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(data => {
            console.log("GeoJSON loaded:", data);
            allFeatures = data.features;
            renderMarkers(allFeatures);
            computeStats(allFeatures);
            initHeatmap(allFeatures);
        })
        .catch(error => console.error("Error loading GeoJSON:", error));
}

// ==================== RENDER MARKERS ====================
function renderMarkers(features) {
    clusterGroup.clearLayers();
    allMarkers = [];

    features.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;
        const lat = coords[1], lng = coords[0];
        const cat = props.category || 'Low';
        const color = COLORS[cat] || COLORS.Low;
        const size = SIZES[cat] || 8;

        const icon = L.divIcon({
            className: '',
            html: `<div class="pub-marker" style="width:${size}px;height:${size}px;background:${color};"></div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });

        const marker = L.marker([lat, lng], { icon: icon });

        marker.bindTooltip(props.name || 'Unknown Pub', {
            direction: 'top', offset: [0, -8], className: 'leaflet-tooltip'
        });

        marker.on('click', () => openScrollPopup(feature, marker));

        marker.feature = feature;
        allMarkers.push(marker);
        clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);
}

// ==================== SCROLL LETTER POPUP ====================
function openScrollPopup(feature, marker) {
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    // Update sidebar
    updateSidebar(props);

    // Populate popup
    document.getElementById('popup-name').textContent = props.name || 'Unknown Pub';
    document.getElementById('popup-year').textContent = props.start_date ? 'Est. ' + props.start_date : 'Est. Unknown';
    document.getElementById('popup-district').textContent = props.district || 'Birmingham';
    document.getElementById('popup-category').textContent = props.category || '—';
    document.getElementById('popup-type').textContent = props.pub_type || '—';
    document.getElementById('popup-rating').textContent = props.rating != null ? '★ ' + props.rating : '—';
    document.getElementById('popup-status').textContent = props.pub_type === 'historical' ? 'Heritage' : 'Active';

    const descText = props.desc && props.desc.length > 15 ? props.desc : 'A traditional Birmingham pub steeped in the city\'s industrial heritage, serving as a social cornerstone for generations.';
    document.getElementById('popup-desc').textContent = descText;

    const vibeText = props.vibe && props.vibe.length > 15 ? props.vibe : '"Where smoke, whiskey, and survival once shaped Birmingham nights."';
    document.getElementById('popup-vibe').textContent = vibeText.startsWith('"') ? vibeText : '"' + vibeText + '"';

    // Image
    const imgSrc = (props.image && props.image.length > 15 && props.image.endsWith('.jpg')) ? props.image : 'assets/img/pub.jpg';
    document.getElementById('popup-image').src = imgSrc;

    // Stamp
    document.getElementById('popup-stamp').textContent = props.pub_type === 'historical' ? 'ARCHIVED PUB' : 'BIRMINGHAM SOCIAL NODE';

    // Play paper sound
    try { paperAudio.currentTime = 0; paperAudio.play().catch(() => { }); } catch (e) { }

    // Darken map
    document.getElementById('map-darken').classList.add('active');
    popupOpen = true;

    // Show overlay & animate
    const overlay = document.getElementById('scroll-popup-overlay');
    const popup = document.getElementById('scroll-popup');
    overlay.classList.add('active');

    gsap.fromTo(popup,
        { opacity: 0, scaleY: 0, scaleX: 0.95 },
        { opacity: 1, scaleY: 1, scaleX: 1, duration: 0.6, ease: 'power3.out' }
    );

    // Fly to location
    map.flyTo([coords[1], coords[0]], 15, { duration: 1 });

    // Highlight marker
    const markerEl = marker.getElement();
    if (markerEl) {
        const dot = markerEl.querySelector('.pub-marker');
        if (dot) dot.classList.add('highlight');
    }
}

function closeScrollPopup() {
    const overlay = document.getElementById('scroll-popup-overlay');
    const popup = document.getElementById('scroll-popup');

    gsap.to(popup, {
        opacity: 0, scaleY: 0, duration: 0.4, ease: 'power3.in',
        onComplete: () => {
            overlay.classList.remove('active');
            document.getElementById('map-darken').classList.remove('active');
            popupOpen = false;
        }
    });

    // Remove highlights
    document.querySelectorAll('.pub-marker.highlight').forEach(el => el.classList.remove('highlight'));
}

// ==================== SIDEBAR UPDATE ====================
function updateSidebar(props) {
    document.getElementById('sidebar-default').style.display = 'none';
    const info = document.getElementById('sidebar-pub-info');
    info.style.display = 'block';

    document.getElementById('sidebar-pub-name').textContent = props.name || 'Unknown Pub';

    const descText = props.desc && props.desc.length > 15 ? props.desc : 'Traditional pub with deep roots in Birmingham\'s industrial history.';
    document.getElementById('sidebar-pub-desc').textContent = descText;

    const vibeText = props.vibe && props.vibe.length > 15 ? props.vibe : 'A surviving social hub from Birmingham\'s industrial past.';
    document.getElementById('sidebar-pub-vibe').textContent = '"' + vibeText.replace(/"/g, '') + '"';

    const meta = document.getElementById('sidebar-pub-meta');
    meta.innerHTML = `
        <span class="meta-tag">${props.category || 'N/A'}</span>
        <span class="meta-tag">${props.pub_type || 'N/A'}</span>
        <span class="meta-tag">★ ${props.rating || 'N/A'}</span>
        <span class="meta-tag">${props.district || 'Birmingham'}</span>
    `;
}

// ==================== LIGHTBOX ====================
function initLightbox() {
    document.getElementById('popup-image-wrap').addEventListener('click', (e) => {
        e.stopPropagation();
        const src = document.getElementById('popup-image').src;
        document.getElementById('lightbox-img').src = src;
        document.getElementById('lightbox').classList.add('active');
    });

    document.getElementById('lightbox-close').addEventListener('click', () => {
        document.getElementById('lightbox').classList.remove('active');
    });

    document.getElementById('lightbox').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            document.getElementById('lightbox').classList.remove('active');
        }
    });
}

// ==================== STATS ====================
function computeStats(features) {
    const total = features.length;
    let low = 0, med = 0, high = 0, ratingSum = 0, ratingCount = 0;
    const districtMap = {};

    features.forEach(f => {
        const p = f.properties;
        if (p.category === 'Low') low++;
        else if (p.category === 'Medium') med++;
        else if (p.category === 'High') high++;

        if (p.rating != null) { ratingSum += parseFloat(p.rating); ratingCount++; }

        const d = p.district || 'Unknown';
        districtMap[d] = (districtMap[d] || 0) + 1;
    });

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-low').textContent = low;
    document.getElementById('stat-medium').textContent = med;
    document.getElementById('stat-high').textContent = high;
    document.getElementById('stat-rating').textContent = ratingCount ? (ratingSum / ratingCount).toFixed(1) : '—';

    const topDistrict = Object.entries(districtMap).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('stat-district').textContent = topDistrict ? topDistrict[0] : '—';
}

// ==================== HEATMAP ====================
function initHeatmap(features) {
    const heatData = features.map(f => {
        const c = f.geometry.coordinates;
        return [c[1], c[0], 0.6];
    });

    heatLayer = L.heatLayer(heatData, {
        radius: 20, blur: 25, maxZoom: 16, max: 1.0,
        gradient: { 0.2: '#8C6A2F', 0.5: '#C9A55C', 0.8: '#F2E3B3', 1: '#ffffff' }
    });
}

function toggleHeatmap(on) {
    if (on) {
        map.addLayer(heatLayer);
    } else {
        map.removeLayer(heatLayer);
    }
}

// ==================== FILTERS ====================
function applyFilters() {
    const cats = Array.from(document.querySelectorAll('.filter-category:checked')).map(el => el.value);
    const types = Array.from(document.querySelectorAll('.filter-type:checked')).map(el => el.value);
    const rMin = parseFloat(document.getElementById('rating-min').value);
    const rMax = parseFloat(document.getElementById('rating-max').value);

    const filtered = allFeatures.filter(f => {
        const p = f.properties;
        if (!cats.includes(p.category)) return false;
        if (!types.includes(p.pub_type)) return false;
        const r = parseFloat(p.rating) || 0;
        if (r < rMin || r > rMax) return false;
        return true;
    });

    renderMarkers(filtered);
    computeStats(filtered);

    // Rebuild heatmap
    if (heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
    initHeatmap(filtered);
    if (document.getElementById('heatmap-toggle').checked) map.addLayer(heatLayer);

    document.getElementById('rating-display').textContent = rMin.toFixed(1) + ' — ' + rMax.toFixed(1);
}

// ==================== NEAREST PUB ====================
function findNearestPub() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
    }

    navigator.geolocation.getCurrentPosition(pos => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        // Play compass sound
        try { compassAudio.currentTime = 0; compassAudio.play().catch(() => { }); } catch (e) { }

        // Add user marker
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([userLat, userLng], {
            radius: 8, fillColor: '#e74c3c', color: '#fff', weight: 2, fillOpacity: 0.9
        }).addTo(map).bindTooltip('📍 Your Location', { permanent: true, direction: 'top' });

        // Find nearest
        let nearest = null, minDist = Infinity;
        allFeatures.forEach(f => {
            const c = f.geometry.coordinates;
            const dist = map.distance([userLat, userLng], [c[1], c[0]]);
            if (dist < minDist) { minDist = dist; nearest = f; }
        });

        if (!nearest) return;

        const nc = nearest.geometry.coordinates;

        // Draw route line
        if (routeLine) map.removeLayer(routeLine);
        routeLine = L.polyline([[userLat, userLng], [nc[1], nc[0]]], {
            color: '#F2E3B3', weight: 2, dashArray: '8,6', opacity: 0.7
        }).addTo(map);

        // Fly to
        map.flyTo([nc[1], nc[0]], 16, { duration: 1.5 });

        // Show panel
        const np = nearest.properties;
        document.getElementById('nearest-name').textContent = np.name || 'Unknown';
        document.getElementById('nearest-district').textContent = np.district || 'Birmingham';
        document.getElementById('nearest-category').textContent = np.category || '—';

        const distStr = minDist < 1000 ? Math.round(minDist) + ' m' : (minDist / 1000).toFixed(1) + ' km';
        const walkMin = Math.round(minDist / 80); // ~80m/min walk
        document.getElementById('nearest-dist').textContent = '📏 ' + distStr;
        document.getElementById('nearest-walk').textContent = '🚶 ~' + walkMin + ' min walk';

        const vibeText = np.vibe && np.vibe.length > 15 ? np.vibe : 'The closest surviving social refuge from Birmingham\'s industrial nights.';
        document.getElementById('nearest-vibe').textContent = '"' + vibeText.replace(/"/g, '') + '"';

        document.getElementById('nearest-panel').classList.add('active');

        // Increase ambience volume
        if (ambienceAudio) { ambienceAudio.volume = 0.4; }

    }, err => {
        alert('Unable to get your location. Error: ' + err.message);
    }, { enableHighAccuracy: true });
}

// ==================== TIMELINE ====================
function initTimeline() {
    const slider = document.getElementById('timeline-slider');
    const display = document.getElementById('timeline-year-display');
    const atmo = document.getElementById('timeline-atmosphere');

    slider.addEventListener('input', () => {
        const year = parseInt(slider.value);
        display.textContent = year;

        if (year < 1850) atmo.textContent = 'The Age of Canals & Forge';
        else if (year < 1900) atmo.textContent = 'Victorian Industrial Peak';
        else if (year < 1950) atmo.textContent = 'World Wars & Resilience';
        else if (year < 2000) atmo.textContent = 'Post-Industrial Revival';
        else atmo.textContent = 'Modern Birmingham';

        filterByTimeline(year);
    });
}

function filterByTimeline(year) {
    allMarkers.forEach(m => {
        const f = m.feature;
        const startDate = f.properties.start_date;
        let estYear = null;

        if (startDate) {
            const parsed = parseInt(startDate);
            if (!isNaN(parsed)) estYear = parsed;
        }

        // If no start_date, assign a pseudo-random year based on feature id
        if (!estYear) {
            const hash = hashStr(f.properties.osm_id || f.properties.name || '');
            estYear = 1850 + (hash % 175); // range 1850-2025
        }

        const el = m.getElement();
        if (el) {
            if (estYear <= year) {
                el.style.opacity = '1';
                el.style.transition = 'opacity 0.5s ease';
            } else {
                el.style.opacity = '0.08';
                el.style.transition = 'opacity 0.5s ease';
            }
        }
    });
}

function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

// ==================== MUSIC TOGGLE ====================
function toggleMusic() {
    if (musicPlaying) {
        bgMusic.pause();
        musicPlaying = false;
        document.getElementById('music-btn').textContent = '🔇 Music';
    } else {
        bgMusic.play().catch(() => { });
        musicPlaying = true;
        document.getElementById('music-btn').textContent = '🔊 Music';
    }
}

// ==================== EVENT BINDINGS ====================
function bindEvents() {
    // Scroll popup
    document.getElementById('scroll-close').addEventListener('click', closeScrollPopup);
    document.getElementById('scroll-popup-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeScrollPopup();
    });

    // Play ambience button
    document.getElementById('popup-play-ambience').addEventListener('click', () => {
        ambienceAudio.currentTime = 0;
        ambienceAudio.play().catch(() => { });
    });

    // Lightbox
    initLightbox();

    // Sidebar toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
        const sb = document.getElementById('sidebar');
        sb.classList.toggle('collapsed');
        document.getElementById('sidebar-toggle').textContent = sb.classList.contains('collapsed') ? '▶' : '◀';
    });

    // Filter toggle
    document.getElementById('filter-toggle-btn').addEventListener('click', () => {
        document.getElementById('filter-panel').classList.toggle('hidden');
    });

    // Filters
    document.querySelectorAll('.filter-category, .filter-type').forEach(el => {
        el.addEventListener('change', applyFilters);
    });
    document.getElementById('rating-min').addEventListener('input', applyFilters);
    document.getElementById('rating-max').addEventListener('input', applyFilters);

    // Heatmap
    document.getElementById('heatmap-toggle').addEventListener('change', (e) => {
        toggleHeatmap(e.target.checked);
    });

    // Music
    document.getElementById('music-btn').addEventListener('click', toggleMusic);

    // Nearest pub
    document.getElementById('nearest-btn').addEventListener('click', findNearestPub);
    document.getElementById('nearest-close').addEventListener('click', () => {
        document.getElementById('nearest-panel').classList.remove('active');
        if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
        if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    });

    // Timeline
    document.getElementById('timeline-btn').addEventListener('click', () => {
        const panel = document.getElementById('timeline-panel');
        timelineActive = !timelineActive;
        panel.classList.toggle('active', timelineActive);
        document.getElementById('timeline-btn').classList.toggle('active', timelineActive);

        if (!timelineActive) {
            // Reset all markers
            document.getElementById('timeline-slider').value = 2025;
            document.getElementById('timeline-year-display').textContent = '2025';
            allMarkers.forEach(m => {
                const el = m.getElement();
                if (el) el.style.opacity = '1';
            });
        }
    });
    document.getElementById('timeline-close').addEventListener('click', () => {
        timelineActive = false;
        document.getElementById('timeline-panel').classList.remove('active');
        document.getElementById('timeline-btn').classList.remove('active');
        document.getElementById('timeline-slider').value = 2025;
        document.getElementById('timeline-year-display').textContent = '2025';
        allMarkers.forEach(m => {
            const el = m.getElement();
            if (el) el.style.opacity = '1';
        });
    });

    initTimeline();
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    initHero();
    bindEvents();
});
