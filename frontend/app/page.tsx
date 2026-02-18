'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
// [Refinement] Added turf/bbox helper or manual calculation for fitting bounds.
// Since we want to avoid new deps if possible, we will calculate bounds manually in the component.
import { getToken, logout } from '@/lib/auth';
import { fetchWithAuth } from '@/lib/api';

const MB_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

// [Refinement] Helper to calculate bounds of a GeoJSON geometry
const getGeometryBounds = (geometry: any): mapboxgl.LngLatBoundsLike | null => {
    if (geometry.type !== 'Polygon') return null;
    const coords = geometry.coordinates[0];
    const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
    for (const coord of coords) {
        bounds.extend(coord as [number, number]);
    }
    return bounds;
};

export default function MapPage() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const hoverPopup = useRef<mapboxgl.Popup | null>(null);
    const hoveredStateId = useRef<string | number | null>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const drawRef = useRef<MapboxDraw | null>(null);
    const analysisPanelRef = useRef<HTMLDivElement>(null);

    const router = useRouter();

    const [isLoaded, setIsLoaded] = useState(false);
    const [stats, setStats] = useState({ totalArea: 0, count: 0 });
    const [currentZoom, setCurrentZoom] = useState(10);

    // [Micro-interaction] Specific state for spatial data fetching to show spinner
    const [isFetchingSpatial, setIsFetchingSpatial] = useState(false);

    // [Robustness] Error handling state
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [analysisResult, setAnalysisResult] = useState<any | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // [Visual Feedback] Track if user is currently drawing
    const [isDrawingMode, setIsDrawingMode] = useState(false);

    // Panel position management
    const [initialCenter, setInitialCenter] = useState<{ x: number; y: number } | null>(null);
    const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });

    // Administrative Hierarchy State
    const [hierarchy, setHierarchy] = useState({
        region: 'Île-de-France',
        dept: '',
        commune: '',
    });
    const [communes, setCommunes] = useState<{ name: string }[]>([]);

    // [Layer Switcher] State for layer visibility
    const [layerVisibility, setLayerVisibility] = useState({
        forests: true,
        cadastre: false
    });

    /**
     * [Robustness] Optimized Spatial Fetching with Error UI
     */
    const loadVisibleForests = async () => {
        if (!map.current) return;

        // [Micro-interaction] Start loading state
        setIsFetchingSpatial(true);

        const zoom = map.current.getZoom();
        setCurrentZoom(zoom);

        if (zoom < 10.5) {
            const source = map.current.getSource('forests') as mapboxgl.GeoJSONSource;
            if (source) source.setData({ type: 'FeatureCollection', features: [] });
            setStats({ totalArea: 0, count: 0 });
            setIsFetchingSpatial(false);
            return;
        }

        const bounds = map.current.getBounds();
        if (!bounds) {
            setIsFetchingSpatial(false);
            return;
        }

        const query = `?minLng=${bounds.getWest()}&minLat=${bounds.getSouth()}&maxLng=${bounds.getEast()}&maxLat=${bounds.getNorth()}`;

        try {
            const geojsonData = await fetchWithAuth(`/forests${query}`);
            const source = map.current.getSource('forests') as mapboxgl.GeoJSONSource;
            if (source) {
                source.setData(geojsonData);
            }

            const visibleArea = geojsonData.features.reduce(
                (acc: number, f: any) => acc + (f.properties?.area || 0),
                0
            );
            setStats({ totalArea: visibleArea, count: geojsonData.features.length });
            setErrorMsg(null); // Clear previous errors on success
        } catch (error) {
            console.error('Spatial fetch failed:', error);
            // [Robustness] Show Toast on error
            setErrorMsg("Connection Lost: Unable to retrieve spatial data.");
        } finally {
            // [Micro-interaction] End loading state
            setIsFetchingSpatial(false);
        }
    };

    /**
     * [Layer Switcher] Toggle Handler
     */
    const toggleLayer = (layerId: 'forests' | 'cadastre') => {
        const newState = !layerVisibility[layerId];
        setLayerVisibility(prev => ({ ...prev, [layerId]: newState }));

        if (map.current) {
            // Map the internal ID to the Mapbox layer ID
            const mapboxLayerId = layerId === 'forests' ? 'forests-layer' : 'cadastre-layer';
            if (map.current.getLayer(mapboxLayerId)) {
                map.current.setLayoutProperty(
                    mapboxLayerId,
                    'visibility',
                    newState ? 'visible' : 'none'
                );
            }
        }
    };

    const handleDeptChange = async (deptCode: string) => {
        // [Robustness] Cleanup Draw and Forest Source Cache
        if (drawRef.current) drawRef.current.deleteAll();

        // Clear forest source explicitly to prevent ghost data while flying
        const forestSource = map.current?.getSource('forests') as mapboxgl.GeoJSONSource;
        if (forestSource) {
            forestSource.setData({ type: 'FeatureCollection', features: [] });
        }

        setAnalysisResult(null);
        setHierarchy({ ...hierarchy, dept: deptCode, commune: '' });
        setCommunes([]);

        const deptCenters: Record<string, { center: [number, number]; zoom: number }> = {
            '75': { center: [2.3522, 48.8566], zoom: 11 },
            '77': { center: [2.89, 48.6], zoom: 11 },
            '78': { center: [1.9, 48.8], zoom: 11 },
            '91': { center: [2.2, 48.5], zoom: 11 },
            '92': { center: [2.2, 48.89], zoom: 11 },
        };

        if (deptCode && deptCenters[deptCode]) {
            map.current?.flyTo({
                center: deptCenters[deptCode].center,
                zoom: deptCenters[deptCode].zoom,
                essential: true,
            });

            try {
                const data = await fetchWithAuth(`/forests/communes/${deptCode}`);
                setCommunes(data);
            } catch (err) {
                console.error('Failed to load communes:', err);
                setErrorMsg("Data Error: Unable to load administrative zones.");
            }
        }
    };

    const handleCommuneChange = async (communeName: string) => {
        setHierarchy({ ...hierarchy, commune: communeName });

        if (!communeName || !map.current) return;

        try {
            const location = await fetchWithAuth(
                `/forests/commune-location?name=${encodeURIComponent(communeName)}&dept=${hierarchy.dept}`
            );

            if (location?.lng && location?.lat) {
                map.current.flyTo({
                    center: [location.lng, location.lat],
                    zoom: 14.5,
                    pitch: 45,
                    essential: true,
                });
            } else {
                map.current.flyTo({ zoom: 14, essential: true });
            }
        } catch (error) {
            console.error('Failed to get commune location:', error);
            setErrorMsg("Navigation Error: Zone coordinates unavailable.");
        }
    };

    const handleDrawCreate = async (e: { features: any[] }) => {
        if (!e.features?.length) return;

        // [Visual Feedback] Turn off drawing mode hint
        setIsDrawingMode(false);

        const geometry = e.features[0].geometry;
        setIsAnalyzing(true);
        setAnalysisResult(null);

        // Store geometry temporarily for zoom-to-bounds feature
        const currentGeometry = geometry;

        try {
            const data = await fetchWithAuth('/forests/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geometry),
            });
            // Attach original geometry to result for navigation
            setAnalysisResult({ ...data, _geometry: currentGeometry });
        } catch (err) {
            console.error('Analysis request failed:', err);
            setErrorMsg("Computation Failed: Analysis service unreachable.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDrawDelete = () => {
        setAnalysisResult(null);
    };

    /**
     * [Visual Feedback] Zoom to Impacted Area
     */
    const handleZoomToImpact = () => {
        if (!map.current || !analysisResult?._geometry) return;
        const bounds = getGeometryBounds(analysisResult._geometry);
        if (bounds) {
            map.current.fitBounds(bounds, { padding: 100, maxZoom: 16 });
        }
    };

    // ... [Existing Panel Drag Logic] ...
    useEffect(() => {
        if (analysisResult || isAnalyzing) {
            if (!initialCenter) {
                const panelWidth = 380;
                const panelHeight = 420;
                setInitialCenter({
                    x: window.innerWidth / 2 - panelWidth / 2,
                    y: window.innerHeight / 2 - panelHeight / 2,
                });
            }
        } else {
            setPanelOffset({ x: 0, y: 0 });
            setInitialCenter(null);
        }
    }, [analysisResult, isAnalyzing, initialCenter]);

    useEffect(() => {
        const panel = analysisPanelRef.current;
        if (!panel || !initialCenter) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let currentOffsetX = panelOffset.x;
        let currentOffsetY = panelOffset.y;

        const onMouseDown = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.clickable-text')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            currentOffsetX = panelOffset.x;
            currentOffsetY = panelOffset.y;
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            setPanelOffset({ x: currentOffsetX + dx, y: currentOffsetY + dy });
        };

        const onMouseUp = () => { isDragging = false; };

        panel.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            panel.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [initialCenter]);

    // ... [Map Initialization] ...
    useEffect(() => {
        mapboxgl.accessToken = MB_TOKEN || 'pk.eyJ1Ijoic3VydGFsb2dpIiwiYSI6ImNtbHI0em8xOTA2dXczZXNnOTVxdW9ybGsifQ.m7eHhSov9zrhlYMXpH4aJg';

        const token = getToken();
        if (!token) {
            router.push('/login');
            return;
        }

        const savedView = JSON.parse(localStorage.getItem('user_view') || '{}');
        const initialCenterCoords: [number, number] = [savedView.lng || 2.3522, savedView.lat || 48.8566];
        const initialZoom = savedView.zoom || 10;

        if (map.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current!,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: initialCenterCoords,
            zoom: initialZoom,
            pitch: 45,
            bearing: -17.6,
            antialias: true,
        });

        map.current.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right');

        const draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: { polygon: true, trash: true },
            defaultMode: 'simple_select',
        });

        map.current.addControl(draw, 'right');
        drawRef.current = draw;

        // [Visual Feedback] Listen for draw mode changes
        map.current.on('draw.modechange', (e: any) => {
            if (e.mode === 'draw_polygon') {
                setIsDrawingMode(true);
            } else if (e.mode === 'simple_select') {
                setIsDrawingMode(false);
            }
        });

        hoverPopup.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'custom-tooltip',
        });

        map.current.on('load', async () => {
            // map.current?.addSource('cadastre', {
            //     type: 'vector',
            //     tiles: [
            //         'https://paca.pigma.org/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=cadastre:parcelle&STYLE=&TILEMATRIXSET=EPSG:900913&TILEMATRIX=EPSG:900913:{z}&TILEROW={y}&TILECOL={x}&FORMAT=application/vnd.mapbox-vector-tile',
            //     ],
            //     // [Layer Switcher] Removed strict minzoom logic here to allow manual toggle (source handles fetching)
            //     minzoom: 14,
            //     maxzoom: 22,
            // });
            // map.current?.addSource('cadastre', {
            //     type: 'vector',
            //     tiles: [
            //         'https://cadastre.data.gouv.fr/tuiles/cadastre/{z}/{x}/{y}.pbf'
            //         // 'https://vectortiles.cadastre.data.gouv.fr/cadastre/{z}/{x}/{y}.pbf'
            //     ],
            //     minzoom: 13,
            //     maxzoom: 20,
            //     promoteId: 'id',
            // });
            map.current?.addSource('cadastre', {
                type: 'vector',
                url: 'https://openmaptiles.geo.data.gouv.fr/data/cadastre.json'  // ← 关键！自动带正确 tiles/minzoom 等
            });

            map.current?.addLayer({
                id: 'cadastre-layer',
                type: 'line',
                source: 'cadastre',
                'source-layer': 'parcelles',
                layout: {
                    visibility: 'none'
                },
                paint: {
                    'line-color': '#06b6d4',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 1.5],
                    'line-opacity': 0.75,
                    'line-dasharray': [2, 1]
                },
                minzoom: 13
            });

            map.current?.addSource('forests', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
                generateId: true,
                buffer: 64,
                tolerance: 0.375,
            });

            map.current?.addLayer({
                id: 'forests-layer',
                type: 'fill',
                source: 'forests',
                layout: {
                    // [Layer Switcher] Initialize based on React state
                    'visibility': layerVisibility.forests ? 'visible' : 'none'
                },
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'species'],
                        'Chêne', '#5D4037',
                        'Hêtre', '#F57C00',
                        'Pin', '#00ACC1',
                        'Mélèze', '#D4E157',
                        'Sapin', '#8E24AA',
                        'Feuillus', '#1B5E20',
                        'Conifères', '#26C6DA',
                        '#94A3B8',
                    ],
                    'fill-opacity': [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        0.9,
                        0.4,
                    ],
                    'fill-outline-color': '#ffffff',
                },
            });

            await loadVisibleForests();
            setIsLoaded(true);

            // ... [Mouse Events] ...
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

                    hoverPopup.current?.setLngLat(e.lngLat).setHTML(
                        `<div class="px-3 py-1.5 bg-slate-900/90 backdrop-blur-md border border-cyan-500/50 text-cyan-400 text-[10px] font-mono tracking-tighter uppercase rounded shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                            SYSTEM_LOG: ${feature.properties?.species} detected
                        </div>`
                    ).addTo(map.current!);
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

        map.current.on('draw.create', handleDrawCreate);
        map.current.on('draw.delete', handleDrawDelete);
        map.current.on('draw.update', handleDrawCreate);

        map.current.on('moveend', async () => {
            const center = map.current?.getCenter();
            const zoom = map.current?.getZoom();

            // [Micro-interaction] Indicate data is stale/pending update
            setIsFetchingSpatial(true);

            if (center && zoom) {
                const viewState = { lat: center.lat, lng: center.lng, zoom };
                localStorage.setItem('user_view', JSON.stringify(viewState));

                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                debounceTimer.current = setTimeout(async () => {
                    try {
                        await fetchWithAuth('/auth/update-view', {
                            method: 'PATCH',
                            body: JSON.stringify(viewState),
                        });
                        await loadVisibleForests();
                    } catch (error) {
                        console.error('Debounced view update failed:', error);
                        // [Robustness] Non-critical error, maybe just log or small toast
                    }
                }, 300);
            }
        });

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            if (map.current) {
                map.current.removeControl(draw);
                map.current.off('draw.create', handleDrawCreate);
                map.current.off('draw.delete', handleDrawDelete);
                map.current.off('draw.update', handleDrawCreate);
                map.current.off('draw.modechange', () => {});
            }
            map.current?.remove();
            hoverPopup.current?.remove();
        };
    }, [router]);

    return (
        <div className="relative w-full h-screen bg-slate-950 overflow-hidden font-sans text-white">
            <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_2px,3px_100%]" />

            <style jsx global>{`
                .mapboxgl-popup-content { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
                .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip { border-top-color: transparent !important; }
                .mapboxgl-ctrl-bottom-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; margin-right: 1.5rem !important; margin-bottom: 1.5rem !important; }
                .mapboxgl-ctrl-scale { background-color: rgba(15, 23, 42, 0.6) !important; border-color: rgba(6, 182, 212, 0.5) !important; color: #94a3b8 !important; font-family: ui-monospace, monospace !important; font-size: 9px !important; }
                select option { background: #0f172a; color: #cbd5e1; }
                .mapboxgl-ctrl-group { margin-top: 280px !important; background-color: rgba(15, 23, 42, 0.8) !important; border: 1px solid rgba(6, 182, 212, 0.2) !important; backdrop-filter: blur(8px); }
                .mapbox-gl-draw_polygon, .mapbox-gl-draw_trash { filter: invert(1) hue-rotate(180deg) brightness(1.5) !important; }
                .scrollbar-thin::-webkit-scrollbar { width: 4px; }
                .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(6, 182, 212, 0.3); border-radius: 10px; }
            `}</style>

            <nav className="absolute top-0 left-0 right-0 z-20 p-6 flex justify-between items-center bg-gradient-to-b from-slate-950/80 to-transparent backdrop-blur-[2px]">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full border border-cyan-500/50 flex items-center justify-center bg-cyan-500/10 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-white font-thin tracking-[0.4em] uppercase text-sm">
                            Forest <span className="font-bold text-cyan-500">Observer</span>
                        </h1>
                        <p className="text-[8px] text-slate-500 tracking-widest uppercase">
                            Geospatial Intelligence Terminal // v2.0
                        </p>
                    </div>
                </div>

                {/* [Layer Switcher] New Control Panel next to disconnect */}
                <div className="flex items-center gap-6">
                    <div className="flex gap-2 bg-slate-900/50 border border-white/5 rounded px-3 py-1.5 backdrop-blur-sm">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={layerVisibility.forests}
                                onChange={() => toggleLayer('forests')}
                                className="appearance-none w-2.5 h-2.5 border border-slate-600 rounded-sm checked:bg-cyan-500 checked:border-cyan-500 transition-colors"
                            />
                            <span className="text-[9px] uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">Bio-Data</span>
                        </label>
                        <div className="w-[1px] bg-white/10 h-3 self-center mx-1"/>
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={layerVisibility.cadastre}
                                onChange={() => toggleLayer('cadastre')}
                                className="appearance-none w-2.5 h-2.5 border border-slate-600 rounded-sm checked:bg-cyan-500 checked:border-cyan-500 transition-colors"
                            />
                            <span className="text-[9px] uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">Cadastre</span>
                        </label>
                    </div>

                    <button
                        onClick={logout}
                        className="group flex items-center gap-2 text-[9px] text-slate-400 hover:text-white transition-all border border-white/5 hover:border-cyan-500/50 px-4 py-2 rounded bg-white/5 backdrop-blur-md"
                    >
                        <span className="tracking-widest uppercase">Disconnect</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 group-hover:bg-red-500 shadow-sm" />
                    </button>
                </div>
            </nav>

            <div ref={mapContainer} className="w-full h-full grayscale-[0.2] brightness-[0.8] contrast-[1.1]" />

            {/* [Visual Feedback] Drawing Mode Hint Overlay */}
            {isDrawingMode && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                    <div className="bg-slate-950/80 border border-cyan-500/40 px-6 py-3 rounded-full backdrop-blur-md shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                        <p className="text-cyan-400 text-xs font-mono uppercase tracking-widest animate-pulse text-center">
                            Targeting System Active<br/>
                            <span className="text-[9px] text-slate-400 normal-case tracking-normal">Click to define sector vertices</span>
                        </p>
                    </div>
                </div>
            )}

            {/* [Robustness] Error Toast Notification */}
            {errorMsg && (
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-red-950/90 border border-red-500/50 px-4 py-2 rounded shadow-lg flex items-center gap-3 backdrop-blur-md">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                        <span className="text-red-200 text-xs font-mono">{errorMsg}</span>
                        <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white ml-2">×</button>
                    </div>
                </div>
            )}

            {/* Left Hierarchy Panel */}
            <div className="absolute top-24 left-6 z-20 w-64 space-y-2">
                <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 p-4 rounded-sm shadow-2xl transition-all hover:border-cyan-500/30">
                    <label className="text-[8px] text-cyan-500 uppercase tracking-[0.2em] mb-3 block border-b border-cyan-500/20 pb-1 font-bold">
                        Navigation Hierarchy
                    </label>
                    <div className="space-y-4">
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 uppercase font-mono italic">Region</span>
                            <span className="text-xs text-slate-200 uppercase tracking-wider">{hierarchy.region}</span>
                        </div>
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

            {/* Draggable Analysis Result Panel */}
            {(isAnalyzing || analysisResult) && initialCenter && (
                <div
                    ref={analysisPanelRef}
                    className="absolute z-40 bg-slate-900/92 backdrop-blur-xl border border-cyan-500/40 rounded-lg shadow-[0_0_40px_rgba(6,182,212,0.25)] p-5 min-w-[320px] max-w-[420px] cursor-move select-none"
                    style={{
                        left: `${initialCenter.x + panelOffset.x}px`,
                        top: `${initialCenter.y + panelOffset.y}px`,
                    }}
                >
                    <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3 mb-4">
                        <h3 className="text-sm text-cyan-400 font-bold tracking-[0.15em] uppercase">Sector Intelligence</h3>
                        <div className="flex items-center gap-3">
                            {isAnalyzing && <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping" />}
                            <button
                                onClick={() => {
                                    if (drawRef.current) drawRef.current.deleteAll();
                                    setAnalysisResult(null);
                                    setPanelOffset({ x: 0, y: 0 });
                                }}
                                className="text-xs text-slate-400 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-slate-800/50"
                            >
                                CLOSE ×
                            </button>
                        </div>
                    </div>

                    {isAnalyzing ? (
                        <div className="text-center py-6 text-sm text-slate-400 font-mono tracking-wide">
                            COMPUTING GEOMETRIC INTERSECTIONS...
                        </div>
                    ) : (
                        <div className="space-y-5 text-sm">
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Selected Zone Area</p>
                                <p className="text-2xl font-mono text-white">
                                    {analysisResult?.totalAnalysisArea?.toFixed(2) ?? '—'}
                                    <span className="text-base text-slate-500 ml-2">Ha</span>
                                </p>
                            </div>

                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Vegetation Composition</p>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
                                    {analysisResult?.species?.map((s: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center py-1">
                                            <span className="text-slate-200">{s.name}</span>
                                            <span className="font-mono text-cyan-400">{s.area.toFixed(2)} Ha</span>
                                        </div>
                                    ))}
                                    {(!analysisResult?.species || analysisResult.species.length === 0) && (
                                        <p className="text-sm text-red-400/80 italic text-center py-4">
                                            No forest data detected in this sector.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-white/5 pt-3">
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Impacted Administrative Zones</p>
                                {/* [Visual Feedback] Added Click Handler to Zoom to Bounds */}
                                <p
                                    onClick={handleZoomToImpact}
                                    className="text-slate-300 leading-relaxed text-[13px] clickable-text cursor-pointer hover:text-cyan-400 hover:underline decoration-dashed underline-offset-4 transition-colors"
                                    title="Click to focus map on this sector"
                                >
                                    {analysisResult?.communes?.join(' • ') || 'None'} <span className="text-[9px] text-cyan-600 align-super">↗</span>
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Metrics Dashboard */}
            <div className="absolute top-24 right-6 z-10 w-56 space-y-4">
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 p-4 rounded-sm shadow-2xl">
                    <p className="text-[8px] text-slate-500 uppercase tracking-tighter mb-1">Total Monitored Area</p>
                    {/* [Micro-interaction] Opacity pulse during data fetch/debounce */}
                    <h3 className={`text-xl text-cyan-400 font-mono tracking-tighter transition-opacity duration-300 ${isFetchingSpatial ? 'opacity-50' : 'opacity-100'}`}>
                        {stats.totalArea.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <span className="text-[10px] text-slate-500 uppercase font-sans ml-1">Ha</span>
                    </h3>
                    <div className="w-full h-[1px] bg-gradient-to-r from-cyan-500/50 to-transparent mt-2" />
                </div>

                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 p-4 rounded-sm shadow-2xl">
                    <div className="flex justify-between items-center mb-1">
                        <p className="text-[8px] text-slate-500 uppercase tracking-tighter">Localized Clusters</p>
                        {/* [Micro-interaction] Loading spinner for spatial fetch */}
                        {isFetchingSpatial && <div className="w-2 h-2 border border-cyan-500 border-t-transparent rounded-full animate-spin"/>}
                    </div>
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
                <h4 className="text-[9px] text-slate-400 uppercase tracking-[0.2em] mb-4 font-bold border-l-2 border-cyan-500 pl-2">
                    Vegetation Index
                </h4>
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
                            <div
                                className="w-2.5 h-2.5 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.1)] transition-all group-hover:scale-150 group-hover:shadow-[0_0_10px_inherit]"
                                style={{ backgroundColor: item.color }}
                            />
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
                        Initialising Neural Link...
                        <br />
                        <span className="text-[8px] opacity-50 tracking-normal normal-case">Establishing secure Docker bridge</span>
                    </span>
                </div>
            )}
        </div>
    );
}