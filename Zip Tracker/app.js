/**
 * Crematory Service Area Analyzer
 * Interactive map application for analyzing crematory service areas in Southern California
 */

// ============================================================================
// Configuration & Constants
// ============================================================================

const CONFIG = {
    // Default map center (will auto-adjust based on data)
    mapCenter: [34.0522, -118.2437],
    mapZoom: 9,

    // Southern California counties to include
    socalCounties: [
        'Los Angeles',
        'Orange',
        'Riverside',
        'San Bernardino',
        'San Diego',
        'Ventura',
        'Imperial',
        'Kern',
        'Santa Barbara',
        'San Luis Obispo'
    ],

    // Dallas-Fort Worth Extended Area counties (Texas)
    texasCounties: [
        // Core DFW Metro
        'Dallas',
        'Tarrant',
        'Collin',
        'Denton',
        'Ellis',
        'Johnson',
        'Kaufman',
        'Parker',
        'Rockwall',
        // Surrounding counties
        'Wise',
        'Hunt',
        'Hood',
        'Navarro',
        'Henderson',
        'Van Zandt',
        'Somervell',
        'Erath',
        'Palo Pinto',
        'Jack',
        'Montague',
        'Cooke',
        'Grayson',
        'Fannin',
        'Hill',
        // Extended area counties
        'McLennan',  // Waco
        'Bell',
        'Coryell',
        'Bosque',
        'Hamilton',
        'Comanche',
        'Eastland',
        'Stephens',
        'Young',
        'Clay',
        'Archer',
        'Wichita',
        'Wilbarger',
        'Lamar',
        'Red River',
        'Delta',
        'Hopkins',
        'Rains',
        'Wood',
        'Smith',
        'Cherokee',
        'Anderson',
        'Freestone',
        'Limestone',
        'Falls',
        'Milam',
        'Robertson',
        'Leon',
        'Madison',
        'Brazos'
    ],

    // Arizona counties (Phoenix + Tucson coverage area)
    arizonaCounties: [
        'Maricopa',
        'Pima',
        'Pinal',
        'Yavapai',
        'Gila',
        'Cochise',
        'Santa Cruz',
        'Graham',
        'Greenlee',
        'La Paz',
        'Coconino',
        'Navajo',
        'Yuma',
        'Mohave',
        'Apache'
    ],

    // Washington State counties (Seattle crematory 120mi radius)
    washingtonCounties: [
        // Core metro
        'King',
        'Snohomish',
        'Pierce',
        'Skagit',
        // Expanded coverage (within 120mi of Kent crematory)
        'Kitsap',
        'Thurston',
        'Mason',
        'Island',
        'Jefferson',
        'Clallam',
        'Lewis',
        'Grays Harbor',
        'Whatcom',
        'San Juan',
        'Chelan',
        'Yakima',
        'Kittitas',
        'Cowlitz',
        'Skamania',
        'Pacific'
    ],

    // Colors for zip code styling
    colors: {
        serviceArea: '#4CAF50',      // Green for in service area (Tier 0)
        tier1: '#64B5F6',            // Blue for Tier 1
        tier2: '#FFF176',            // Yellow for Tier 2
        tier3: '#FF9800',            // Orange for Tier 3
        nearbyArea: '#FFF176',       // Yellow for within 42 miles of crematory (non-SoCal fallback)
        extendedArea: '#FF9800',     // Orange for within 100 miles of crematory (non-SoCal fallback)
        outsideArea: '#E57373',      // Red for outside service area / outside 100 miles
        crematoryBorder: '#FFC107',
        countyBorder: '#1976D2',
        highlight: '#2196F3'
    },

    // Distance thresholds for nearby zips (driving miles)
    nearbyDistanceThreshold: 42,
    extendedDistanceThreshold: 100,

    // Driving distance multiplier (driving distance is typically 1.3x straight-line)
    drivingDistanceMultiplier: 1.3,

    // OSRM API for routing (free, no API key needed)
    osrmUrl: 'https://router.project-osrm.org/route/v1/driving/',

    // Nominatim for geocoding (free, no API key needed)
    nominatimUrl: 'https://nominatim.openstreetmap.org/search'
};

// ============================================================================
// Application State
// ============================================================================

const state = {
    map: null,
    zipCodeLayer: null,
    countyLayer: null,
    crematoryMarkers: [],
    zipCodeData: new Map(), // zip -> { geometry, properties, serviceArea, crematories, etc }
    crematoryData: [], // { name, address, lat, lng, assignedZips }
    serviceAreaZips: new Set(),
    nearbyZips: new Set(),  // Zips within 42 miles of a crematory but not in service area
    extendedZips: new Set(), // Zips within 100 miles of a crematory but not in service area or nearby
    tierZips: new Map(), // zip -> tier (1, 2, or 3) for SoCal distance tiers
    crematoryZips: new Set(),
    zipToCityCounty: new Map(), // zip -> { city, county }
    selectedCrematory: null,
    isDataLoaded: false,
    userLocationMarker: null
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    initializeMap();
    setupEventListeners();
    await loadZipCodeBoundaries();
});

function initializeMap() {
    // Create map centered on Southern California
    state.map = L.map('map', {
        center: CONFIG.mapCenter,
        zoom: CONFIG.mapZoom,
        zoomControl: true
    });

    // Add base tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(state.map);

    // Add "Near Me" geolocation control
    addNearMeControl();
}

// ============================================================================
// Near Me / Geolocation
// ============================================================================

function addNearMeControl() {
    const NearMeControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function() {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control near-me-control');
            const btn = L.DomUtil.create('a', 'near-me-btn', container);
            btn.href = '#';
            btn.title = 'Find my location';
            btn.innerHTML = '<i class="fas fa-crosshairs"></i> Near Me';
            btn.setAttribute('role', 'button');

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(btn, 'click', function(e) {
                L.DomEvent.preventDefault(e);
                findMyLocation();
            });

            return container;
        }
    });

    new NearMeControl().addTo(state.map);
}

function findMyLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
    }

    // Update button to show loading state
    const btn = document.querySelector('.near-me-btn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locating...';
        btn.style.pointerEvents = 'none';
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;

            // Reset button
            if (btn) {
                btn.innerHTML = '<i class="fas fa-crosshairs"></i> Near Me';
                btn.style.pointerEvents = '';
            }

            // Remove previous location marker if any
            if (state.userLocationMarker) {
                state.map.removeLayer(state.userLocationMarker);
            }

            // Add a marker at user's location
            const userIcon = L.divIcon({
                className: 'user-location-icon',
                html: '<div class="user-location-pulse"></div><div class="user-location-dot"></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            state.userLocationMarker = L.marker([userLat, userLng], { icon: userIcon })
                .addTo(state.map)
                .bindPopup('<strong>Your Location</strong>')
                .openPopup();

            // Find the nearest zip code to the user's location
            let nearestZip = null;
            let nearestDistance = Infinity;
            let nearestLayer = null;

            if (state.zipCodeLayer) {
                state.zipCodeLayer.eachLayer(layer => {
                    const zip = layer.feature.properties.ZCTA5CE10 ||
                               layer.feature.properties.zip ||
                               layer.feature.properties.GEOID10;
                    if (!zip) return;

                    const center = layer.getBounds().getCenter();
                    const dist = calculateHaversineDistance(userLat, userLng, center.lat, center.lng);

                    if (dist < nearestDistance) {
                        nearestDistance = dist;
                        nearestZip = zip;
                        nearestLayer = layer;
                    }
                });
            }

            // Zoom to show the user's area
            state.map.setView([userLat, userLng], 12);

            // Highlight the nearest zip and show its popup
            if (nearestZip && nearestLayer) {
                setTimeout(() => {
                    nearestLayer.setStyle({
                        weight: 4,
                        color: CONFIG.colors.highlight,
                        fillOpacity: 0.8
                    });

                    const centroid = nearestLayer.getBounds().getCenter();
                    showZipPopup({ latlng: centroid }, nearestZip);

                    // Reset highlight after a few seconds
                    setTimeout(() => {
                        if (state.zipCodeLayer) {
                            state.zipCodeLayer.resetStyle(nearestLayer);
                        }
                    }, 5000);
                }, 300);
            }
        },
        (error) => {
            // Reset button
            if (btn) {
                btn.innerHTML = '<i class="fas fa-crosshairs"></i> Near Me';
                btn.style.pointerEvents = '';
            }

            let message = 'Unable to retrieve your location.';
            if (error.code === error.PERMISSION_DENIED) {
                message = 'Location access was denied. Please enable location permissions in your browser settings.';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                message = 'Location information is unavailable.';
            } else if (error.code === error.TIMEOUT) {
                message = 'Location request timed out. Please try again.';
            }
            alert(message);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}

function setupEventListeners() {
    // File upload
    document.getElementById('uploadBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', handleFileUpload);

    // Add service zips CSV upload
    document.getElementById('addZipsBtn').addEventListener('click', () => {
        document.getElementById('addZipsInput').click();
    });

    document.getElementById('addZipsInput').addEventListener('change', handleAddServiceZipsCSV);

    // Export CSV
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);

    // Search
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));

    // Map controls
    document.getElementById('countyToggle').addEventListener('change', toggleCountyBoundaries);
    document.getElementById('serviceAreaToggle').addEventListener('change', toggleServiceAreaView);
}

// ============================================================================
// County Boundary Loading
// ============================================================================

async function loadCountyBoundaries() {
    try {
        // Fetch CA from codeforamerica (known working), and all US counties from Plotly for TX/AZ/WA
        const [caResponse, usResponse] = await Promise.all([
            fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/california-counties.geojson').catch(() => null),
            fetch('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json').catch(() => null)
        ]);

        let allCountyFeatures = [];

        // Process California counties (dedicated source)
        if (caResponse && caResponse.ok) {
            const caGeojson = await caResponse.json();

            // Filter for Southern California counties only
            const socalCountyNames = [
                'Los Angeles', 'Orange', 'San Diego', 'Riverside',
                'San Bernardino', 'Ventura', 'Imperial', 'Kern',
                'Santa Barbara', 'San Luis Obispo'
            ];

            const caFiltered = caGeojson.features.filter(feature => {
                const name = feature.properties.name || feature.properties.NAME;
                return socalCountyNames.some(county =>
                    name && name.toLowerCase().includes(county.toLowerCase())
                );
            });
            allCountyFeatures.push(...caFiltered);
        }

        // Process TX, AZ, WA from US counties dataset (filter by state FIPS code)
        if (usResponse && usResponse.ok) {
            const usGeojson = await usResponse.json();

            // State FIPS codes: TX=48, AZ=04, WA=53
            const stateFilters = {
                '48': CONFIG.texasCounties,       // Texas
                '04': CONFIG.arizonaCounties,      // Arizona
                '53': CONFIG.washingtonCounties     // Washington
            };

            const filtered = usGeojson.features.filter(feature => {
                const stateFips = feature.properties.STATE;
                if (!stateFilters[stateFips]) return false;

                const name = feature.properties.NAME;
                const allowedCounties = stateFilters[stateFips];
                return allowedCounties.some(county =>
                    name && name.toLowerCase() === county.toLowerCase()
                );
            });

            // Normalize the name property so downstream code works consistently
            filtered.forEach(feature => {
                if (!feature.properties.name && feature.properties.NAME) {
                    feature.properties.name = feature.properties.NAME;
                }
            });

            allCountyFeatures.push(...filtered);
        }

        if (allCountyFeatures.length === 0) {
            console.warn('Could not load county boundaries');
            return;
        }

        const combinedCounties = {
            type: 'FeatureCollection',
            features: allCountyFeatures
        };

        // Create county boundary layer
        // IMPORTANT: Set interactive: false so it doesn't block zip code mouse events
        state.countyLayer = L.geoJSON(combinedCounties, {
            style: {
                fillColor: 'transparent',
                fillOpacity: 0,
                color: '#1976D2',
                weight: 3,
                opacity: 0.8,
                dashArray: '10, 5'
            },
            interactive: false,  // This prevents the county layer from blocking zip hover events
            onEachFeature: (feature, layer) => {
                const name = feature.properties.name || feature.properties.NAME;
                layer.bindTooltip(name + ' County', {
                    permanent: false,
                    direction: 'center',
                    className: 'county-tooltip'
                });
            }
        }).addTo(state.map);

        console.log(`Loaded ${allCountyFeatures.length} county boundaries`);

    } catch (error) {
        console.warn('Error loading county boundaries:', error);
    }
}

