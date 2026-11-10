export class MapService {
  static async calculateRouteDistance(startLat, startLng, endLat, endLng) {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=false`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`OSRM merespons HTTP ${response.status}`);
      const data = await response.json();
      if (!data.routes?.length) throw new Error("Rute tidak ditemukan");
      const route = data.routes[0];
      return { distanceKm: +(route.distance / 1000).toFixed(2), durationMinutes: Math.ceil(route.duration / 60), source: "OSRM" };
    } catch (error) {
      console.warn("OSRM tidak dapat diakses; estimasi Haversine digunakan.", error);
      const distanceKm = this.calculateHaversineDistance(startLat, startLng, endLat, endLng);
      return { distanceKm, durationMinutes: Math.ceil(distanceKm * 3), source: "Haversine" };
    }
  }

  constructor(containerId, defaultCenter = [3.0, 99.6], defaultZoom = 13) {
    if (!window.L) throw new Error("Leaflet belum tersedia. Muat ulang halaman saat koneksi internet aktif.");
    this.map = L.map(containerId).setView(defaultCenter, defaultZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors"
    }).addTo(this.map);
    this.pickupMarker = null;
    this.dropoffMarker = null;
    this.routePolyline = null;
    this.locationHandler = null;
  }

  setLocationHandler(handler) {
    this.locationHandler = handler;
    this.map.on("click", event => handler(event.latlng));
  }

  centerOn(lat, lng, zoom = 15) {
    this.map.setView([lat, lng], zoom);
  }

  setPickupLocation(lat, lng, label = "Titik Jemput") {
    if (this.pickupMarker) this.map.removeLayer(this.pickupMarker);
    this.pickupMarker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
    this.pickupMarker.bindPopup(`<b>${label}</b>`).openPopup();
    this.pickupMarker.on("dragend", event => this.locationHandler?.(event.target.getLatLng(), "pickup"));
    return this.pickupMarker;
  }

  clearPickupLocation() {
    if (this.pickupMarker) this.map.removeLayer(this.pickupMarker);
    this.pickupMarker = null;
    this.clearRoute();
  }

  setDropoffLocation(lat, lng, label = "Titik Antar") {
    if (this.dropoffMarker) this.map.removeLayer(this.dropoffMarker);
    this.dropoffMarker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
    this.dropoffMarker.bindPopup(`<b>${label}</b>`).openPopup();
    this.dropoffMarker.on("dragend", event => this.locationHandler?.(event.target.getLatLng(), "dropoff"));
    return this.dropoffMarker;
  }

  clearDropoffLocation() {
    if (this.dropoffMarker) this.map.removeLayer(this.dropoffMarker);
    this.dropoffMarker = null;
    this.clearRoute();
  }

  clearRoute() {
    if (this.routePolyline) this.map.removeLayer(this.routePolyline);
    this.routePolyline = null;
  }

  async calculateRealRoute(startLat, startLng, endLat, endLng, isCurrent = () => true) {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    this.clearRoute();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`OSRM merespons HTTP ${response.status}`);
      const data = await response.json();
      if (!data.routes?.length) throw new Error("Rute tidak ditemukan");
      if (!isCurrent()) return null;
      const route = data.routes[0];
      const distanceKm = +(route.distance / 1000).toFixed(2);
      const coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      if (this.routePolyline) this.map.removeLayer(this.routePolyline);
      this.routePolyline = L.polyline(coordinates, { color: "#2fa79e", weight: 5, opacity: 0.8 }).addTo(this.map);
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [40, 40] });
      return { distanceKm, durationMinutes: Math.ceil(route.duration / 60), source: "OSRM" };
    } catch (error) {
      if (!isCurrent()) return null;
      console.warn("OSRM tidak dapat diakses; estimasi jarak garis lurus digunakan.", error);
      const distanceKm = this.calculateHaversineDistance(startLat, startLng, endLat, endLng);
      this.routePolyline = L.polyline([[startLat, startLng], [endLat, endLng]], {
        color: "#2fa79e", weight: 5, opacity: 0.65, dashArray: "7 8"
      }).addTo(this.map);
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [40, 40] });
      return { distanceKm, durationMinutes: Math.ceil(distanceKm * 3), source: "Haversine" };
    }
  }

  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    return MapService.calculateHaversineDistance(lat1, lon1, lat2, lon2);
  }

  static calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const radians = value => value * Math.PI / 180;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
    return +(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2);
  }

  destroy() {
    this.map.remove();
  }
}
