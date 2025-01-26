// global variables with clear purposes
let map;                    // Main map instance
let userLocationMarker;     // Current user location marker
let userLocationCircle;     // Accuracy circle around user location
let buildingsLayer;         // GeoJSON layer for university buildings
let routeLayer;             // Layer for displaying navigation routes
let selectedBuilding;       // Currently selected building
let buildingsList = [];     // List of buildings for search functionality
let markers = [];           // Array to store route markers
let startPoint;             // Starting point for route calculation

// map with clean interface and street view
function initializeMap() {
    console.log('Initializing map...');
    
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([51.9607, 7.6257], 14);

    // Add map layers and controls
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft' }).addTo(map);

    // Set up click handler for route creation
    map.on('click', handleMapClick);

    console.log('Map initialized successfully');
}

// map clicks for routing
async function handleMapClick(e) {
    const clickedPoint = e.latlng;

    if (!userLocationMarker) {
        updateStatus('Please enable location first');
        return;
    }

    const startPoint = userLocationMarker.getLatLng();
    clearRoute();

    // Adding markers
    const startMarker = L.marker(startPoint).addTo(map);
    const endMarker = L.marker(clickedPoint).addTo(map);
    markers.push(startMarker, endMarker);

    // Calculating route
    const mode = document.getElementById('travelMode').value;
    routeLayer = await calculateRoute(startPoint, clickedPoint, mode);

    if (routeLayer) {
        routeLayer.addTo(map);
        updateStatus('Route calculated');
    }
}

// Load and display building data
async function loadBuildingData() {
    try {
        console.log('Loading building data...');
        const response = await fetch('/buildings');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        console.log('Building data received');

        // Storing building data for search
        buildingsList = data.features.map(feature => ({
            name: feature.properties.name || 'Unnamed Feature',
            geometry: feature.geometry,
            properties: feature.properties
        }));

        displayFilteredFeatures('all'); 
        populateSidebar(); 
        console.log('Buildings layer added to map');
    } catch (error) {
        console.error('Error loading buildings:', error);
        updateStatus('Failed to load buildings');
    }
}

function getMarkerIcon(feature) {
    if (feature.properties.amenity) {
        return L.icon({
            iconUrl: '/static/icons/amenity.png',
            iconSize: [50, 50],
        });
    } else if (feature.properties.tourism) {
        return L.icon({
            iconUrl: '/static/icons/tourism.png',
            iconSize: [45, 45],
        });
    } else if (feature.properties.university) {
        return L.icon({
            iconUrl: '/static/icons/university.png',
            iconSize: [25, 25],
        });
    } else {
        return L.icon({
            iconUrl: '/static/icons/default.png',
            iconSize: [25, 25],
        });
    }
}

