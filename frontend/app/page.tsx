'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getToken, logout } from '@/lib/auth';
import { fetchWithAuth } from '@/lib/api';

const MB_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export default function MapPage() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const hoverPopup = useRef<mapboxgl.Popup | null>(null);
    const hoveredStateId = useRef<string | number | null>(null);
    const router = useRouter();
    const [isLoaded, setIsLoaded] = useState(false);
    const [stats, setStats] = useState({ totalArea: 0, count: 0 }); // New state for metrics

    useEffect(() => {
        mapboxgl.accessToken = MB_TOKEN || 'pk.eyJ1Ijoic3VydGFsb2dpIiwiYSI6ImNtbHI0em8xOTA2dXczZXNnOTVxdW9ybGsifQ.m7eHhSov9zrhlYMXpH4aJg';
        const token = getToken();
        if (!token) {
            router.push('/login');
            return;
        }

        const savedView = JSON.parse(localStorage.getItem('user_view') || '{}');
        const initialCenter: [number, number] = [savedView.lng || 2.3522, savedView.lat || 48.8566];
        const initialZoom = savedView.zoom || 10;

        if (map.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current!,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: initialCenter,
            zoom: initialZoom,
            pitch: 45, // Noble 3D perspective
            bearing: -17.6,
        });

        hoverPopup.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'custom-tooltip'
        });

        map.current.on('load', async () => {
            setIsLoaded(true);
            const geojsonData = await fetchWithAuth('/forests');

            // Calculate initial stats
            const totalArea = geojsonData.features.reduce((acc: number, f: any) => acc + f.properties.area, 0);
            setStats({ totalArea, count: geojsonData.features.length });

            map.current?.addSource('forests', {
                type: 'geojson',
                data: geojsonData,
                generateId: true
            });

            map.current?.addLayer({
                id: 'forests-layer',
                type: 'fill',
                source: 'forests',
                paint: {
                    'fill-color': [
                        'match', ['get', 'species'],
                        'Chêne', '#5D4037', 'Hêtre', '#F57C00', 'Pin', '#00ACC1',
                        'Mélèze', '#D4E157', 'Sapin', '#8E24AA', 'Feuillus', '#1B5E20',
                        'Conifères', '#26C6DA', '#94A3B8'
                    ],
                    'fill-opacity': [
                        'case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.4
                    ],
                    'fill-outline-color': '#ffffff'
                }
            });

            // Interactive logic (Click & Hover) maintained as per previous stable version
            map.current?.on('mouseenter', 'forests-layer', () => { map.current!.getCanvas().style.cursor = 'pointer'; });
            map.current?.on('mousemove', 'forests-layer', (e) => {
                if (e.features && e.features.length > 0) {
                    const feature = e.features[0];
                    if (hoveredStateId.current !== null) {
                        map.current?.setFeatureState({ source: 'forests', id: hoveredStateId.current }, { hover: false });
                    }
                    hoveredStateId.current = feature.id as string | number;
                    map.current?.setFeatureState({ source: 'forests', id: hoveredStateId.current }, { hover: true });

                    hoverPopup.current?.setLngLat(e.lngLat)
                        .setHTML(`<div class="px-3 py-1.5 bg-slate-900/90 backdrop-blur-md border border-cyan-500/50 text-cyan-400 text-[10px] font-mono tracking-tighter uppercase rounded shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                            SYSTEM_LOG: ${feature.properties?.species} detected
                        </div>`)
                        .addTo(map.current!);
                }
            });

            map.current?.on('mouseleave', 'forests-layer', () => {
                map.current!.getCanvas().style.cursor = '';
                if (hoveredStateId.current !== null) {
                    map.current?.setFeatureState({ source: 'forests', id: hoveredStateId.current }, { hover: false });
                }
                hoveredStateId.current = null;
                hoverPopup.current?.remove();
            });
        });

        map.current.on('moveend', async () => {
            const center = map.current?.getCenter();
            const zoom = map.current?.getZoom();
            if (center && zoom) {
                const viewState = { lat: center.lat, lng: center.lng, zoom: zoom };
                try {
                    await fetchWithAuth('/auth/update-view', { method: 'PATCH', body: JSON.stringify(viewState) });
                    localStorage.setItem('user_view', JSON.stringify(viewState));
                } catch (error) { console.error('Sync failed:', error); }
            }
        });

        return () => { map.current?.remove(); hoverPopup.current?.remove(); };
    }, [router]);

    return (
        <div className="relative w-full h-screen bg-slate-950 overflow-hidden font-sans">
            {/* Overlay: CRT Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_2px,3px_100%]"></div>

            <style jsx global>{`
                .mapboxgl-popup-content { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
                .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: transparent !important; }
                .mapboxgl-ctrl-bottom-right { opacity: 0.2; transform: scale(0.8); transition: opacity 0.3s; }
                .mapboxgl-ctrl-bottom-right:hover { opacity: 1; }
            `}</style>

            {/* Noble Nav Bar */}
            <nav className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-center bg-gradient-to-b from-slate-950/80 to-transparent backdrop-blur-[2px]">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full border border-cyan-500/50 flex items-center justify-center bg-cyan-500/10 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-white font-thin tracking-[0.4em] uppercase text-sm">Forest <span className="font-bold text-cyan-500">Observer</span></h1>
                        <p className="text-[8px] text-slate-500 tracking-widest uppercase">Geospatial Intelligence Terminal // v2.0</p>
                    </div>
                </div>
                <button onClick={logout} className="group flex items-center gap-2 text-[9px] text-slate-400 hover:text-white transition-all border border-white/5 hover:border-cyan-500/50 px-4 py-2 rounded bg-white/5 backdrop-blur-md">
                    <span className="tracking-widest uppercase">Disconnect Terminal</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 group-hover:bg-red-500 shadow-sm" />
                </button>
            </nav>

            {/* Map container */}
            <div ref={mapContainer} className="w-full h-full grayscale-[0.2] brightness-[0.8] contrast-[1.1]" />

            {/* Stats Overlay: Right Side */}
            <div className="absolute top-24 right-6 z-10 w-48 space-y-4">
                {/*<div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 p-4 rounded-sm shadow-2xl">*/}
                {/*    <p className="text-[8px] text-slate-500 uppercase tracking-tighter mb-1">Total Monitored Area</p>*/}
                {/*    <h3 className="text-xl text-cyan-400 font-mono tracking-tighter">{stats.totalArea.toLocaleString()} <span className="text-[10px] text-slate-500 uppercase font-sans">Ha</span></h3>*/}
                {/*    <div className="w-full h-[1px] bg-gradient-to-r from-cyan-500/50 to-transparent mt-2" />*/}
                {/*</div>*/}
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 p-4 rounded-sm shadow-2xl">
                    <p className="text-[8px] text-slate-500 uppercase tracking-tighter mb-1">Active Clusters</p>
                    <h3 className="text-xl text-slate-200 font-mono tracking-tighter">{stats.count} <span className="text-[10px] text-slate-500 uppercase font-sans">Units</span></h3>
                </div>
            </div>

            {/* Legend Section (Refined) */}
            <div className="absolute bottom-10 left-6 z-10 bg-slate-900/60 backdrop-blur-2xl border border-white/10 p-5 rounded-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-[200px]">
                <h4 className="text-[9px] text-slate-400 uppercase tracking-[0.2em] mb-4 font-bold border-l-2 border-cyan-500 pl-2">Vegetation Index</h4>
                <div className="space-y-2.5">
                    {[
                        { fr: 'Chêne', en: 'Oak', color: '#5D4037' },
                        { fr: 'Hêtre', en: 'Beech', color: '#F57C00' },
                        { fr: 'Pin', en: 'Pine', color: '#00ACC1' },
                        { fr: 'Mélèze', en: 'Larch', color: '#D4E157' },
                        { fr: 'Sapin', en: 'Fir', color: '#8E24AA' },
                        { fr: 'Feuillus', en: 'Broad-leaved', color: '#1B5E20' },
                        { fr: 'Conifères', en: 'Coniferous', color: '#26C6DA' },
                    ].map((item) => (
                        <div key={item.fr} className="flex items-center gap-3 group cursor-help">
                            <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.1)] transition-all group-hover:scale-150 group-hover:shadow-[0_0_10px_inherit]" style={{ backgroundColor: item.color }} />
                            <div className="flex flex-col opacity-70 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] text-slate-200 font-medium tracking-tight uppercase">{item.fr}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {!isLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-50">
                    <div className="w-12 h-12 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
                    <span className="text-cyan-500 animate-pulse font-mono text-[10px] tracking-[0.5em] uppercase">Initialising Neural Link...</span>
                </div>
            )}
        </div>
    );
}