// ============================================================================
// Zip Code Boundary Loading
// ============================================================================

async function loadZipCodeBoundaries() {
    showLoading('Loading zip code boundaries...');

    try {
        // Load all state zip codes in parallel
        const [caResponse, txResponse, azResponse, waResponse] = await Promise.all([
            fetch('https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/ca_california_zip_codes_geo.min.json'),
            fetch('https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/tx_texas_zip_codes_geo.min.json'),
            fetch('https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/az_arizona_zip_codes_geo.min.json'),
            fetch('https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/wa_washington_zip_codes_geo.min.json')
        ]);

        if (!caResponse.ok) {
            throw new Error('Failed to fetch California zip code data');
        }
        if (!txResponse.ok) {
            throw new Error('Failed to fetch Texas zip code data');
        }

        const [caGeojson, txGeojson, azGeojson, waGeojson] = await Promise.all([
            caResponse.json(),
            txResponse.json(),
            azResponse.ok ? azResponse.json() : { features: [] },
            waResponse.ok ? waResponse.json() : { features: [] }
        ]);

        // Filter zip codes for each region
        const socalZips = filterSoCalZips(caGeojson);
        const dfwZips = filterDFWZips(txGeojson);
        const arizonaZips = filterArizonaZips(azGeojson);
        const seattleZips = filterSeattleZips(waGeojson);

        // Combine all regions
        const combinedZips = {
            type: 'FeatureCollection',
            features: [...socalZips.features, ...dfwZips.features, ...arizonaZips.features, ...seattleZips.features]
        };

        // Create the zip code layer
        state.zipCodeLayer = L.geoJSON(combinedZips, {
            style: getZipCodeStyle,
            onEachFeature: onEachZipCode
        }).addTo(state.map);

        // Store zip code data for later use
        combinedZips.features.forEach(feature => {
            const zip = feature.properties.ZCTA5CE10 || feature.properties.zip || feature.properties.GEOID10;
            if (zip) {
                state.zipCodeData.set(zip, {
                    geometry: feature.geometry,
                    properties: feature.properties,
                    serviceArea: false,
                    crematories: [],
                    hasCrematory: false
                });
            }
        });

        // Fit map to Southern California by default (user can pan to other regions)
        const socalBounds = L.geoJSON(socalZips).getBounds();
        state.map.fitBounds(socalBounds);

        // Load county boundaries on top
        await loadCountyBoundaries();

        hideLoading();
        console.log(`Loaded ${state.zipCodeData.size} zip codes (CA: ${socalZips.features.length}, TX: ${dfwZips.features.length}, AZ: ${arizonaZips.features.length}, WA: ${seattleZips.features.length})`);

    } catch (error) {
        console.error('Error loading zip code boundaries:', error);
        hideLoading();
        showError('Failed to load zip code boundaries. Please refresh the page.');
    }
}

function filterSoCalZips(geojson) {
    // Southern California bounding box (approximate)
    const bounds = {
        minLat: 32.5,
        maxLat: 36.0,
        minLng: -121.0,
        maxLng: -114.0
    };

    const filteredFeatures = geojson.features.filter(feature => {
        // Get centroid of the feature
        const coords = getCentroid(feature.geometry);
        if (!coords) return false;

        const [lng, lat] = coords;
        return lat >= bounds.minLat && lat <= bounds.maxLat &&
               lng >= bounds.minLng && lng <= bounds.maxLng;
    });

    return {
        type: 'FeatureCollection',
        features: filteredFeatures
    };
}

function filterDFWZips(geojson) {
    // Dallas-Fort Worth Extended Area bounding box
    // Expanded to show more surrounding areas for context
    // North: past Gainesville, South: past Waco, West: past Mineral Wells, East: past Tyler
    const bounds = {
        minLat: 31.2,
        maxLat: 34.2,
        minLng: -99.0,
        maxLng: -95.0
    };

    const filteredFeatures = geojson.features.filter(feature => {
        // Get centroid of the feature
        const coords = getCentroid(feature.geometry);
        if (!coords) return false;

        const [lng, lat] = coords;
        return lat >= bounds.minLat && lat <= bounds.maxLat &&
               lng >= bounds.minLng && lng <= bounds.maxLng;
    });

    return {
        type: 'FeatureCollection',
        features: filteredFeatures
    };
}

function filterArizonaZips(geojson) {
    // Arizona bounding box - covers Phoenix + Tucson + 100mi expansion zones
    // Spans from Prescott/Sedona (north) to Nogales/Douglas (south),
    // Quartzsite (west) to Safford/Willcox (east)
    const bounds = {
        minLat: 31.2,
        maxLat: 35.2,
        minLng: -114.0,
        maxLng: -109.0
    };

    const filteredFeatures = geojson.features.filter(feature => {
        const coords = getCentroid(feature.geometry);
        if (!coords) return false;

        const [lng, lat] = coords;
        return lat >= bounds.minLat && lat <= bounds.maxLat &&
               lng >= bounds.minLng && lng <= bounds.maxLng;
    });

    return {
        type: 'FeatureCollection',
        features: filteredFeatures
    };
}

function filterSeattleZips(geojson) {
    // Washington State bounding box (120mi radius from Kent crematory)
    // Covers from Bellingham/Whatcom (north) to Centralia/Lewis (south),
    // Port Angeles/Clallam (west) to Wenatchee/Chelan + Yakima (east)
    const bounds = {
        minLat: 46.0,
        maxLat: 49.0,
        minLng: -124.5,
        maxLng: -120.0
    };

    const filteredFeatures = geojson.features.filter(feature => {
        const coords = getCentroid(feature.geometry);
        if (!coords) return false;

        const [lng, lat] = coords;
        return lat >= bounds.minLat && lat <= bounds.maxLat &&
               lng >= bounds.minLng && lng <= bounds.maxLng;
    });

    return {
        type: 'FeatureCollection',
        features: filteredFeatures
    };
}

function getCentroid(geometry) {
    if (!geometry || !geometry.coordinates) return null;

    let coords;
    if (geometry.type === 'Polygon') {
        coords = geometry.coordinates[0];
    } else if (geometry.type === 'MultiPolygon') {
        coords = geometry.coordinates[0][0];
    } else {
        return null;
    }

    let sumLng = 0, sumLat = 0;
    coords.forEach(([lng, lat]) => {
        sumLng += lng;
        sumLat += lat;
    });

    return [sumLng / coords.length, sumLat / coords.length];
}

function getZipCodeStyle(feature) {
    const zip = feature.properties.ZCTA5CE10 || feature.properties.zip || feature.properties.GEOID10;
    const zipData = state.zipCodeData.get(zip);

    const isServiceArea = state.serviceAreaZips.has(zip);
    const tier = state.tierZips.get(zip); // 1, 2, or 3 (SoCal tiers)
    const hasCrematory = state.crematoryZips.has(zip);

    let fillColor;
    let fillOpacity;
    // Tier assignment supersedes service area when both exist
    if (tier === 1) {
        fillColor = CONFIG.colors.tier1;
        fillOpacity = 0.55;
    } else if (tier === 2) {
        fillColor = CONFIG.colors.tier2;
        fillOpacity = 0.5;
    } else if (tier === 3) {
        fillColor = CONFIG.colors.tier3;
        fillOpacity = 0.5;
    } else if (isServiceArea) {
        fillColor = CONFIG.colors.serviceArea;
        fillOpacity = 0.6;
    } else {
        fillColor = CONFIG.colors.outsideArea;
        fillOpacity = 0.4;
    }

    return {
        fillColor: fillColor,
        weight: hasCrematory ? 3 : 1,
        opacity: 1,
        color: hasCrematory ? CONFIG.colors.crematoryBorder : '#fff',
        fillOpacity: fillOpacity
    };
}

function onEachZipCode(feature, layer) {
    const zip = feature.properties.ZCTA5CE10 || feature.properties.zip || feature.properties.GEOID10;

    // Add hover events
    layer.on({
        mouseover: (e) => highlightZip(e, zip),
        mouseout: (e) => resetZipHighlight(e, zip),
        click: (e) => showZipPopup(e, zip)
    });
}

function highlightZip(e, zip) {
    const layer = e.target;

    layer.setStyle({
        weight: 3,
        color: CONFIG.colors.highlight,
        fillOpacity: 0.7
    });

    layer.bringToFront();

    // Always show hover popup - it will display whatever data is available
    showHoverPopup(e.latlng, zip);
}

function resetZipHighlight(e, zip) {
    if (state.zipCodeLayer) {
        state.zipCodeLayer.resetStyle(e.target);
    }
    state.map.closePopup();
}

async function showZipPopup(e, zip) {
    // Show initial popup with estimated distances
    let content = createPopupContent(zip);

    const popup = L.popup({
        maxWidth: 350,
        className: 'zip-popup'
    })
    .setLatLng(e.latlng)
    .setContent(content)
    .openOn(state.map);

    // Fetch real driving distances in the background
    await fetchRealDrivingDistances(zip);

    // Update popup with real distances if still open
    if (state.map.hasLayer(popup)) {
        content = createPopupContent(zip, true);
        popup.setContent(content);
    }
}

function showHoverPopup(latlng, zip) {
    const content = createPopupContent(zip);

    L.popup({
        maxWidth: 350,
        className: 'zip-popup',
        closeButton: false,
        autoClose: true
    })
    .setLatLng(latlng)
    .setContent(content)
    .openOn(state.map);
}