function displayFilteredFeatures(filterType) {
    if (buildingsLayer) {
        map.removeLayer(buildingsLayer);
    }

    // Filter features based on selected type
    const filteredFeatures = buildingsList.filter(feature => {
        if (filterType === 'all') {
            return true;
        } else if (filterType === 'amenity') {
            const amenityTypes = ['restaurant', 'bar', 'cafe', 'fast_food', 'food_court', 'ice_cream'];
            return amenityTypes.includes(feature.properties.amenity);
        } else if (filterType === 'tourism') {
            return feature.properties.tourism != null;
        } else if (filterType === 'university') {
            return feature.properties.university != null;
        }
        return false;
    });

    buildingsLayer = L.geoJSON({ features: filteredFeatures.map(f => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: f.properties
    })) }, {
        pointToLayer: (feature, latlng) => {
            return L.marker(latlng, { icon: getMarkerIcon(feature) });
        },
        onEachFeature: (feature, layer) => {
            const popupContent = `
                <div class="feature-popup" style="font-family: Arial, sans-serif; color: #333;">
                    <h3 style="margin-top: 0; color: #2c3e50;">${feature.properties.name || 'Unnamed Feature'}</h3>
                    ${feature.properties.amenity ? `<p><strong>Type:</strong> ${feature.properties.amenity}</p>` : ''}
                    ${feature.properties.tourism ? `<p><strong>Tourism:</strong> ${feature.properties.tourism}</p>` : ''}
                    ${feature.properties['addr:street'] ? `<p><strong>Address:</strong> ${feature.properties['addr:street']}</p>` : ''}
                    ${feature.properties['addr:postcode'] ? `<p><strong>Postcode:</strong> ${feature.properties['addr:postcode']}</p>` : ''}
                    ${feature.properties['description'] ? `<p><strong>Description:</strong> ${feature.properties['description']}</p>` : ''}
                    ${feature.properties['building'] ? `<p><strong>Building:</strong> ${feature.properties['building']}</p>` : ''}
                    ${feature.properties['wheelchair'] ? `<p><strong>Wheelchair Access:</strong> ${feature.properties['wheelchair']}</p>` : ''}
                    ${feature.properties['opening_hours'] ? `<p><strong>Opening Hours:</strong> ${feature.properties['opening_hours']}</p>` : ''}
                    ${feature.properties['cuisine'] ? `<p><strong>Cuisine:</strong> ${feature.properties['cuisine']}</p>` : ''}
                    <button style="background-color: #3498db; color: white; border: none; padding: 10px 15px; cursor: pointer; border-radius: 5px; margin-top: 10px;" onclick="routeToBuilding('${feature.properties.name}')">
                        Route to this destination
                    </button>
                </div>
            `;
            layer.bindPopup(popupContent);
        }
    }).addTo(map);

    updateStatus(`${filteredFeatures.length} features displayed`);
}

// Populating the sidebar with university names
function populateSidebar() {
    const universityList = document.getElementById('universityList');
    universityList.innerHTML = '';

    buildingsList.forEach(building => {
        if (building.properties.university) {
            const listItem = document.createElement('li');
            listItem.textContent = building.name;
            listItem.onclick = () => {
                const coords = building.geometry.coordinates;
                let latlng;
                if (building.geometry.type === 'Polygon') {
                    latlng = getPolygonCentroid(coords[0]);
                } else if (building.geometry.type === 'Point') {
                    latlng = [coords[1], coords[0]];
                } else {
                    console.error('Unsupported geometry type for building:', building);
                    updateStatus('Unsupported geometry type for selected building');
                    return;
                }
                map.setView(latlng, 17);
                L.popup()
                    .setLatLng(latlng)
                    .setContent(`<h3>${building.name}</h3>`)
                    .openOn(map);
            };
            universityList.appendChild(listItem);
        }
    });
}

// Function to calculate the centroid of a polygon
function getPolygonCentroid(coords) {
    let centroid = coords.reduce((acc, coord) => {
        return {
            lat: acc.lat + coord[1],
            lng: acc.lng + coord[0]
        };
    }, { lat: 0, lng: 0 });

    centroid.lat /= coords.length;
    centroid.lng /= coords.length;

    return [centroid.lat, centroid.lng];
}

// Calculating route between points
async function calculateRoute(start, end, mode) {
    try {
        const response = await fetch('/get_route', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start: {
                    lat: start.lat,
                    lng: start.lng
                },
                end: {
                    lat: end.lat,
                    lng: end.lng
                },
                mode: mode
            })
        });

        if (!response.ok) throw new Error('Route calculation failed');

        const data = await response.json();
        return L.geoJSON(data, {
            style: {
                color: '#3498db',
                weight: 8,
                opacity: 1.0
            }
        });
    } catch (error) {
        console.error('Error calculating route:', error);
        updateStatus('Failed to calculate route');
        return null;
    }
}

