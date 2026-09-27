@props([
    'points' => [],
    'home' => null,
    'path' => false,
    'height' => '20rem',
])

{{--
    A Leaflet map with OpenStreetMap tiles (§6). Leaflet comes from a CDN and
    is fetched only when a map is on the page.
    points: list of {lat, lng, event, label}; home: {lat, lng, radius} or null.
--}}
<div
    wire:ignore
    {{ $attributes->style('isolation: isolate; overflow: hidden; border-radius: 0.5rem; border: 1px solid var(--gray-200)') }}
    x-data="{
        points: @js($points),
        home: @js($home),
        path: @js($path),
        async init() {
            window.asterLeaflet ??= new Promise((resolve, reject) => {
                const css = document.createElement('link');
                css.rel = 'stylesheet';
                css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
                css.crossOrigin = '';
                document.head.append(css);

                const js = document.createElement('script');
                js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
                js.crossOrigin = '';
                js.onload = () => resolve(window.L);
                js.onerror = reject;
                document.head.append(js);
            });

            const L = await window.asterLeaflet;
            const map = L.map(this.$refs.map, { scrollWheelZoom: false });

            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href=\'https://www.openstreetmap.org/copyright\'>OpenStreetMap</a> contributors',
            }).addTo(map);

            let bounds = null;

            if (this.home) {
                L.circle([this.home.lat, this.home.lng], { radius: this.home.radius, color: '#0d9488', weight: 2 }).addTo(map);
                bounds = L.latLng(this.home.lat, this.home.lng).toBounds(this.home.radius * 3);
            }

            if (this.path && this.points.length > 1) {
                L.polyline(this.points.map((p) => [p.lat, p.lng]), { color: '#2563eb', weight: 3, opacity: 0.7 }).addTo(map);
            }

            const colors = { arrived: '#16a34a', left: '#dc2626' };

            for (const p of this.points) {
                const marked = p.event in colors;

                L.circleMarker([p.lat, p.lng], {
                    radius: marked ? 8 : 4,
                    color: colors[p.event] ?? '#2563eb',
                    weight: 2,
                    fillOpacity: marked ? 0.9 : 0.6,
                }).bindTooltip(p.label).addTo(map);

                bounds = bounds ? bounds.extend([p.lat, p.lng]) : L.latLngBounds([[p.lat, p.lng]]);
            }

            if (bounds) {
                map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
            }

            // A map drawn inside a hidden tab has no size until the tab opens.
            new ResizeObserver(() => map.invalidateSize()).observe(this.$refs.map);
        },
    }"
>
    <div x-ref="map" style="height: {{ $height }}"></div>
</div>