function createPopupContent(zip, hasRealDistances = false) {
    const zipData = state.zipCodeData.get(zip);
    const cityCounty = state.zipToCityCounty.get(zip) || { city: '', county: '' };
    const isServiceArea = state.serviceAreaZips.has(zip);
    const hasCrematory = state.crematoryZips.has(zip);

    // Find which crematory is located here (if any)
    const crematoryHere = hasCrematory ? state.crematoryData.find(c => {
        if (!c.address) return false;
        const addressZipMatch = c.address.match(/\b(\d{5})\b/);
        return addressZipMatch && addressZipMatch[1] === zip;
    }) : null;

    let html = `
        <div class="popup-header">ZIP ${zip}</div>
    `;

    // Show city if available
    if (cityCounty.city && cityCounty.city !== 'Unknown' && cityCounty.city !== '') {
        html += `
        <div class="popup-row">
            <span class="popup-label">City:</span>
            <span class="popup-value">${cityCounty.city}</span>
        </div>
        `;
    }

    // Show county - try to determine from zip prefix if not in our data
    let countyDisplay = cityCounty.county;
    if (!countyDisplay || countyDisplay === '' || countyDisplay === 'Unknown') {
        // Try to infer county from zip code prefix
        const zipPrefix = zip.substring(0, 3);
        if (['900', '901', '902', '903', '904', '905', '906', '907', '908', '910', '911', '912', '913', '914', '915', '916', '917', '918'].includes(zipPrefix)) {
            countyDisplay = 'Los Angeles';
        } else if (['926', '927', '928'].includes(zipPrefix)) {
            countyDisplay = 'Orange';
        } else if (['920', '921'].includes(zipPrefix)) {
            countyDisplay = 'San Diego';
        } else if (['922', '923', '925'].includes(zipPrefix)) {
            countyDisplay = 'Riverside / San Bernardino';
        } else if (['924'].includes(zipPrefix)) {
            countyDisplay = 'San Bernardino';
        } else if (['930', '931', '932', '933', '934', '935'].includes(zipPrefix)) {
            countyDisplay = 'Ventura / Santa Barbara / Kern';
        }
        // Arizona prefixes
        else if (['850', '851', '852', '853'].includes(zipPrefix)) {
            countyDisplay = 'Maricopa';
        } else if (['857'].includes(zipPrefix)) {
            countyDisplay = 'Pima';
        } else if (['855', '856'].includes(zipPrefix)) {
            countyDisplay = 'Cochise';
        } else if (['863'].includes(zipPrefix)) {
            countyDisplay = 'Yavapai';
        } else if (['854'].includes(zipPrefix)) {
            countyDisplay = 'Pinal';
        } else if (['859'].includes(zipPrefix)) {
            countyDisplay = 'Coconino';
        } else if (['858'].includes(zipPrefix)) {
            countyDisplay = 'Yuma';
        }
        // Washington prefixes
        else if (['980', '981'].includes(zipPrefix)) {
            countyDisplay = 'King';
        } else if (['982'].includes(zipPrefix)) {
            countyDisplay = 'Snohomish';
        } else if (['983', '984'].includes(zipPrefix)) {
            countyDisplay = 'Pierce';
        } else if (['985'].includes(zipPrefix)) {
            countyDisplay = 'Thurston / Lewis';
        } else if (['986'].includes(zipPrefix)) {
            countyDisplay = 'Cowlitz';
        } else if (['988'].includes(zipPrefix)) {
            countyDisplay = 'Chelan';
        } else if (['989'].includes(zipPrefix)) {
            countyDisplay = 'Yakima';
        }
    }

    if (countyDisplay && countyDisplay !== '') {
        html += `
        <div class="popup-row">
            <span class="popup-label">County:</span>
            <span class="popup-value">${countyDisplay}</span>
        </div>
        `;
    }

    // Estimate population based on zip (rough estimates)
    const population = getEstimatedPopulation(zip);
    if (population) {
        html += `
        <div class="popup-row">
            <span class="popup-label">Est. Population:</span>
            <span class="popup-value">${population.toLocaleString()}</span>
        </div>
        `;
    }

    // Show county-level death and cremation estimates (monthly)
    const countyStats = getCountyDeathStats(zip, countyDisplay);
    if (countyStats) {
        const monthlyDeaths = Math.round(countyStats.deaths / 12);
        const monthlyCremations = Math.round(countyStats.cremations / 12);
        html += `
        <div class="popup-section" style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;">
            <div style="font-size:0.75rem;color:#999;margin-bottom:4px;">${countyStats.countyLabel} County</div>
            <div class="popup-row">
                <span class="popup-label">Deaths/mo:</span>
                <span class="popup-value">${monthlyDeaths.toLocaleString()}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Cremations/mo:</span>
                <span class="popup-value">${monthlyCremations.toLocaleString()} <span style="font-size:0.75rem;color:#999">(${(countyStats.cremationRate * 100).toFixed(0)}%)</span></span>
            </div>
        </div>
        `;
    }

    // Show service area status with tier info
    const tier = state.tierZips.get(zip);
    let statusClass = isServiceArea ? 'in-service' : 'out-service';
    let statusText = 'Outside Service Area';
    // Tier supersedes service area
    if (tier === 1) {
        statusText = 'Tier 1';
        statusClass = 'in-service';
    } else if (tier === 2) {
        statusText = 'Tier 2';
        statusClass = 'in-service';
    } else if (tier === 3) {
        statusText = 'Tier 3';
        statusClass = 'in-service';
    } else if (isServiceArea) {
        statusText = 'In Service Area';
    }
    html += `
        <span class="status-badge ${statusClass}">
            ${statusText}
        </span>
    `;

    // Show nearby landmarks for conversation starters
    const nearbyLandmarks = findNearbyLandmarks(zip);
    if (nearbyLandmarks.length > 0) {
        html += `
            <div class="popup-section landmarks-section">
                <h4>📍 Nearby Landmarks</h4>
                <div class="landmarks-list">
        `;

        nearbyLandmarks.forEach(landmark => {
            const typeIcons = {
                'theme park': '🎢',
                'sports': '🏟️',
                'shopping': '🛍️',
                'beach': '🏖️',
                'airport': '✈️',
                'university': '🎓',
                'attraction': '⭐',
                'museum': '🏛️',
                'park': '🌳',
                'casino': '🎰',
                'landmark': '🏛️',
                'venue': '🎭',
                'district': '🏘️'
            };
            const icon = typeIcons[landmark.type] || '📍';

            html += `
                <div class="landmark-item">
                    <span class="landmark-icon">${icon}</span>
                    <span class="landmark-name">${landmark.name}</span>
                    <span class="landmark-distance">~${landmark.driveTime} min</span>
                </div>
            `;
        });

        html += `
                </div>
                <div class="landmarks-hint">💡 "Oh, you're right near ${nearbyLandmarks[0].name}!"</div>
            </div>
        `;
    }

    // Show if this zip has a crematory location
    if (crematoryHere) {
        html += `
            <div class="popup-section" style="background: #FFF8E1; padding: 8px; border-radius: 4px; margin-top: 8px;">
                <strong style="color: #F57C00;">📍 Crematory Location</strong>
                <div style="margin-top: 4px;">${crematoryHere.name}</div>
                <div style="font-size: 0.8rem; color: #666;">${crematoryHere.address}</div>
            </div>
        `;
    }

    // Add crematory distances if this is a service area zip
    if (zipData && zipData.crematories && zipData.crematories.length > 0) {
        // Check if we have real distances
        const hasReal = zipData.crematories.some(c => c.isRealDistance);
        const distanceLabel = hasReal ? 'Driving Distance' : 'Est. Distance';

        html += `
            <div class="popup-section">
                <h4>Assigned Crematories (${zipData.crematories.length})</h4>
                ${!hasReal ? '<div style="font-size: 0.7rem; color: #666; margin-bottom: 6px;">Click for actual driving distances</div>' : ''}
        `;

        zipData.crematories.forEach((crem, index) => {
            // Find full crematory info
            const fullCrem = state.crematoryData.find(c => c.name === crem.name);
            const distanceIndicator = crem.isRealDistance ? '🚗' : '📏';

            html += `
                <div class="crematory-distance" style="${index > 0 ? 'margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ddd;' : ''}">
                    <div class="name" style="font-weight: 600;">${index + 1}. ${crem.name}</div>
                    <div class="details">
                        ${crem.distance ? `${distanceIndicator} ${crem.distance.toFixed(1)} mi` : ''}
                        ${crem.driveTime ? ` • ${crem.isRealDistance ? '' : '~'}${crem.driveTime} min` : ''}
                        ${crem.isRealDistance ? ' <span style="color: #4CAF50; font-size: 0.7rem;">(actual)</span>' : ''}
                    </div>
                    ${fullCrem && fullCrem.address ? `<div class="details" style="font-size: 0.75rem; color: #888;">${fullCrem.address}</div>` : ''}
                </div>
            `;
        });

        html += '</div>';
    } else if (!isServiceArea && state.crematoryData.length > 0) {
        // For non-service area zips, find the nearest crematory
        const nearestCrematory = findNearestCrematory(zip);
        if (nearestCrematory) {
            html += `
                <div class="popup-section" style="background: #FFEBEE; padding: 8px; border-radius: 4px; margin-top: 8px;">
                    <h4 style="color: #C62828; margin-bottom: 6px;">Nearest Crematory (Est.)</h4>
                    <div style="font-size: 0.7rem; color: #666; margin-bottom: 6px;">Click for actual driving distance</div>
                    <div class="crematory-distance">
                        <div class="name" style="font-weight: 600;">${nearestCrematory.name}</div>
                        <div class="details">
                            📏 ~${nearestCrematory.distance.toFixed(1)} mi • ~${nearestCrematory.driveTime} min
                        </div>
                        <div class="details" style="font-size: 0.75rem; color: #888;">${nearestCrematory.address}</div>
                    </div>
                </div>
            `;
        }
    }

    return html;
}

// Find the nearest crematory to a given zip code (using driving distance estimates)
function findNearestCrematory(zip) {
    if (state.crematoryData.length === 0) return null;

    // Get zip centroid from layer
    let zipLat, zipLng;

    if (state.zipCodeLayer) {
        state.zipCodeLayer.eachLayer(layer => {
            const layerZip = layer.feature.properties.ZCTA5CE10 ||
                           layer.feature.properties.zip ||
                           layer.feature.properties.GEOID10;
            if (layerZip === zip) {
                const center = layer.getBounds().getCenter();
                zipLat = center.lat;
                zipLng = center.lng;
            }
        });
    }

    if (!zipLat || !zipLng) return null;

    let nearest = null;
    let minDistance = Infinity;

    state.crematoryData.forEach(crem => {
        if (!crem.lat || !crem.lng) return;

        // Calculate straight-line distance and apply driving multiplier
        const straightLineDistance = calculateHaversineDistance(zipLat, zipLng, crem.lat, crem.lng);
        const drivingDistance = straightLineDistance * CONFIG.drivingDistanceMultiplier;

        if (drivingDistance < minDistance) {
            minDistance = drivingDistance;
            nearest = {
                name: crem.name,
                address: crem.address,
                distance: drivingDistance,
                driveTime: Math.round((drivingDistance / 35) * 60),
                isRealDistance: false
            };
        }
    });

    return nearest;
}

// Find the nearest crematory using actual OSRM driving distances
async function findNearestCrematoryReal(zip) {
    const distances = await calculateDrivingDistanceForZip(zip);

    if (distances && distances.length > 0) {
        const nearest = distances[0];
        nearest.isRealDistance = true;
        return nearest;
    }

    // Fall back to estimated
    return findNearestCrematory(zip);
}

// Find nearby landmarks for a zip code (within ~15 min drive / ~10 miles)
function findNearbyLandmarks(zip) {
    // Check if LANDMARKS is defined (from embedded-data.js)
    if (typeof LANDMARKS === 'undefined' || !LANDMARKS || LANDMARKS.length === 0) {
        return [];
    }

    // Get zip centroid
    let zipLat, zipLng;

    if (state.zipCodeLayer) {
        state.zipCodeLayer.eachLayer(layer => {
            const layerZip = layer.feature.properties.ZCTA5CE10 ||
                           layer.feature.properties.zip ||
                           layer.feature.properties.GEOID10;
            if (layerZip === zip) {
                const center = layer.getBounds().getCenter();
                zipLat = center.lat;
                zipLng = center.lng;
            }
        });
    }

    if (!zipLat || !zipLng) return [];

    // Find landmarks within ~10 miles (roughly 15 min drive)
    const maxDistance = 10; // miles
    const nearbyLandmarks = [];

    LANDMARKS.forEach(landmark => {
        const distance = calculateHaversineDistance(zipLat, zipLng, landmark.lat, landmark.lng);

        if (distance <= maxDistance) {
            nearbyLandmarks.push({
                name: landmark.name,
                type: landmark.type,
                distance: distance,
                driveTime: Math.round((distance * 1.3 / 30) * 60) // Rough estimate: 30 mph average with 1.3x multiplier
            });
        }
    });

    // Sort by distance and return top 3
    nearbyLandmarks.sort((a, b) => a.distance - b.distance);
    return nearbyLandmarks.slice(0, 3);
}