// Routing to selected building from current location
async function routeToBuilding(buildingName) {
    if (!userLocationMarker) {
        updateStatus('Please enable location first');
        return;
    }

    const building = buildingsList.find(b => b.name === buildingName);

    if (building && building.geometry && building.geometry.coordinates) {
        clearRoute();

        let targetCoordinates;
        if (building.geometry.type === 'Point') {
            // Using coordinates directly for Point geometry
            targetCoordinates = {
                lat: building.geometry.coordinates[1],
                lng: building.geometry.coordinates[0]
            };
        } else if (building.geometry.type === 'Polygon') {
            // Calculating the centroid for Polygon
            const coords = building.geometry.coordinates[0]; // Outer boundary
            let centroid = coords.reduce((acc, coord) => {
                return {
                    lat: acc.lat + coord[1],
                    lng: acc.lng + coord[0]
                };
            }, { lat: 0, lng: 0 });

            centroid.lat /= coords.length;
            centroid.lng /= coords.length;

            targetCoordinates = centroid;
        } else {
            updateStatus('Unsupported geometry type');
            return;
        }

        // Adding markers
        const startMarker = L.marker(userLocationMarker.getLatLng()).addTo(map);
        markers.push(startMarker);

        // Calculating route
        const mode = document.getElementById('travelMode').value;
        routeLayer = await calculateRoute(
            userLocationMarker.getLatLng(),
            targetCoordinates,
            mode
        );

        if (routeLayer) {
            routeLayer.addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
        }
    } else {
        updateStatus('Building not found or invalid geometry');
    }
}

// Clearing existing route and markers
function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    startPoint = null;
}

// location tracking
function setupLocationTracking() {
    map.on('locationfound', function(e) {
        const radius = e.accuracy / 2;
        
        if (userLocationMarker) {
            userLocationMarker.setLatLng(e.latlng);
            userLocationCircle.setLatLng(e.latlng);
            userLocationCircle.setRadius(radius);
        } else {
            userLocationMarker = L.marker(e.latlng).addTo(map);
            userLocationCircle = L.circle(e.latlng, {
                radius: radius,
                color: '#4299e1',
                fillColor: '#4299e1',
                fillOpacity: 0.15
            }).addTo(map);
        }
        
        updateStatus('Location found');
    });

    map.on('locationerror', function(e) {
        console.error('Location error:', e);
        updateStatus('Could not find location');
    });
}

// Add dropdown listener for filtering
function addFilterListener() {
    document.getElementById('featureFilter').addEventListener('change', function() {
        const selectedFilter = this.value;
        displayFilteredFeatures(selectedFilter);
    });
}

document.getElementById('travelMode').addEventListener('change', async function () {
    if (routeLayer && markers.length >= 2) {
        const startPoint = markers[0].getLatLng(); // Starting marker
        const endPoint = markers[1].getLatLng(); // Ending marker
        const mode = this.value;

        // Clear the existing route
        clearRoute();

        // Recalculate and display the new route
        routeLayer = await calculateRoute(startPoint, endPoint, mode);

        if (routeLayer) {
            routeLayer.addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
            updateStatus('Route updated for new travel mode');
        } else {
            updateStatus('Failed to update route for new travel mode');
        }
    }
});

function setupLocationTracking() {
    map.on('locationfound', function (e) {
        const radius = e.accuracy / 2;

        if (userLocationMarker) {
            userLocationMarker.setLatLng(e.latlng);
            userLocationCircle.setLatLng(e.latlng);
            userLocationCircle.setRadius(radius);
        } else {
            userLocationMarker = L.marker(e.latlng).addTo(map);
            userLocationCircle = L.circle(e.latlng, {
                radius: radius,
                color: '#4299e1',
                fillColor: '#4299e1',
                fillOpacity: 0.15
            }).addTo(map);
        }

        updateStatus('Location found');
    });

    map.on('locationerror', function (e) {
        console.error('Location error:', e.message);
        updateStatus('Could not find location');
    });
}

function startLocationTracking() {
    map.locate({ setView: true, maxZoom: 16 });
}

function updateStatus(message) {
    const status = document.getElementById('statusText');
    if (status) {
        status.textContent = message;
    } else {
        console.warn('Status element not found');
    }
}

// Initialize map and features
document.addEventListener('DOMContentLoaded', async function () {
    try {
        initializeMap();
        setupLocationTracking(); // This ensures location tracking is initialized
        startLocationTracking(); // Optional: Auto-start tracking if required
        await loadBuildingData(); // Load building data into the map
        addFilterListener(); // Add dropdown filter functionality

        document.getElementById('locateMe').addEventListener('click', function () {
            if (userLocationMarker) {
                map.setView(userLocationMarker.getLatLng(), 17);
            } else {
                startLocationTracking();
            }
        });

        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
        updateStatus('Error initializing application');
    }
});