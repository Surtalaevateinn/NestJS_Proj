'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getToken, logout } from '@/lib/auth';
import { fetchWithAuth } from '@/lib/api';

// Inject the token configured in docker-compose
const MB_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export default function MapPage() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const router = useRouter();
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        mapboxgl.accessToken = MB_TOKEN || 'pk.eyJ1Ijoic3VydGFsb2dpIiwiYSI6ImNtbHI0em8xOTA2dXczZXNnOTVxdW9ybGsifQ.m7eHhSov9zrhlYMXpH4aJg';
        const token = getToken();
        if (!token) {
            router.push('/login');
            return;
        }

        // 1. Get the initial view stored during login.
        const savedView = JSON.parse(localStorage.getItem('user_view') || '{}');
        const initialCenter: [number, number] = [savedView.lng || 2.3522, savedView.lat || 48.8566];
        const initialZoom = savedView.zoom || 10;

        if (map.current) return; // Prevent duplicate initialization

        // 2. Initialize map
        map.current = new mapboxgl.Map({
            container: mapContainer.current!,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: initialCenter,
            zoom: initialZoom,
        });

        map.current.on('load', async () => {
            setIsLoaded(true);

            // 3. Retrieve 358 GeoJSON data entries from the backend.
            const geojsonData = await fetchWithAuth('/forests');

            // 4. Add forest data as a source.
            map.current?.addSource('forests', {
                type: 'geojson',
                data: geojsonData
            });

            // 5. Rendering layers
            map.current?.addLayer({
                id: 'forests-layer',
                type: 'fill',
                source: 'forests',
                paint: {
                    'fill-color': '#10b981',
                    'fill-opacity': 0.5,
                    'fill-outline-color': '#fff'
                }
            });

            // 6. Add a pop-up message upon clicking [cite: 17, 18]
            map.current?.on('click', 'forests-layer', (e) => {
                const props = e.features?.[0].properties;
                if (props) {
                    new mapboxgl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(`
                            <div class="text-slate-900 p-2">
                                <h3 class="font-bold border-b mb-1">${props.species}</h3>
                                <p class="text-xs text-slate-600">Area: ${props.area.toFixed(2)} Ha</p>
                                <p class="text-[10px] text-slate-400">ID: ${props.ign_id}</p>
                            </div>
                        `)
                        .addTo(map.current!);
                }
            });
        });

        // 7. Listen for the move to complete and prepare to save the state (Requirement 24) [cite: 24]
        // map.current.on('moveend', () => {
        //     const center = map.current?.getCenter();
        //     const zoom = map.current?.getZoom();
        //     console.log('New State to save:', center, zoom);
        // });
        map.current.on('moveend', async () => {
            const center = map.current?.getCenter();
            const zoom = map.current?.getZoom();

            if (center && zoom) {
                const viewState = {
                    lat: center.lat,
                    lng: center.lng,
                    zoom: zoom
                };

                // Real-time synchronization to the backend database
                try {
                    await fetchWithAuth('/auth/update-view', {
                        method: 'PATCH',
                        body: JSON.stringify(viewState)
                    });

                    // Synchronize and update local storage
                    localStorage.setItem('user_view', JSON.stringify(viewState));
                } catch (error) {
                    console.error('Failed to sync map state:', error);
                }
            }
        });

        return () => map.current?.remove();
    }, [router]);

    return (
        <div className="relative w-full h-screen bg-slate-950">
            {/* Top bar control */}
            <nav className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-center bg-slate-950/40 backdrop-blur-sm border-b border-white/10">
                <h1 className="text-white font-extralight tracking-[0.2em] uppercase text-sm">
                    Forest <span className="text-cyan-500 font-medium">Observer</span>
                </h1>
                <button
                    onClick={logout}
                    className="text-[10px] text-slate-400 hover:text-white transition-colors border border-slate-700 px-3 py-1 rounded uppercase tracking-tighter"
                >
                    Disconnect
                </button>
            </nav>

            {/* Map container */}
            <div ref={mapContainer} className="w-full h-full" />

            {/* Loading status indicator */}
            {!isLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-20">
                    <span className="text-cyan-500 animate-pulse font-mono text-xs tracking-widest uppercase">
                        Establishing Satellite Link...
                    </span>
                </div>
            )}
        </div>
    );
}