// Estimate population for a zip code (rough estimates based on California averages)
// Cache for population estimates to ensure consistency
const populationCache = new Map();

// Generate a deterministic "random" number based on zip code
function seededRandom(zip) {
    let hash = 0;
    for (let i = 0; i < zip.length; i++) {
        const char = zip.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Return a value between 0 and 1
    return Math.abs((Math.sin(hash) * 10000) % 1);
}

function getEstimatedPopulation(zip) {
    // Check cache first
    if (populationCache.has(zip)) {
        return populationCache.get(zip);
    }

    // Some known high-population zips
    const knownPopulations = {
        // LA high-density
        '90001': 57000, '90002': 51000, '90003': 45000, '90004': 62000, '90005': 37000,
        '90011': 103000, '90044': 65000, '90201': 57000, '90250': 73000,
        // OC
        '92801': 52000, '92804': 60000, '92805': 48000, '92840': 45000,
        '92701': 58000, '92703': 55000, '92704': 62000,
        // SD
        '92101': 35000, '92102': 42000, '92105': 55000, '92114': 58000,
        // IE
        '92501': 32000, '92503': 45000, '92336': 52000, '92879': 48000,
        // Dallas-Fort Worth high-population
        '75201': 25000, '75202': 18000, '75203': 32000, '75204': 28000, '75205': 22000,
        '75206': 35000, '75207': 15000, '75208': 38000, '75209': 20000, '75210': 25000,
        '75211': 55000, '75212': 42000, '75214': 28000, '75215': 30000, '75216': 48000,
        '75217': 65000, '75218': 32000, '75219': 25000, '75220': 28000, '75223': 22000,
        '75224': 35000, '75227': 52000, '75228': 58000, '75229': 32000, '75230': 28000,
        '75231': 30000, '75232': 35000, '75233': 25000, '75234': 42000, '75235': 18000,
        '75238': 28000, '75240': 32000, '75243': 38000, '75244': 35000, '75248': 32000,
        '75287': 45000, '76010': 48000, '76011': 35000, '76012': 42000, '76013': 38000,
        '76014': 45000, '76015': 32000, '76016': 35000, '76017': 28000, '76018': 32000,
        '76040': 28000, '76051': 45000, '76052': 38000, '76053': 32000, '76054': 35000,
        '76101': 22000, '76102': 18000, '76103': 28000, '76104': 32000, '76105': 35000,
        '76106': 42000, '76107': 28000, '76108': 25000, '76109': 22000, '76110': 38000,
        '76111': 25000, '76112': 35000, '76114': 32000, '76115': 28000, '76116': 35000,
        '76117': 28000, '76118': 32000, '76119': 45000, '76120': 28000, '76131': 35000,
        '76132': 28000, '76133': 32000, '76134': 38000, '76137': 32000, '76148': 28000,
        '76177': 42000, '76179': 35000, '76180': 38000, '76201': 28000, '76205': 22000,
        '76207': 25000, '76208': 32000, '76209': 28000, '76210': 35000, '76226': 22000,
        '76244': 35000, '76247': 25000, '76248': 28000, '76262': 32000,
        // Phoenix Metro - based on Census/ACS estimates
        '85003': 8000, '85004': 6000, '85006': 22000, '85007': 18000, '85008': 38000,
        '85009': 35000, '85012': 10000, '85013': 15000, '85014': 20000, '85015': 25000,
        '85016': 22000, '85017': 30000, '85018': 20000, '85019': 18000, '85020': 22000,
        '85021': 28000, '85022': 32000, '85023': 25000, '85024': 18000, '85027': 35000,
        '85028': 14000, '85029': 32000, '85031': 30000, '85032': 48000, '85033': 38000,
        '85034': 8000, '85035': 42000, '85037': 35000, '85040': 25000, '85041': 40000,
        '85042': 30000, '85043': 28000, '85044': 32000, '85045': 10000, '85048': 25000,
        '85050': 18000, '85051': 30000, '85053': 22000, '85054': 8000,
        '85083': 22000, '85085': 18000, '85086': 40000,
        '85201': 28000, '85202': 25000, '85203': 22000, '85204': 38000, '85205': 32000,
        '85206': 40000, '85207': 35000, '85208': 38000, '85209': 28000, '85210': 18000,
        '85212': 25000, '85213': 18000, '85215': 14000,
        '85224': 30000, '85225': 28000, '85226': 25000, '85233': 35000, '85234': 32000,
        '85248': 18000, '85249': 15000,
        '85250': 12000, '85251': 20000, '85253': 10000, '85254': 30000, '85255': 18000,
        '85256': 6000, '85257': 25000, '85258': 15000, '85259': 14000, '85260': 28000,
        '85262': 6000, '85266': 8000, '85268': 18000,
        '85281': 22000, '85282': 28000, '85283': 25000, '85284': 14000, '85286': 20000,
        '85295': 28000, '85296': 35000, '85297': 40000, '85298': 22000,
        '85301': 22000, '85302': 20000, '85303': 25000, '85304': 18000, '85305': 15000,
        '85306': 25000, '85307': 14000, '85308': 35000, '85310': 8000,
        '85323': 38000, '85326': 15000, '85331': 14000, '85335': 18000,
        '85338': 42000, '85339': 28000, '85340': 10000, '85345': 30000,
        '85351': 28000, '85353': 15000, '85355': 10000, '85363': 5000,
        '85373': 25000, '85374': 40000, '85375': 22000, '85379': 45000,
        '85381': 25000, '85382': 22000, '85383': 18000, '85387': 15000, '85388': 14000,
        '85392': 30000, '85395': 35000, '85396': 40000,
        // Tucson Metro - based on Census/ACS estimates
        '85701': 5000, '85704': 28000, '85705': 22000, '85706': 30000, '85710': 32000,
        '85711': 18000, '85712': 22000, '85713': 25000, '85714': 8000, '85715': 14000,
        '85716': 18000, '85718': 22000, '85719': 18000,
        '85730': 12000, '85735': 8000, '85737': 25000, '85739': 6000,
        '85741': 28000, '85742': 22000, '85743': 18000, '85745': 15000,
        '85746': 28000, '85747': 22000, '85748': 12000, '85749': 14000, '85750': 16000,
        '85755': 18000, '85756': 30000, '85757': 20000,
        '85614': 13000, '85629': 22000, '85653': 15000, '85658': 10000,
        // Washington State - expanded coverage (Census/ACS estimates)
        // Kitsap Peninsula
        '98110': 24000, '98310': 22000, '98311': 28000, '98312': 32000,
        '98315': 18000, '98337': 12000, '98340': 4000, '98342': 3000,
        '98345': 2000, '98346': 8000, '98353': 3000, '98366': 28000,
        '98367': 25000, '98370': 22000, '98380': 3000, '98383': 20000,
        '98392': 4000,
        // Thurston / Olympia
        '98501': 28000, '98502': 22000, '98503': 35000, '98506': 18000,
        '98512': 25000, '98513': 30000, '98516': 22000, '98530': 1500,
        '98576': 5000, '98579': 8000, '98589': 6000, '98597': 15000,
        // Mason
        '98524': 4000, '98528': 8000, '98546': 2000, '98548': 3000,
        '98555': 1000, '98560': 2000, '98584': 12000, '98588': 2000,
        '98592': 3000,
        // Island County
        '98239': 8000, '98249': 6000, '98253': 3000, '98260': 5000,
        '98277': 28000, '98278': 18000,
        // Jefferson / Clallam
        '98325': 3000, '98358': 2000, '98362': 22000, '98363': 12000,
        '98365': 5000, '98368': 12000, '98376': 2000, '98382': 14000,
        // Lewis
        '98336': 1000, '98356': 3000, '98361': 2000, '98377': 1500,
        '98531': 18000, '98532': 12000, '98533': 800, '98538': 500,
        '98542': 800, '98544': 600, '98564': 1500, '98565': 3000,
        '98570': 2500, '98582': 1000, '98585': 800, '98591': 2500,
        '98596': 3000,
        // Grays Harbor
        '98520': 18000, '98541': 5000, '98557': 3000, '98559': 4000,
        '98563': 5000, '98568': 1500, '98575': 800, '98583': 1000,
        // Pierce expanded
        '98303': 1500, '98385': 6000, '98387': 38000, '98388': 8000,
        '98394': 2000, '98396': 2000, '98438': 5000, '98498': 28000,
        '98499': 22000, '98558': 4000, '98580': 5000,
        // Whatcom / Bellingham area (on map, outside tiers)
        '98220': 2000, '98229': 32000,
        // Chelan / Wenatchee
        '98801': 35000, '98826': 4000, '98847': 2000,
        // Yakima / Kittitas
        '98922': 4000, '98925': 1500, '98926': 22000, '98929': 2000,
        '98937': 3000, '98940': 500, '98941': 2000, '98943': 1000, '98946': 800
    };

    let population;

    if (knownPopulations[zip]) {
        population = knownPopulations[zip];
    } else {
        // Use seeded random for consistent estimates
        const rand = seededRandom(zip);
        const zipPrefix = zip.substring(0, 3);

        // California estimates
        // Urban LA
        if (['900', '901', '902'].includes(zipPrefix)) {
            population = Math.floor(35000 + rand * 30000);
        }
        // Suburban LA
        else if (['903', '904', '905', '906', '907', '908'].includes(zipPrefix)) {
            population = Math.floor(25000 + rand * 25000);
        }
        // Valley / outer LA
        else if (['910', '911', '912', '913', '914', '915', '916', '917', '918'].includes(zipPrefix)) {
            population = Math.floor(20000 + rand * 30000);
        }
        // Orange County
        else if (['926', '927', '928'].includes(zipPrefix)) {
            population = Math.floor(25000 + rand * 25000);
        }
        // San Diego
        else if (['920', '921'].includes(zipPrefix)) {
            population = Math.floor(20000 + rand * 25000);
        }
        // Inland Empire
        else if (['922', '923', '924', '925'].includes(zipPrefix)) {
            population = Math.floor(15000 + rand * 25000);
        }
        // Rural/desert areas CA
        else if (['930', '931', '932', '933', '934', '935'].includes(zipPrefix)) {
            population = Math.floor(5000 + rand * 15000);
        }
        // Texas estimates
        // Dallas urban core (752xx)
        else if (zipPrefix === '752') {
            population = Math.floor(25000 + rand * 35000);
        }
        // Dallas suburbs (750, 751, 753, 754, 755)
        else if (['750', '751', '753', '754', '755'].includes(zipPrefix)) {
            population = Math.floor(20000 + rand * 25000);
        }
        // Fort Worth urban (761)
        else if (zipPrefix === '761') {
            population = Math.floor(25000 + rand * 30000);
        }
        // Fort Worth/Arlington area (760)
        else if (zipPrefix === '760') {
            population = Math.floor(22000 + rand * 28000);
        }
        // Denton/North suburbs (762)
        else if (zipPrefix === '762') {
            population = Math.floor(18000 + rand * 25000);
        }
        // Outer DFW suburbs and exurbs (763, 764, 765, 766, 767, 768, 769)
        else if (['763', '764', '765', '766', '767', '768', '769'].includes(zipPrefix)) {
            population = Math.floor(8000 + rand * 18000);
        }
        // Rural Texas
        else if (['754', '755', '756', '757', '758', '759'].includes(zipPrefix)) {
            population = Math.floor(3000 + rand * 12000);
        }
        // Arizona estimates
        // Phoenix urban core (850xx)
        else if (zipPrefix === '850') {
            population = Math.floor(18000 + rand * 25000);
        }
        // Phoenix metro - Mesa/Chandler/Gilbert/Tempe (852xx)
        else if (zipPrefix === '852') {
            population = Math.floor(18000 + rand * 25000);
        }
        // Phoenix suburbs - Glendale/Peoria/Surprise (853xx)
        else if (zipPrefix === '853') {
            population = Math.floor(12000 + rand * 22000);
        }
        // Phoenix outer suburbs - Pinal County towns (851xx)
        else if (zipPrefix === '851') {
            population = Math.floor(8000 + rand * 18000);
        }
        // Tucson urban (857xx)
        else if (zipPrefix === '857') {
            population = Math.floor(14000 + rand * 20000);
        }
        // Tucson suburbs/Southern AZ (856xx)
        else if (zipPrefix === '856') {
            population = Math.floor(3000 + rand * 15000);
        }
        // Rural AZ - Pinal County towns (854xx)
        else if (zipPrefix === '854') {
            population = Math.floor(2000 + rand * 12000);
        }
        // Rural AZ - Cochise/Graham/Gila/Greenlee (855xx)
        else if (zipPrefix === '855') {
            population = Math.floor(1500 + rand * 10000);
        }
        // Northern AZ - Yavapai/Prescott area (863xx)
        else if (zipPrefix === '863') {
            population = Math.floor(4000 + rand * 18000);
        }
        // Rural/remote AZ (858, 859, 860, 861, 862, 864, 865)
        else if (['858', '859', '860', '861', '862', '864', '865'].includes(zipPrefix)) {
            population = Math.floor(800 + rand * 6000);
        }
        // Default estimate
        else {
            population = Math.floor(12000 + rand * 18000);
        }
    }

    // Cache the result
    populationCache.set(zip, population);
    return population;
}

/**
 * Get county-level annual death and cremation totals for a zip code.
 * Returns the whole county's numbers (not zip-level estimates).
 */
function getCountyDeathStats(zip, countyDisplay) {
    if (typeof COUNTY_DEATH_DATA === 'undefined') return null;

    // Resolve county name from city/county data first, then popup display
    const cityCounty = state.zipToCityCounty.get(zip);
    let county = cityCounty ? cityCounty.county : (countyDisplay || '');

    // Handle compound counties (e.g. "Thurston / Lewis") - take first
    if (county.includes('/')) {
        county = county.split('/')[0].trim();
    }

    if (!county) return null;

    // Determine state from zip prefix
    const prefix = zip.substring(0, 2);
    let stateCode = '';
    if (prefix >= '90' && prefix <= '96') stateCode = 'CA';
    else if (prefix >= '75' && prefix <= '79') stateCode = 'TX';
    else if (prefix >= '85' && prefix <= '86') stateCode = 'AZ';
    else if (prefix >= '98' && prefix <= '99') stateCode = 'WA';

    if (!stateCode) return null;

    const key = `${county}, ${stateCode}`;
    const countyData = COUNTY_DEATH_DATA[key];

    if (!countyData) return null;

    const annualCremations = Math.round(countyData.deaths * countyData.cremationRate);

    return {
        deaths: countyData.deaths,
        cremations: annualCremations,
        cremationRate: countyData.cremationRate,
        countyLabel: county,
        stateCode: stateCode
    };
}

/**
 * Estimate zip-level annual deaths and cremations using county crude rate.
 * Returns { deaths, cremations } (annual) or null if no data.
 */
function getZipDeathEstimate(zip, population) {
    if (typeof COUNTY_DEATH_DATA === 'undefined' || !population) return null;

    const cityCounty = state.zipToCityCounty.get(zip);
    let county = cityCounty ? cityCounty.county : '';

    if (county.includes('/')) {
        county = county.split('/')[0].trim();
    }

    if (!county) return null;

    const prefix = zip.substring(0, 2);
    let stateCode = '';
    if (prefix >= '90' && prefix <= '96') stateCode = 'CA';
    else if (prefix >= '75' && prefix <= '79') stateCode = 'TX';
    else if (prefix >= '85' && prefix <= '86') stateCode = 'AZ';
    else if (prefix >= '98' && prefix <= '99') stateCode = 'WA';

    if (!stateCode) return null;

    const key = `${county}, ${stateCode}`;
    const countyData = COUNTY_DEATH_DATA[key];
    if (!countyData) return null;

    const annualDeaths = population * countyData.crudeRate / 100000;
    const annualCremations = annualDeaths * countyData.cremationRate;

    return { deaths: annualDeaths, cremations: annualCremations };
}

// ============================================================================
// Excel File Processing
// ============================================================================

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading('Processing Excel file...');

    try {
        console.log('=== Starting Excel file processing ===');
        console.log('File:', file.name, 'Size:', file.size);

        const data = await readExcelFile(file);
        console.log('Workbook loaded, sheets:', data.SheetNames);

        await processExcelData(data);

        console.log('=== Processing complete ===');
        console.log('Service area zips:', state.serviceAreaZips.size);
        console.log('Crematories:', state.crematoryData.length);
        console.log('Crematory zips:', state.crematoryZips.size);

        // Update map styling
        refreshMapStyles();

        // Update UI
        updateStatisticsPanel();
        updateCrematoriesPanel();

        // Enable export button
        document.getElementById('exportBtn').disabled = false;

        state.isDataLoaded = true;
        hideLoading();

        // Show success message
        alert(`Successfully loaded:\n- ${state.serviceAreaZips.size} zip codes in service area\n- ${state.crematoryData.length} crematories`);

    } catch (error) {
        console.error('Error processing Excel file:', error);
        console.error('Stack:', error.stack);
        hideLoading();
        showError('Failed to process Excel file: ' + error.message);
    }
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                resolve(workbook);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Handle CSV upload to add additional service area zips
async function handleAddServiceZipsCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading('Processing CSV file...');

    try {
        const text = await file.text();
        const lines = text.trim().split('\n');

        // Skip header row if present
        let startIndex = 0;
        const firstLine = lines[0].toLowerCase();
        if (firstLine.includes('zip') || firstLine.includes('crematory')) {
            startIndex = 1;
        }

        let addedCount = 0;
        let skippedCount = 0;
        const addedZips = [];

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Parse CSV line (handle quoted values)
            const parts = parseCSVLine(line);
            if (parts.length < 1) continue;

            const zip = parts[0].trim().replace(/['"]/g, '');
            const crematory = parts.length > 1 ? parts[1].trim().replace(/['"]/g, '') : '';

            // Skip if already in service area
            if (state.serviceAreaZips.has(zip)) {
                skippedCount++;
                continue;
            }

            // Add to service area
            state.serviceAreaZips.add(zip);

            // Remove from nearby/extended/tier if present (since it's now in service area)
            state.nearbyZips.delete(zip);
            state.extendedZips.delete(zip);
            state.tierZips.delete(zip);

            // Update zip data if it exists
            const zipData = state.zipCodeData.get(zip);
            if (zipData) {
                zipData.serviceArea = true;
                if (crematory) {
                    zipData.crematories = [{ name: crematory }];
                }
            }

            addedZips.push({ zip, crematory });
            addedCount++;
        }

        // Refresh map styles
        refreshMapStyles();

        // Update panels
        updateStatisticsPanel();

        hideLoading();

        // Show summary
        alert(`CSV Import Complete:\n- ${addedCount} zip codes added to service area\n- ${skippedCount} zip codes already in service area`);

        console.log('Added zips from CSV:', addedZips);

    } catch (error) {
        console.error('Error processing CSV:', error);
        hideLoading();
        showError('Failed to process CSV file: ' + error.message);
    }

    // Reset file input so same file can be uploaded again
    event.target.value = '';
}

// Parse a CSV line handling quoted values
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

async function processExcelData(workbook) {
    const sheetNames = workbook.SheetNames;

    console.log('Found sheets:', sheetNames);

    // Find crematory locations sheet
    const crematorySheet = sheetNames.find(name =>
        name.toLowerCase().includes('crematory locations') ||
        name.toLowerCase().includes('cremator') && name.toLowerCase().includes('location')
    );

    // Process crematory locations first
    if (crematorySheet) {
        await processCrematoriesSheet(workbook.Sheets[crematorySheet]);
    } else {
        console.warn('No crematory locations sheet found');
    }

    // Define known county sheet mappings
    const countyMappings = {
        'San Bernardino & Riverside': 'San Bernardino & Riverside',
        'San Diego': 'San Diego',
        'LA': 'Los Angeles',
        'OC': 'Orange',
        'Orange': 'Orange',
        'Los Angeles': 'Los Angeles',
        'Riverside': 'Riverside',
        'San Bernardino': 'San Bernardino',
        'Ventura': 'Ventura',
        'Imperial': 'Imperial'
    };

    // Process county sheets (service area data)
    for (const sheetName of sheetNames) {
        if (sheetName === crematorySheet) continue;
        if (sheetName.toLowerCase().includes('use sales') || sheetName.toLowerCase().includes('hidden')) continue;

        // Map sheet name to county
        let countyName = countyMappings[sheetName];
        if (!countyName) {
            // Try partial match
            for (const [key, value] of Object.entries(countyMappings)) {
                if (sheetName.toLowerCase().includes(key.toLowerCase())) {
                    countyName = value;
                    break;
                }
            }
        }

        if (countyName) {
            console.log(`Processing sheet "${sheetName}" as county: ${countyName}`);
            await processCountySheet(workbook.Sheets[sheetName], countyName);
        }
    }

    // Calculate distances for all service area zips
    await calculateDistances();
}

async function processCrematoriesSheet(sheet) {
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log('Processing crematories:', data.length, data);

    for (const row of data) {
        // Column names from your file: "Crematory" and "Address"
        const name = row.Crematory || row.crematory || row.Name || row.name || row['Crematory Name'] || Object.values(row)[0];
        const address = row.Address || row.address || row.Location || row.location || Object.values(row)[1];

        if (name && address) {
            const crematory = {
                name: name.toString().trim(),
                address: address.toString().trim(),
                lat: null,
                lng: null,
                assignedZips: []
            };

            console.log(`Geocoding crematory: ${crematory.name} at ${crematory.address}`);

            // Try to geocode the address
            const coords = await geocodeAddress(crematory.address);
            if (coords) {
                crematory.lat = coords.lat;
                crematory.lng = coords.lng;
                console.log(`  -> Found coordinates: ${coords.lat}, ${coords.lng}`);

                // Add marker to map
                addCrematoryMarker(crematory);
            } else {
                console.warn(`  -> Could not geocode address`);
            }

            state.crematoryData.push(crematory);
        }
    }

    console.log(`Loaded ${state.crematoryData.length} crematories`);
}

async function processCountySheet(sheet, countyName) {
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`Processing ${countyName} with ${data.length} rows`);

    for (const row of data) {
        // Find zip code column - your file uses "Zip Code"
        let zip = row['Zip Code'] || row.Zip || row.ZIP || row.zip || row.ZipCode || row['zip code'];

        // Handle case where first column might not have a header
        if (!zip) {
            const firstValue = Object.values(row)[0];
            if (firstValue && /^\d{5}$/.test(firstValue.toString().trim())) {
                zip = firstValue;
            }
        }

        if (!zip) continue;
        zip = zip.toString().trim();

        // Validate it's a 5-digit zip
        if (!/^\d{5}$/.test(zip)) continue;

        // Mark as service area
        state.serviceAreaZips.add(zip);

        // Find city column (if exists)
        const city = row.City || row.city || row['City Name'] || '';

        // Store city/county info
        state.zipToCityCounty.set(zip, { city: city || 'Unknown', county: countyName });

        // Get or create zip data
        let zipData = state.zipCodeData.get(zip);
        if (!zipData) {
            zipData = {
                serviceArea: true,
                crematories: [],
                hasCrematory: false
            };
        }
        zipData.serviceArea = true;
        zipData.crematories = []; // Reset to avoid duplicates

        // Find crematory assignments - your file uses "Crematory 1", "Crematory 2", "Crematory 3"
        const crematoryColumns = ['Crematory 1', 'Crematory 2', 'Crematory 3', 'Crematory',
                                   'crematory 1', 'crematory 2', 'crematory 3', 'crematory'];

        for (const col of crematoryColumns) {
            const crematoryName = row[col]?.toString().trim();
            if (crematoryName && crematoryName.length > 0) {
                // Find matching crematory (flexible matching)
                const crematory = state.crematoryData.find(c => {
                    const cName = c.name.toLowerCase();
                    const inputName = crematoryName.toLowerCase();
                    return cName === inputName ||
                           cName.includes(inputName) ||
                           inputName.includes(cName) ||
                           // Handle short names like "Anubis" matching "Anubis Riverside"
                           cName.split(' ')[0] === inputName ||
                           inputName.split(' ')[0] === cName.split(' ')[0];
                });

                if (crematory) {
                    if (!crematory.assignedZips.includes(zip)) {
                        crematory.assignedZips.push(zip);
                    }
                    // Avoid duplicate entries
                    if (!zipData.crematories.find(c => c.name === crematory.name)) {
                        zipData.crematories.push({
                            name: crematory.name,
                            distance: null,
                            driveTime: null
                        });
                    }
                } else {
                    // Crematory not in locations sheet, add as unknown
                    console.warn(`Crematory "${crematoryName}" not found in Crematory Locations sheet`);
                    if (!zipData.crematories.find(c => c.name === crematoryName)) {
                        zipData.crematories.push({
                            name: crematoryName,
                            distance: null,
                            driveTime: null
                        });
                    }
                }
            }
        }

        state.zipCodeData.set(zip, zipData);

        // Check if this zip contains a crematory (by checking addresses)
        const hasCrematory = state.crematoryData.some(c => {
            if (!c.address) return false;
            // Extract zip from address
            const addressZipMatch = c.address.match(/\b(\d{5})\b/);
            return addressZipMatch && addressZipMatch[1] === zip;
        });

        if (hasCrematory) {
            state.crematoryZips.add(zip);
            zipData.hasCrematory = true;
        }
    }

    console.log(`  -> Added ${data.length} zips from ${countyName}`);
}

async function geocodeAddress(address) {
    try {
        const params = new URLSearchParams({
            q: address,
            format: 'json',
            limit: 1,
            countrycodes: 'us'
        });

        const response = await fetch(`${CONFIG.nominatimUrl}?${params}`, {
            headers: {
                'User-Agent': 'CrematoryServiceAreaAnalyzer/1.0'
            }
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
    } catch (error) {
        console.warn('Geocoding failed for:', address);
    }
    return null;
}

function addCrematoryMarker(crematory) {
    if (!crematory.lat || !crematory.lng) return;

    const icon = L.divIcon({
        className: 'crematory-marker-icon',
        html: `<div style="
            background: ${CONFIG.colors.crematoryBorder};
            border: 3px solid ${CONFIG.colors.dark || '#263238'};
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        "><i class="fas fa-fire" style="font-size: 10px; color: #333;"></i></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const marker = L.marker([crematory.lat, crematory.lng], { icon })
        .addTo(state.map)
        .bindPopup(`
            <div class="popup-header">${crematory.name}</div>
            <div class="popup-row">
                <span class="popup-label">Address:</span>
                <span class="popup-value">${crematory.address}</span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Assigned Zips:</span>
                <span class="popup-value">${crematory.assignedZips.length}</span>
            </div>
        `);

    marker.on('click', () => highlightCrematoryZips(crematory));

    state.crematoryMarkers.push(marker);
}

async function calculateDistances() {
    console.log('Calculating distances for all service area zips...');

    // Build a map of zip code centroids from the layer
    const zipCentroids = new Map();

    if (state.zipCodeLayer) {
        state.zipCodeLayer.eachLayer(layer => {
            const zip = layer.feature.properties.ZCTA5CE10 ||
                       layer.feature.properties.zip ||
                       layer.feature.properties.GEOID10;
            if (zip) {
                const bounds = layer.getBounds();
                const center = bounds.getCenter();
                zipCentroids.set(zip, { lat: center.lat, lng: center.lng });
            }
        });
    }

    console.log(`Found ${zipCentroids.size} zip centroids from layer`);

    // For each zip in service area, calculate distance to assigned crematories
    for (const [zip, zipData] of state.zipCodeData) {
        if (!zipData.serviceArea || !zipData.crematories) continue;

        // Get zip centroid from layer or from stored geometry
        let zipLat, zipLng;
        const layerCentroid = zipCentroids.get(zip);

        if (layerCentroid) {
            zipLat = layerCentroid.lat;
            zipLng = layerCentroid.lng;
        } else if (zipData.geometry) {
            const geoCentroid = getCentroid(zipData.geometry);
            if (geoCentroid) {
                zipLng = geoCentroid[0];
                zipLat = geoCentroid[1];
            }
        }

        if (!zipLat || !zipLng) continue;

        for (const cremRef of zipData.crematories) {
            const crematory = state.crematoryData.find(c => c.name === cremRef.name);
            if (!crematory || !crematory.lat || !crematory.lng) continue;

            // Calculate straight-line distance (Haversine) and convert to estimated driving distance
            const straightLineDistance = calculateHaversineDistance(
                zipLat, zipLng,
                crematory.lat, crematory.lng
            );

            // Apply driving distance multiplier for more realistic estimate
            cremRef.distance = straightLineDistance * CONFIG.drivingDistanceMultiplier;

            // Estimate drive time (rough estimate: 35 mph average for mixed urban/suburban/highway)
            cremRef.driveTime = Math.round((cremRef.distance / 35) * 60);
        }
    }

    console.log('Distance calculations complete');
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

// ============================================================================
// Real Driving Distance Calculation (OSRM API)
// ============================================================================

// Cache for driving distances to avoid repeated API calls
const drivingDistanceCache = new Map();

// Get actual driving distance and time from OSRM API
async function getOSRMDrivingDistance(fromLat, fromLng, toLat, toLng) {
    // Create cache key
    const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}`;

    if (drivingDistanceCache.has(cacheKey)) {
        return drivingDistanceCache.get(cacheKey);
    }

    try {
        const url = `${CONFIG.osrmUrl}${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn('OSRM API request failed');
            return null;
        }

        const data = await response.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const result = {
                distance: route.distance / 1609.34, // Convert meters to miles
                duration: Math.round(route.duration / 60) // Convert seconds to minutes
            };

            // Cache the result
            drivingDistanceCache.set(cacheKey, result);
            return result;
        }
    } catch (error) {
        console.warn('OSRM API error:', error);
    }

    return null;
}

// Calculate driving distance for a specific zip to its nearest crematory
async function calculateDrivingDistanceForZip(zip) {
    if (!state.zipCodeLayer) return null;

    let zipLat, zipLng;

    state.zipCodeLayer.eachLayer(layer => {
        const layerZip = layer.feature.properties.ZCTA5CE10 ||
                        layer.feature.properties.zip ||
                        layer.feature.properties.GEOID10;
        if (layerZip === zip) {
            const center = layer.getBounds().getCenter();
            zipLat = center.lat;
            zipLng = center.lng;
        }
    });

    if (!zipLat || !zipLng) return null;

    // Find distances to all crematories
    const distances = [];

    for (const crem of state.crematoryData) {
        if (!crem.lat || !crem.lng) continue;

        const result = await getOSRMDrivingDistance(zipLat, zipLng, crem.lat, crem.lng);

        if (result) {
            distances.push({
                name: crem.name,
                address: crem.address,
                distance: result.distance,
                driveTime: result.duration
            });
        }
    }

    // Sort by distance
    distances.sort((a, b) => a.distance - b.distance);
    return distances;
}

// Update zip data with real driving distances (called on demand)
async function fetchRealDrivingDistances(zip) {
    const zipData = state.zipCodeData.get(zip);
    if (!zipData) return;

    // Get zip centroid
    let zipLat, zipLng;

    if (state.zipCodeLayer) {
        state.zipCodeLayer.eachLayer(layer => {
            const layerZip = layer.feature.properties.ZCTA5CE10 ||
                            layer.feature.properties.zip ||
                            layer.feature.properties.GEOID10;
            if (layerZip === zip) {
                const center = layer.getBounds().getCenter();
                zipLat = center.lat;
                zipLng = center.lng;
            }
        });
    }

    if (!zipLat || !zipLng) return;

    // Update distances for assigned crematories
    if (zipData.crematories && zipData.crematories.length > 0) {
        for (const cremRef of zipData.crematories) {
            const crematory = state.crematoryData.find(c => c.name === cremRef.name);
            if (!crematory || !crematory.lat || !crematory.lng) continue;

            const result = await getOSRMDrivingDistance(zipLat, zipLng, crematory.lat, crematory.lng);

            if (result) {
                cremRef.distance = result.distance;
                cremRef.driveTime = result.duration;
                cremRef.isRealDistance = true;
            }
        }
    }

    return zipData;
}

// ============================================================================
// Map Refresh & Styling
// ============================================================================

function refreshMapStyles() {
    if (state.zipCodeLayer) {
        state.zipCodeLayer.eachLayer(layer => {
            const zip = layer.feature.properties.ZCTA5CE10 ||
                       layer.feature.properties.zip ||
                       layer.feature.properties.GEOID10;

            const isServiceArea = state.serviceAreaZips.has(zip);
            const tier = state.tierZips.get(zip);
            const hasCrematory = state.crematoryZips.has(zip);

            let fillColor;
            let fillOpacity;
            // Tier assignment supersedes service area when both exist
            if (tier === 1) {
                fillColor = CONFIG.colors.tier1;
                fillOpacity = 0.55;
            } else if (tier === 2) {
                fillColor = CONFIG.colors.tier2;
                fillOpacity = 0.5;
            } else if (tier === 3) {
                fillColor = CONFIG.colors.tier3;
                fillOpacity = 0.5;
            } else if (isServiceArea) {
                fillColor = CONFIG.colors.serviceArea;
                fillOpacity = 0.6;
            } else {
                fillColor = CONFIG.colors.outsideArea;
                fillOpacity = 0.4;
            }

            layer.setStyle({
                fillColor: fillColor,
                weight: hasCrematory ? 3 : 1,
                opacity: 1,
                color: hasCrematory ? CONFIG.colors.crematoryBorder : '#fff',
                fillOpacity: fillOpacity
            });
        });
    }
}

// Load SoCal distance tiers and calculate nearby/extended zips for other regions
function calculateNearbyZips() {
    console.log('Loading SoCal tier data and calculating nearby zips...');

    state.nearbyZips.clear();
    state.extendedZips.clear();
    state.tierZips.clear();

    // Load tier data from all regions (defined in embedded-data.js)
    const tierSources = [
        { name: 'SoCal', data: typeof SOCAL_TIER_DATA !== 'undefined' ? SOCAL_TIER_DATA : null },
        { name: 'AZ', data: typeof AZ_TIER_DATA !== 'undefined' ? AZ_TIER_DATA : null },
        { name: 'WA', data: typeof WA_TIER_DATA !== 'undefined' ? WA_TIER_DATA : null }
    ];

    tierSources.forEach(({ name, data }) => {
        if (data) {
            Object.entries(data).forEach(([zip, tier]) => {
                state.tierZips.set(zip, tier);
                if (tier === 1) {
                    state.nearbyZips.add(zip);
                } else if (tier === 2 || tier === 3) {
                    state.extendedZips.add(zip);
                }
            });
            const t1 = Object.values(data).filter(t => t === 1).length;
            const t2 = Object.values(data).filter(t => t === 2).length;
            const t3 = Object.values(data).filter(t => t === 3).length;
            console.log(`Loaded ${name} tier zips (T1: ${t1}, T2: ${t2}, T3: ${t3})`);
        }
    });

    console.log(`Total tier zips: ${state.tierZips.size}, nearby: ${state.nearbyZips.size}, extended: ${state.extendedZips.size}`);
}

function highlightCrematoryZips(crematory) {
    // Reset previous selection
    if (state.selectedCrematory) {
        refreshMapStyles();
    }

    state.selectedCrematory = crematory;

    // Highlight assigned zips
    if (state.zipCodeLayer) {
        state.zipCodeLayer.eachLayer(layer => {
            const zip = layer.feature.properties.ZCTA5CE10 ||
                       layer.feature.properties.zip ||
                       layer.feature.properties.GEOID10;

            if (crematory.assignedZips.includes(zip)) {
                layer.setStyle({
                    fillColor: CONFIG.colors.highlight,
                    weight: 3,
                    color: CONFIG.colors.primary || '#2196F3',
                    fillOpacity: 0.7
                });
                layer.bringToFront();
            }
        });
    }

    // Update crematory panel selection
    document.querySelectorAll('.crematory-item').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.name === crematory.name) {
            el.classList.add('active');
        }
    });
}

// ============================================================================
// Statistics Panel
// ============================================================================

function updateStatisticsPanel() {
    const container = document.getElementById('statsContent');

    // Calculate overall statistics
    const totalServiceZips = state.serviceAreaZips.size;
    let tier1Count = 0, tier2Count = 0, tier3Count = 0;
    state.tierZips.forEach((tier) => {
        if (tier === 1) tier1Count++;
        else if (tier === 2) tier2Count++;
        else if (tier === 3) tier3Count++;
    });

    let html = `
        <div class="stat-section">
            <h4>Overall Service Area</h4>
            <div class="stat-row">
                <span class="stat-label">Service Area Zips</span>
                <span class="stat-value">${totalServiceZips.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Tier 1 (0-50mi)</span>
                <span class="stat-value">${tier1Count.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Tier 2 (50-70mi)</span>
                <span class="stat-value">${tier2Count.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Tier 3 (70-100mi)</span>
                <span class="stat-value">${tier3Count.toLocaleString()}</span>
            </div>
        </div>
    `;

    // Add crematory stats
    if (state.crematoryData.length > 0) {
        html += `
            <div class="stat-section">
                <h4>By Crematory</h4>
        `;

        state.crematoryData.forEach(crem => {
            html += `
                <div class="county-stat">
                    <span>${crem.name}</span>
                    <span>${crem.assignedZips.length} zips</span>
                </div>
            `;
        });

        html += '</div>';
    }

    // Add viewport stats section (will be updated by updateViewportStats)
    html += `
        <div class="stat-section" id="viewportStatsSection">
            <h4>📍 Current View</h4>
            <div id="viewportStats">
                <p class="no-data" style="font-size: 0.85rem;">Pan/zoom to see stats for visible area</p>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Setup map move listener if not already done
    setupViewportStatsListener();

    // Calculate initial viewport stats
    updateViewportStats();
}

// Setup listener for map movement to update viewport statistics
let viewportStatsListenerSetup = false;
function setupViewportStatsListener() {
    if (viewportStatsListenerSetup || !state.map) return;

    state.map.on('moveend', debounce(updateViewportStats, 300));
    state.map.on('zoomend', debounce(updateViewportStats, 300));
    viewportStatsListenerSetup = true;
}

// Update statistics for the current viewport
function updateViewportStats() {
    const container = document.getElementById('viewportStats');
    if (!container || !state.map || !state.zipCodeLayer) return;

    const bounds = state.map.getBounds();

    let inViewServiceArea = 0;
    let inViewTier1 = 0;
    let inViewTier2 = 0;
    let inViewTier3 = 0;
    let inViewOutside = 0;
    let serviceAreaPopulation = 0;
    let tier1Population = 0;
    let tier2Population = 0;
    let tier3Population = 0;
    let outsidePopulation = 0;
    // Death/cremation accumulators per tier (annual, converted to monthly at display)
    let serviceDeaths = 0, serviceCremations = 0;
    let tier1Deaths = 0, tier1Cremations = 0;
    let tier2Deaths = 0, tier2Cremations = 0;
    let tier3Deaths = 0, tier3Cremations = 0;
    let outsideDeaths = 0, outsideCremations = 0;

    // Count zips in current view
    state.zipCodeLayer.eachLayer(layer => {
        const zip = layer.feature.properties.ZCTA5CE10 ||
                   layer.feature.properties.zip ||
                   layer.feature.properties.GEOID10;

        // Check if zip centroid is in current view
        const center = layer.getBounds().getCenter();
        if (!bounds.contains(center)) return;

        const population = getEstimatedPopulation(zip);
        const tier = state.tierZips.get(zip);

        // Estimate zip-level deaths using county crude rate
        const zipDeathInfo = getZipDeathEstimate(zip, population);
        const zipDeaths = zipDeathInfo ? zipDeathInfo.deaths : 0;
        const zipCremations = zipDeathInfo ? zipDeathInfo.cremations : 0;

        // Tier assignment supersedes service area when both exist
        if (tier === 1) {
            inViewTier1++;
            tier1Population += population;
            tier1Deaths += zipDeaths;
            tier1Cremations += zipCremations;
        } else if (tier === 2) {
            inViewTier2++;
            tier2Population += population;
            tier2Deaths += zipDeaths;
            tier2Cremations += zipCremations;
        } else if (tier === 3) {
            inViewTier3++;
            tier3Population += population;
            tier3Deaths += zipDeaths;
            tier3Cremations += zipCremations;
        } else if (state.serviceAreaZips.has(zip)) {
            inViewServiceArea++;
            serviceAreaPopulation += population;
            serviceDeaths += zipDeaths;
            serviceCremations += zipCremations;
        } else {
            inViewOutside++;
            outsidePopulation += population;
            outsideDeaths += zipDeaths;
            outsideCremations += zipCremations;
        }
    });

    const totalInView = inViewServiceArea + inViewTier1 + inViewTier2 + inViewTier3 + inViewOutside;
    const totalPopInView = serviceAreaPopulation + tier1Population + tier2Population + tier3Population + outsidePopulation;

    if (totalInView === 0) {
        container.innerHTML = '<p class="no-data" style="font-size: 0.85rem;">No zip codes in current view</p>';
        return;
    }

    // Calculate percentages
    const servicePercent = totalPopInView > 0 ? Math.round((serviceAreaPopulation / totalPopInView) * 100) : 0;
    const tier1Percent = totalPopInView > 0 ? Math.round((tier1Population / totalPopInView) * 100) : 0;
    const tier2Percent = totalPopInView > 0 ? Math.round((tier2Population / totalPopInView) * 100) : 0;
    const tier3Percent = totalPopInView > 0 ? Math.round((tier3Population / totalPopInView) * 100) : 0;
    const outsidePercent = totalPopInView > 0 ? Math.round((outsidePopulation / totalPopInView) * 100) : 0;

    // Convert annual accumulators to monthly for display
    const svcDeathsMo = Math.round(serviceDeaths / 12);
    const svcCremMo = Math.round(serviceCremations / 12);
    const t1DeathsMo = Math.round(tier1Deaths / 12);
    const t1CremMo = Math.round(tier1Cremations / 12);
    const t2DeathsMo = Math.round(tier2Deaths / 12);
    const t2CremMo = Math.round(tier2Cremations / 12);
    const t3DeathsMo = Math.round(tier3Deaths / 12);
    const t3CremMo = Math.round(tier3Cremations / 12);
    const outDeathsMo = Math.round(outsideDeaths / 12);
    const outCremMo = Math.round(outsideCremations / 12);
    const totalDeathsMo = svcDeathsMo + t1DeathsMo + t2DeathsMo + t3DeathsMo + outDeathsMo;
    const totalCremMo = svcCremMo + t1CremMo + t2CremMo + t3CremMo + outCremMo;

    let html = `
        <div class="viewport-stat-group">
            <div class="viewport-stat service">
                <div class="stat-icon" style="background: #4CAF50;"></div>
                <div class="stat-info">
                    <span class="stat-label">In Service Area</span>
                    <span class="stat-value">${inViewServiceArea} zips</span>
                    <span class="stat-pop">${serviceAreaPopulation.toLocaleString()} pop (${servicePercent}%)</span>
                    ${svcDeathsMo > 0 ? `<span class="stat-deaths">~${svcDeathsMo.toLocaleString()} deaths/mo · ~${svcCremMo.toLocaleString()} cremations/mo</span>` : ''}
                </div>
                <button class="bucket-download-btn" onclick="downloadBucketCSV('service')" title="Download CSV" ${inViewServiceArea === 0 ? 'disabled' : ''}>
                    <i class="fas fa-download"></i>
                </button>
            </div>
            <div class="viewport-stat nearby">
                <div class="stat-icon" style="background: #64B5F6;"></div>
                <div class="stat-info">
                    <span class="stat-label">Tier 1</span>
                    <span class="stat-value">${inViewTier1} zips</span>
                    <span class="stat-pop">${tier1Population.toLocaleString()} pop (${tier1Percent}%)</span>
                    ${t1DeathsMo > 0 ? `<span class="stat-deaths">~${t1DeathsMo.toLocaleString()} deaths/mo · ~${t1CremMo.toLocaleString()} cremations/mo</span>` : ''}
                </div>
                <button class="bucket-download-btn" onclick="downloadBucketCSV('tier1')" title="Download CSV" ${inViewTier1 === 0 ? 'disabled' : ''}>
                    <i class="fas fa-download"></i>
                </button>
            </div>
            <div class="viewport-stat extended">
                <div class="stat-icon" style="background: #FFF176;"></div>
                <div class="stat-info">
                    <span class="stat-label">Tier 2</span>
                    <span class="stat-value">${inViewTier2} zips</span>
                    <span class="stat-pop">${tier2Population.toLocaleString()} pop (${tier2Percent}%)</span>
                    ${t2DeathsMo > 0 ? `<span class="stat-deaths">~${t2DeathsMo.toLocaleString()} deaths/mo · ~${t2CremMo.toLocaleString()} cremations/mo</span>` : ''}
                </div>
                <button class="bucket-download-btn" onclick="downloadBucketCSV('tier2')" title="Download CSV" ${inViewTier2 === 0 ? 'disabled' : ''}>
                    <i class="fas fa-download"></i>
                </button>
            </div>
            <div class="viewport-stat">
                <div class="stat-icon" style="background: #FF9800;"></div>
                <div class="stat-info">
                    <span class="stat-label">Tier 3</span>
                    <span class="stat-value">${inViewTier3} zips</span>
                    <span class="stat-pop">${tier3Population.toLocaleString()} pop (${tier3Percent}%)</span>
                    ${t3DeathsMo > 0 ? `<span class="stat-deaths">~${t3DeathsMo.toLocaleString()} deaths/mo · ~${t3CremMo.toLocaleString()} cremations/mo</span>` : ''}
                </div>
                <button class="bucket-download-btn" onclick="downloadBucketCSV('tier3')" title="Download CSV" ${inViewTier3 === 0 ? 'disabled' : ''}>
                    <i class="fas fa-download"></i>
                </button>
            </div>
            <div class="viewport-stat outside">
                <div class="stat-icon" style="background: #E57373;"></div>
                <div class="stat-info">
                    <span class="stat-label">Outside Range</span>
                    <span class="stat-value">${inViewOutside} zips</span>
                    <span class="stat-pop">${outsidePopulation.toLocaleString()} pop (${outsidePercent}%)</span>
                    ${outDeathsMo > 0 ? `<span class="stat-deaths">~${outDeathsMo.toLocaleString()} deaths/mo · ~${outCremMo.toLocaleString()} cremations/mo</span>` : ''}
                </div>
                <button class="bucket-download-btn" onclick="downloadBucketCSV('outside')" title="Download CSV" ${inViewOutside === 0 ? 'disabled' : ''}>
                    <i class="fas fa-download"></i>
                </button>
            </div>
        </div>
        <div class="viewport-total">
            <strong>Total in View:</strong> ${totalInView} zips · ${totalPopInView.toLocaleString()} est. population
            ${totalDeathsMo > 0 ? `<br><strong>Est. Monthly:</strong> ~${totalDeathsMo.toLocaleString()} deaths · ~${totalCremMo.toLocaleString()} cremations` : ''}
        </div>
    `;

    container.innerHTML = html;
}

// Download CSV for a specific bucket (zips in current view)
function downloadBucketCSV(bucketType) {
    if (!state.map || !state.zipCodeLayer) return;

    const bounds = state.map.getBounds();
    const rows = [];

    // Collect zips in the specified bucket that are in the current view
    state.zipCodeLayer.eachLayer(layer => {
        const zip = layer.feature.properties.ZCTA5CE10 ||
                   layer.feature.properties.zip ||
                   layer.feature.properties.GEOID10;

        // Check if zip centroid is in current view
        const center = layer.getBounds().getCenter();
        if (!bounds.contains(center)) return;

        // Check if zip belongs to this bucket
        const tier = state.tierZips.get(zip);
        let inBucket = false;
        if (bucketType === 'service' && state.serviceAreaZips.has(zip)) {
            inBucket = true;
        } else if (bucketType === 'tier1' && tier === 1) {
            inBucket = true;
        } else if (bucketType === 'tier2' && tier === 2) {
            inBucket = true;
        } else if (bucketType === 'tier3' && tier === 3) {
            inBucket = true;
        } else if (bucketType === 'outside' &&
                   !state.serviceAreaZips.has(zip) &&
                   !tier) {
            inBucket = true;
        }

        if (!inBucket) return;

        // Get city/county info
        const cityCounty = state.zipToCityCounty.get(zip);
        const city = cityCounty ? cityCounty.city : '';
        const county = cityCounty ? cityCounty.county : '';

        // Find nearest crematory and distance
        const nearest = findNearestCrematoryForZip(zip, center.lat, center.lng);
        const nearestName = nearest ? nearest.name : '';
        const nearestDistance = nearest ? nearest.distance.toFixed(1) : '';

        // Get population estimate
        const population = getEstimatedPopulation(zip);

        rows.push({
            zip,
            city,
            county,
            population,
            nearestCrematory: nearestName,
            distanceMiles: nearestDistance
        });
    });

    // Sort by zip
    rows.sort((a, b) => a.zip.localeCompare(b.zip));

    // Generate CSV
    const headers = ['Zip Code', 'City', 'County', 'Est. Population', 'Nearest Crematory', 'Distance (mi)'];
    let csv = headers.join(',') + '\n';

    rows.forEach(row => {
        csv += `${row.zip},"${row.city}","${row.county}",${row.population},"${row.nearestCrematory}",${row.distanceMiles}\n`;
    });

    // Download
    const bucketNames = {
        'service': 'service_area',
        'nearby': 'within_42_miles',
        'extended': 'within_100_miles',
        'outside': 'outside_range'
    };
    const filename = `${bucketNames[bucketType]}_zips_${new Date().toISOString().slice(0,10)}.csv`;
    downloadCSV(csv, filename);
}

// Helper to find nearest crematory for a zip
function findNearestCrematoryForZip(zip, lat, lng) {
    if (state.crematoryData.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (const crematory of state.crematoryData) {
        if (!crematory.lat || !crematory.lng) continue;

        const straightLineDistance = calculateHaversineDistance(lat, lng, crematory.lat, crematory.lng);
        const drivingDistance = straightLineDistance * CONFIG.drivingDistanceMultiplier;

        if (drivingDistance < minDistance) {
            minDistance = drivingDistance;
            nearest = {
                name: crematory.name,
                distance: drivingDistance
            };
        }
    }

    return nearest;
}

// Generic CSV download helper
function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function updateCrematoriesPanel() {
    const container = document.getElementById('crematoriesContent');

    if (state.crematoryData.length === 0) {
        container.innerHTML = '<p class="no-data">No crematories found in Excel file</p>';
        return;
    }

    let html = '';

    state.crematoryData.forEach(crem => {
        html += `
            <div class="crematory-item" data-name="${crem.name}" onclick="handleCrematoryClick('${crem.name}')">
                <div class="crematory-name">${crem.name}</div>
                <div class="crematory-address">${crem.address || 'Address not available'}</div>
                <div class="crematory-zips">${crem.assignedZips.length} zip codes assigned</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Global function for onclick handler
window.handleCrematoryClick = function(name) {
    const crematory = state.crematoryData.find(c => c.name === name);
    if (crematory) {
        highlightCrematoryZips(crematory);

        // Pan to crematory if it has coordinates
        if (crematory.lat && crematory.lng) {
            state.map.setView([crematory.lat, crematory.lng], 11);
        }
    }
};

// ============================================================================
// Search Functionality
// ============================================================================

function handleSearch(event) {
    const query = event.target.value.trim().toLowerCase();
    const resultsContainer = document.getElementById('searchResults');

    if (query.length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }

    const results = [];

    // Search by zip code
    for (const [zip, data] of state.zipCodeData) {
        if (zip.includes(query)) {
            const cityCounty = state.zipToCityCounty.get(zip);
            results.push({
                zip,
                city: cityCounty?.city || 'Unknown',
                county: cityCounty?.county || 'Unknown'
            });
        }
    }

    // Search by city name
    for (const [zip, cityCounty] of state.zipToCityCounty) {
        if (cityCounty.city.toLowerCase().includes(query)) {
            if (!results.find(r => r.zip === zip)) {
                results.push({
                    zip,
                    city: cityCounty.city,
                    county: cityCounty.county
                });
            }
        }
    }

    // Display results (limit to 10)
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="search-result-item">No results found</div>';
        return;
    }

    resultsContainer.innerHTML = results.slice(0, 10).map(r => `
        <div class="search-result-item" onclick="zoomToZip('${r.zip}')">
            <div class="zip">${r.zip}</div>
            <div class="city">${r.city}, ${r.county}</div>
        </div>
    `).join('');
}

window.zoomToZip = function(zip) {
    // Find the layer for this zip
    if (state.zipCodeLayer) {
        state.zipCodeLayer.eachLayer(layer => {
            const layerZip = layer.feature.properties.ZCTA5CE10 ||
                            layer.feature.properties.zip ||
                            layer.feature.properties.GEOID10;

            if (layerZip === zip) {
                // Zoom to the zip code
                state.map.fitBounds(layer.getBounds());

                // Highlight it
                layer.setStyle({
                    weight: 4,
                    color: CONFIG.colors.highlight,
                    fillOpacity: 0.8
                });

                // Open popup
                const centroid = layer.getBounds().getCenter();
                showZipPopup({ latlng: centroid }, zip);

                // Reset after animation
                setTimeout(() => {
                    state.zipCodeLayer.resetStyle(layer);
                }, 3000);
            }
        });
    }

    // Clear search results
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchInput').value = '';
};

// ============================================================================
// Map Controls
// ============================================================================

function toggleCountyBoundaries(event) {
    const show = event.target.checked;

    if (state.countyLayer) {
        if (show) {
            state.countyLayer.addTo(state.map);
            state.countyLayer.bringToFront();
        } else {
            state.map.removeLayer(state.countyLayer);
        }
    }
}

function toggleServiceAreaView(event) {
    const showOnlyService = event.target.checked;

    if (state.zipCodeLayer) {
        state.zipCodeLayer.eachLayer(layer => {
            const zip = layer.feature.properties.ZCTA5CE10 ||
                       layer.feature.properties.zip ||
                       layer.feature.properties.GEOID10;

            const isServiceArea = state.serviceAreaZips.has(zip);

            if (showOnlyService && !isServiceArea) {
                layer.setStyle({ fillOpacity: 0.1, opacity: 0.3 });
            } else {
                // Restore normal style
                const hasCrematory = state.crematoryZips.has(zip);
                layer.setStyle({
                    fillColor: isServiceArea ? CONFIG.colors.serviceArea : CONFIG.colors.outsideArea,
                    weight: hasCrematory ? 3 : 1,
                    opacity: 1,
                    color: hasCrematory ? CONFIG.colors.crematoryBorder : '#fff',
                    fillOpacity: isServiceArea ? 0.6 : 0.3
                });
            }
        });
    }
}

// ============================================================================
// CSV Export
// ============================================================================

function exportToCSV() {
    if (!state.isDataLoaded) return;

    const rows = [
        ['Zip Code', 'City', 'County', 'In Service Area', 'Has Crematory', 'Assigned Crematories', 'Distance (miles)', 'Est. Drive Time (min)']
    ];

    for (const [zip, data] of state.zipCodeData) {
        const cityCounty = state.zipToCityCounty.get(zip) || { city: '', county: '' };
        const isServiceArea = state.serviceAreaZips.has(zip);
        const hasCrematory = state.crematoryZips.has(zip);

        const crematories = data.crematories || [];
        const crematoryNames = crematories.map(c => c.name).join('; ');
        const distances = crematories.map(c => c.distance?.toFixed(1) || '').join('; ');
        const driveTimes = crematories.map(c => c.driveTime || '').join('; ');

        rows.push([
            zip,
            cityCounty.city,
            cityCounty.county,
            isServiceArea ? 'Yes' : 'No',
            hasCrematory ? 'Yes' : 'No',
            crematoryNames,
            distances,
            driveTimes
        ]);
    }

    // Convert to CSV string
    const csv = rows.map(row =>
        row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `service_area_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

// ============================================================================
// Utility Functions
// ============================================================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    overlay.querySelector('p').textContent = message;
    overlay.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function showError(message) {
    alert(message); // Simple alert for now, could be replaced with a toast notification
}

// ============================================================================
// Drive Time Calculation (OSRM API)
// ============================================================================

async function getDriveTime(fromLat, fromLng, toLat, toLng) {
    try {
        const url = `${CONFIG.osrmUrl}${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
        const response = await fetch(url);

        if (!response.ok) return null;

        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            return {
                duration: Math.round(data.routes[0].duration / 60), // Convert to minutes
                distance: (data.routes[0].distance / 1609.34).toFixed(1) // Convert meters to miles
            };
        }
    } catch (error) {
        console.warn('OSRM API error:', error);
    }
    return null;
}

// Note: For production, you'd want to batch these requests and cache results
// to avoid hitting rate limits on the free OSRM API

console.log('Crematory Service Area Analyzer initialized');
