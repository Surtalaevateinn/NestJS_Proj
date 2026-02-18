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
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const router = useRouter();

    const [isLoaded, setIsLoaded] = useState(false);
    const [stats, setStats] = useState({ totalArea: 0, count: 0 });
    const [currentZoom, setCurrentZoom] = useState(10);

    // Administrative Hierarchy State
    const [hierarchy, setHierarchy] = useState({
        region: 'Île-de-France',
        dept: '',
        commune: ''
    });
    const [communes, setCommunes] = useState<{name: string}[]>([]);

    /**
     * Optimized Spatial Fetching with Guard Clauses
     */
    const loadVisibleForests = async () => {
        if (!map.current) return;
        const zoom = map.current.getZoom();
        setCurrentZoom(zoom);

        if (zoom < 10.5) {
            const source = map.current.getSource('forests') as mapboxgl.GeoJSONSource;
            if (source) source.setData({ type: 'FeatureCollection', features: [] });
            setStats({ totalArea: 0, count: 0 });
            return;
        }

        const bounds = map.current.getBounds();
        if (!bounds) return;

        const query = `?minLng=${bounds.getWest()}&minLat=${bounds.getSouth()}&maxLng=${bounds.getEast()}&maxLat=${bounds.getNorth()}`;

        try {
            const geojsonData = await fetchWithAuth(`/forests${query}`);
            const source = map.current.getSource('forests') as mapboxgl.GeoJSONSource;
            if (source) {
                source.setData(geojsonData);
            }

            const visibleArea = geojsonData.features.reduce((acc: number, f: any) => acc + (f.properties.area || 0), 0);
            setStats({ totalArea: visibleArea, count: geojsonData.features.length });
        } catch (error) {
            console.error('Spatial fetch failed:', error);
        }
    };

    /**
     * [cite_start]Navigation Handler for Departments [cite: 17]
     */
    const handleDeptChange = async (deptCode: string) => {
        setHierarchy({ ...hierarchy, dept: deptCode, commune: '' });
        setCommunes([]); // Reset list during transition

        // Coordinates for Île-de-France Departments
        const deptCenters: Record<string, { center: [number, number], zoom: number }> = {
            '75': { center: [2.3522, 48.8566], zoom: 11 },
            '77': { center: [2.89, 48.6], zoom: 11 },
            '78': { center: [1.9, 48.8], zoom: 11 },
            '91': { center: [2.2, 48.5], zoom: 11 },
            '92': { center: [2.2, 48.89], zoom: 11 }
        };

        if (deptCode && deptCenters[deptCode]) {
            map.current?.flyTo({
                center: deptCenters[deptCode].center,
                zoom: deptCenters[deptCode].zoom,
                essential: true
            });

            // Fetch dynamic commune/zone list from the repaired backend
            try {
                const data = await fetchWithAuth(`/forests/communes/${deptCode}`);
                setCommunes(data);
            } catch (err) {
                console.error('Failed to load zones:', err);
            }
        }
    };

    /**
     * Navigation Handler for Specific Zones [cite: 17, 18]
     */
    const handleCommuneChange = async (communeName: string) => {
        setHierarchy({ ...hierarchy, commune: communeName });

        if (!communeName || !map.current) return;

        try {
            // Request the backend to obtain the center coordinates of the region.
            const location = await fetchWithAuth(
                `/forests/commune-location?name=${encodeURIComponent(communeName)}&dept=${hierarchy.dept}`
            );

            if (location && location.lng && location.lat) {
                map.current.flyTo({
                    center: [location.lng, location.lat],
                    zoom: 14.5,
                    pitch: 45,
                    essential: true
                });
            } else {
                // If the coordinates are not found, perform in-place zoom.
                map.current.flyTo({ zoom: 14, essential: true });
            }
        } catch (error) {
            console.error('Failed to get zone location:', error);
        }
    };

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
            pitch: 45,
            bearing: -17.6,
            antialias: true
        });

        map.current.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right');

        hoverPopup.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'custom-tooltip'
        });

        map.current.on('load', async () => {
            map.current?.addSource('cadastre', {
                type: 'vector',
                tiles: ['https://paca.pigma.org/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=cadastre:parcelle&STYLE=&TILEMATRIXSET=EPSG:900913&TILEMATRIX=EPSG:900913:{z}&TILEROW={y}&TILECOL={x}&FORMAT=application/vnd.mapbox-vector-tile'],
                minzoom: 15,
                maxzoom: 22
            });

            map.current?.addLayer({
                id: 'cadastre-layer',
                type: 'line',
                source: 'cadastre',
                'source-layer': 'parcelle',
                paint: {
                    'line-color': '#06b6d4',
                    'line-width': 0.5,
                    'line-opacity': 0.6
                }
            });

            map.current?.addSource('forests', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
                generateId: true,
                buffer: 64,
                tolerance: 0.375
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

            await loadVisibleForests();
            setIsLoaded(true);

            map.current?.on('mouseenter', 'forests-layer', () => {
                map.current!.getCanvas().style.cursor = 'pointer';
            });

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
                localStorage.setItem('user_view', JSON.stringify(viewState));

                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                debounceTimer.current = setTimeout(async () => {
                    try {
                        await fetchWithAuth('/auth/update-view', { method: 'PATCH', body: JSON.stringify(viewState) });
                        await loadVisibleForests();
                    } catch (error) {
                        console.error('Debounced update failed:', error);
                    }
                }, 300);
            }
        });

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            map.current?.remove();
            hoverPopup.current?.remove();
        };
    }, [router]);

    return (
        <div className="relative w-full h-screen bg-slate-950 overflow-hidden font-sans text-white">
            {/* CRT Effect Overlay */}
            <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_2px,3px_100%]"></div>

            <style jsx global>{`
                .mapboxgl-popup-content { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
                .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: transparent !important; }
                .mapboxgl-ctrl-bottom-right {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 8px;
                    margin-right: 1.5rem !important;
                    margin-bottom: 1.5rem !important;
                }
                .mapboxgl-ctrl-scale {
                    background-color: rgba(15, 23, 42, 0.6) !important;
                    border-color: rgba(6, 182, 212, 0.5) !important;
                    color: #94a3b8 !important;
                    font-family: ui-monospace, monospace !important;
                    font-size: 9px !important;
                }
                select option { background: #0f172a; color: #cbd5e1; }
            `}</style>

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

            {/* Map Container */}
            <div ref={mapContainer} className="w-full h-full grayscale-[0.2] brightness-[0.8] contrast-[1.1]" />

            [cite_start]{/* Administrative Hierarchy Panel [cite: 17] */}
            <div className="absolute top-24 left-6 z-20 w-64 space-y-2">
                <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 p-4 rounded-sm shadow-2xl transition-all hover:border-cyan-500/30">
                    <label className="text-[8px] text-cyan-500 uppercase tracking-[0.2em] mb-3 block border-b border-cyan-500/20 pb-1 font-bold">Navigation Hierarchy</label>
                    <div className="space-y-4">
                        {/* Region */}
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 uppercase font-mono italic">Region</span>
                            <span className="text-xs text-slate-200 uppercase tracking-wider">{hierarchy.region}</span>
                        </div>

                        {/* Department Selector */}
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] text-slate-500 uppercase font-mono italic">Department</span>
                            <select
                                value={hierarchy.dept}
                                onChange={(e) => handleDeptChange(e.target.value)}
                                className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] p-2 rounded focus:border-cyan-500 outline-none uppercase tracking-tighter transition-all hover:bg-slate-900 cursor-pointer shadow-inner"
                            >
                                <option value="">Select Department</option>
                                <option value="75">75 - Paris</option>
                                <option value="77">77 - Seine-et-Marne</option>
                                <option value="78">78 - Yvelines</option>
                                <option value="91">91 - Essonne</option>
                                <option value="92">92 - Hauts-de-Seine</option>
                            </select>
                        </div>

                        {/* Commune / Zone Selector */}
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] text-slate-500 uppercase font-mono italic">Commune / Zone</span>
                            <select
                                value={hierarchy.commune}
                                disabled={!hierarchy.dept || communes.length === 0}
                                onChange={(e) => handleCommuneChange(e.target.value)}
                                className="bg-slate-950 border border-slate-800 text-slate-300 text-[10px] p-2 rounded focus:border-cyan-500 outline-none uppercase tracking-tighter disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-slate-900 cursor-pointer shadow-inner"
                            >
                                <option value="">{communes.length > 0 ? 'Select Zone' : 'Dynamic Resolution...'}</option>
                                {communes.map((c, idx) => (
                                    <option key={idx} value={c.name}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="absolute top-24 right-6 z-10 w-56 space-y-4">
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 p-4 rounded-sm shadow-2xl">
                    <p className="text-[8px] text-slate-500 uppercase tracking-tighter mb-1">Total Monitored Area</p>
                    <h3 className="text-xl text-cyan-400 font-mono tracking-tighter">
                        {stats.totalArea.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="text-[10px] text-slate-500 uppercase font-sans ml-1">Ha</span>
                    </h3>
                    <div className="w-full h-[1px] bg-gradient-to-r from-cyan-500/50 to-transparent mt-2" />
                </div>
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 p-4 rounded-sm shadow-2xl">
                    <p className="text-[8px] text-slate-500 uppercase tracking-tighter mb-1">Localized Clusters</p>
                    <h3 className="text-xl text-slate-200 font-mono tracking-tighter">
                        {stats.count}
                        <span className="text-[10px] text-slate-500 uppercase font-sans ml-1">Units</span>
                    </h3>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-sm border border-white/5 px-4 py-2 rounded-sm shadow-xl flex justify-between items-center">
                    <span className="text-[8px] text-slate-500 uppercase tracking-widest font-mono">Zoom_Lvl</span>
                    <span className="text-xs text-cyan-500 font-mono">{currentZoom.toFixed(2)}</span>
                </div>
            </div>

            {/* Vegetation Legend */}
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
                        <div key={item.fr} className="flex items-center gap-3 group cursor-help text-white">
                            <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.1)] transition-all group-hover:scale-150 group-hover:shadow-[0_0_10px_inherit]" style={{ backgroundColor: item.color }} />
                            <div className="flex flex-col opacity-70 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] text-slate-200 font-medium tracking-tight uppercase">{item.fr}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Loader */}
            {!isLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-50">
                    <div className="w-12 h-12 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-4" />
                    <span className="text-cyan-500 animate-pulse font-mono text-[10px] tracking-[0.5em] uppercase text-center">
                        Initialising Neural Link...<br/>
                        <span className="text-[8px] opacity-50 tracking-normal normal-case">Establishing secure Docker bridge</span>
                    </span>
                </div>
            )}
        </div>
    );
}