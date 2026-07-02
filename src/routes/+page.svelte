<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Sidebar from '$lib/components/sidebar.svelte';
	import Settings from '$lib/components/settings.svelte';
	import {
		fetchLaps,
		fetchTelemetry,
		fetchStatus,
		fetchBoundaries,
		fetchConfig,
		type Lap,
		type Telemetry,
		type TrackBoundaries,
	} from '$lib/api.js';
	import {
		downsample,
		chartWindowFor,
		LAP_COLORS,
		type Trace,
		type DownsampledTrace,
		type ChartWindow,
	} from '$lib/canvas/shared.js';
	import { drawThrottle } from '$lib/canvas/throttle.js';
	import { drawThrottleSingle } from '$lib/canvas/throttle.js';
	import { drawBrake } from '$lib/canvas/brake.js';
	import { drawSteering, drawSteeringSingle } from '$lib/canvas/steering.js';
	import { drawMap, fitMap, smoothBoundary } from '$lib/canvas/map.js';
	import { drawDelta, deltaRangeFor } from '$lib/canvas/delta.js';
	import { parseLapTime, formatTime, gameLabel, gameShort } from '$lib/utils/format.js';
	import acLogo from '$lib/assets/icons/Assetto_Corsa_Symbol.svg';
	import accLogo from '$lib/assets/icons/ACClogo.png';

	interface SessionData {
		laps:      Lap[];
		fastestId: string | null;
		minTime:   number;
	}
	type GroupedLaps = Record<string, Record<string, Record<string, Record<string, SessionData>>>>;

	interface CompLap {
		lap:     Lap;
		trace:   Trace;
		ds:      DownsampledTrace;
		color:   string;
		lapTime: number;
	}

	const ZOOM_STEP = 0.1;
	const ZOOM_MIN  = 0.5;
	const ZOOM_MAX  = 2;
	const LERP      = 0.14;
	const SPEEDS    = [0.25, 0.5, 1, 2, 4];
	const EMPTY_TRACE: Trace = { gas: [], brake: [], steer: [], normPos: [], worldX: [], worldZ: [], time: [] };

	const GAME_LOGOS: Record<string, string> = {
		AC:  acLogo,
		ACC: accLogo,
	};

	// UI state
	let appZoom       = $state(1);
	let traceZoom     = $state(2);
	let sidebarOpen   = $state(true);
	let showSettings  = $state(false);
	let gamePaths     = $state<Record<string, string>>({ AC: '', ACC: '', iRacing: '', LMU: '' });
	let gameConnected = $state(false);
	let connectedGame = $state<string | null>(null);

	// data
	let databaseLaps = $state<Lap[]>([]);
	let selectedLap  = $state<Lap | null>(null);
	let activeGame   = $state<string | null>(null);
	let gameMenuOpen = $state(false);
	let compLaps     = $state<CompLap[]>([]);

	// current lap
	let currentTrace    = $state.raw<Trace>(EMPTY_TRACE);
	let dsTrace         = $state<DownsampledTrace | null>(null);
	let boundaries      = $state<TrackBoundaries | null>(null);
	let chartWindow = $state<ChartWindow>({ windowSize: 0, step: 1 });
	let resolvedLapTime = $state(0);

	// playback
	let isPlaying     = $state(false);
	let playbackSpeed = $state(1);
	let speedMenuOpen = $state(false);
	let currentTime = $state(0);
	let playbackIdx = $state(0);
	let exactIdx    = 0;
	let rafId       = 0;

	// canvases
	let mapCanvas   = $state<HTMLCanvasElement | null>(null);
	let traceCanvas = $state<HTMLCanvasElement | null>(null);
	let brakeCanvas = $state<HTMLCanvasElement | null>(null);
	let steerCanvas = $state<HTMLCanvasElement | null>(null);
	let canvasW     = $state(0);
	let canvasH     = $state(0);
	let compTraceCanvases = $state<(HTMLCanvasElement | null)[]>([]);
	let compSteerCanvases = $state<(HTMLCanvasElement | null)[]>([]);
	let deltaCanvas       = $state<HTMLCanvasElement | null>(null);
	let deltaRange = $derived.by(() => {
		if (!dsTrace || compLaps.length === 0) return 0.5;
		return deltaRangeFor(dsTrace, compLaps[0].ds);
	});

	// map pan / zoom
	let mapScale   = $state(1);
	let fitScale   = $state(1);
	let mapOffsetX = $state(0);
	let mapOffsetY = $state(0);
	let isPanning  = $state(false);
	let targetScale   = 1;
	let targetOffsetX = 0;
	let targetOffsetY = 0;
	let smoothRafId   = -1;
	let smoothRunning = false;
	let panStart      = { x: 0, y: 0, ox: 0, oy: 0 };
	let mapFitted     = false;

	let viewWindow = $derived.by<ChartWindow>(() => {
		const base = chartWindow.windowSize;
		if (!base) return chartWindow;
		const zoom = fitScale > 0 ? mapScale / fitScale : 1;
		const clamped = Math.min(8, Math.max(0.25, zoom));
		return { windowSize: Math.max(20, Math.round(base * traceZoom / clamped)), step: chartWindow.step };
	});

	const groupedLaps = $derived.by<GroupedLaps>(() => {
		const result: GroupedLaps = {};
		for (const lap of databaseLaps) {
			const game  = lap.game  || 'ACC';
			const track = lap.track || 'Unknown Track';
			const car   = lap.car   || 'Unknown Car';
			let dateStr = 'Unknown Date';
			if (lap.date_time) {
				const raw = lap.date_time.split('_')[0];
				dateStr   = new Date(raw).toLocaleDateString('en-US', {
					month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
				});
			}
			result[game]                         ??= {};
			result[game][track]                  ??= {};
			result[game][track][car]             ??= {};
			result[game][track][car][dateStr]    ??= { laps: [], fastestId: null, minTime: Infinity };

			const session = result[game][track][car][dateStr];
			session.laps.push(lap);
			const t = parseLapTime(lap.lap_time || lap.time || '');
			if (t > 0 && t < session.minTime) {
				session.minTime   = t;
				session.fastestId = lap.uuid;
			}
		}
		return result;
	});

	const allLaps = $derived.by(() => {
		const t = currentTrace.time[playbackIdx] ?? 0;
		return [
			{
				lapTime:   selectedLap ? (selectedLap.lap_time || selectedLap.time || '') : '',
				car:       selectedLap?.car ?? '',
				color:     LAP_COLORS[0] as string,
				ds:        dsTrace,
				trace:     currentTrace,
				rawIdx:    playbackIdx,
				isPrimary: true,
			},
			...compLaps.map(comp => {
				const ci = comp.trace.time.findIndex(pt => pt >= t);
				return {
					lapTime:   comp.lap.lap_time || comp.lap.time || '',
					car:       comp.lap.car,
					color:     comp.color,
					ds:        comp.ds,
					trace:     comp.trace,
					rawIdx:    ci === -1 ? comp.trace.time.length - 1 : ci,
					isPrimary: false,
				};
			}),
		];
	});

	function redrawAll(idx: number) {
		drawThrottle(traceCanvas, dsTrace, currentTrace, idx, viewWindow, compLaps);
		drawBrake(brakeCanvas, dsTrace, currentTrace, idx, viewWindow, compLaps);
		drawSteering(steerCanvas, dsTrace, currentTrace, idx, viewWindow, compLaps);
		if (compLaps.length > 0) {
			drawDelta(deltaCanvas, dsTrace, compLaps[0].ds, currentTrace, idx, viewWindow, deltaRange);
			redrawComparison(idx);
		}
	}

	function redrawComparison(idx: number) {
		const pNorm = currentTrace.normPos[idx] ?? 0;
		drawThrottleSingle(compTraceCanvases[0] ?? null, dsTrace, currentTrace, idx, viewWindow);
		drawSteeringSingle(compSteerCanvases[0] ?? null, dsTrace, currentTrace, idx, viewWindow, 'primary');
		for (let ci = 0; ci < compLaps.length; ci++) {
			const comp    = compLaps[ci];
			const rawIdx  = comp.trace.normPos.findIndex(p => p >= pNorm);
			const compIdx = rawIdx === -1 ? comp.trace.normPos.length - 1 : rawIdx;
			drawThrottleSingle(compTraceCanvases[ci + 1] ?? null, comp.ds, comp.trace, compIdx, viewWindow);
			drawSteeringSingle(compSteerCanvases[ci + 1] ?? null, comp.ds, comp.trace, compIdx, viewWindow, comp.color);
		}
	}

	$effect(() => {
		if (!mapCanvas || canvasW === 0 || canvasH === 0 || !currentTrace.worldX.length) return;
		if (!mapFitted) {
			const fit = fitMap(currentTrace, canvasW, canvasH);
			if (fit) {
				targetScale   = fit.scale;
				fitScale      = fit.scale;
				targetOffsetX = fit.offsetX;
				targetOffsetY = fit.offsetY;
				mapScale      = fit.scale * 0.4;
				mapOffsetX    = canvasW / 2;
				mapOffsetY    = canvasH / 2;
				mapFitted     = true;
				nudgeSmooth();
			}
		}
		drawMap(mapCanvas, canvasW, canvasH, currentTrace, dsTrace, mapScale, mapOffsetX, mapOffsetY, playbackIdx, boundaries, compLaps);
	});

	$effect(() => {
		if (compLaps.length === 0 || !dsTrace) return;
		Promise.resolve().then(() => {
			redrawComparison(playbackIdx);
			drawDelta(deltaCanvas, dsTrace, compLaps[0].ds, currentTrace, playbackIdx, viewWindow, deltaRange);
		});
	});

	$effect(() => {
		const w = viewWindow;
		if (!dsTrace || !w.windowSize) return;
		untrack(() => redrawAll(playbackIdx));
	});

	function smoothTick() {
		const dx = targetOffsetX - mapOffsetX;
		const dy = targetOffsetY - mapOffsetY;
		const ds = targetScale   - mapScale;
		if (Math.abs(dx) < 0.04 && Math.abs(dy) < 0.04 && Math.abs(ds) < 0.00008) {
			mapOffsetX    = targetOffsetX;
			mapOffsetY    = targetOffsetY;
			mapScale      = targetScale;
			smoothRunning = false;
			return;
		}
		mapOffsetX += dx * LERP;
		mapOffsetY += dy * LERP;
		mapScale   += ds * LERP;
		smoothRafId = requestAnimationFrame(smoothTick);
	}

	function nudgeSmooth() {
		if (!smoothRunning) {
			smoothRunning = true;
			smoothRafId   = requestAnimationFrame(smoothTick);
		}
	}

	function seek(t: number) {
		const clamped = Math.max(0, Math.min(resolvedLapTime, t));
		let idx = currentTrace.time.findIndex(pt => pt >= clamped);
		if (idx === -1) idx = currentTrace.time.length - 1;
		playbackIdx = Math.max(0, idx);
		exactIdx    = playbackIdx;
		currentTime = currentTrace.time[playbackIdx] ?? 0;
		redrawAll(playbackIdx);
	}

	function startPlayback() {
		if (isPlaying) stopPlayback();
		if (!currentTrace.gas.length || resolvedLapTime <= 0) return;
		isPlaying = true;
		exactIdx  = playbackIdx;
		const total = currentTrace.gas.length;
		const pps   = total / resolvedLapTime;
		let last: number | null = null;

		function tick(ts: number) {
			if (!isPlaying) return;
			if (last === null) { last = ts; rafId = requestAnimationFrame(tick); return; }
			const dt = Math.min((ts - last) / 1000, 0.1);
			last     = ts;
			exactIdx = Math.min(exactIdx + pps * dt * playbackSpeed, total - 1);
			if (exactIdx >= total - 1) {
				exactIdx    = total - 1;
				playbackIdx = total - 1;
				currentTime = currentTrace.time[total - 1] ?? resolvedLapTime;
				redrawAll(playbackIdx);
				stopPlayback();
				return;
			}
			playbackIdx = Math.floor(exactIdx);
			currentTime = currentTrace.time[playbackIdx] ?? 0;
			redrawAll(playbackIdx);
			rafId = requestAnimationFrame(tick);
		}
		rafId = requestAnimationFrame(tick);
	}

	function stopPlayback() {
		cancelAnimationFrame(rafId);
		isPlaying = false;
	}

	function togglePlayback() {
		isPlaying ? stopPlayback() : startPlayback();
	}

	function makeTrace(data: Telemetry): Trace {
		return {
			gas:     data.gas                   ?? [],
			brake:   data.brake                 ?? [],
			steer:   data.steering              ?? [],
			normPos: data.normalizedCarPosition ?? [],
			worldX:  data.worldX                ?? [],
			worldZ:  data.worldZ                ?? [],
			time:    data.time                  ?? [],
		};
	}

	async function selectLap(lap: Lap) {
		stopPlayback();
		selectedLap = lap;
		const lapTimeSec = parseLapTime(lap.lap_time || lap.time || '');
		const data       = await fetchTelemetry(lap.uuid);
		currentTrace     = makeTrace(data);
		mapFitted        = false;
		resolvedLapTime  = lapTimeSec;
		playbackIdx      = 0;
		exactIdx         = 0;
		currentTime      = 0;
		dsTrace          = downsample(currentTrace, lapTimeSec);
		if (dsTrace) chartWindow = chartWindowFor(dsTrace, lapTimeSec);
		const fetched = await fetchBoundaries(lap.game || 'ACC', lap.track, lap.uuid);
		boundaries = fetched ? { inner: smoothBoundary(fetched.inner), outer: smoothBoundary(fetched.outer) } : null;
		redrawAll(0);
		if (currentTrace.normPos.length > 0) startPlayback();
	}

	async function addCompLap(lap: Lap) {
		if (compLaps.length >= 2) return;
		if (compLaps.some(c => c.lap.uuid === lap.uuid)) return;
		if (selectedLap?.uuid === lap.uuid) return;
		const data       = await fetchTelemetry(lap.uuid);
		const trace      = makeTrace(data);
		const lapTimeSec = parseLapTime(lap.lap_time || lap.time || '');
		const ds         = downsample(trace, lapTimeSec);
		if (!ds) return;
		const color = LAP_COLORS[compLaps.length + 1];
		compLaps    = [...compLaps, { lap, trace, ds, color, lapTime: lapTimeSec }];
		redrawAll(playbackIdx);
	}

	function removeCompLap(uuid: string) {
		compLaps = compLaps.filter(c => c.lap.uuid !== uuid);
		redrawAll(playbackIdx);
	}

	function onMapWheel(e: WheelEvent) {
		e.preventDefault();
		const rect    = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const mouseX  = e.clientX - rect.left;
		const mouseY  = e.clientY - rect.top;
		const delta   = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
		const factor  = Math.pow(0.999, delta);
		const newScale = Math.max(0.2, Math.min(targetScale * factor, 80));
		targetOffsetX  = mouseX - (mouseX - targetOffsetX) * (newScale / targetScale);
		targetOffsetY  = mouseY - (mouseY - targetOffsetY) * (newScale / targetScale);
		targetScale    = newScale;
		nudgeSmooth();
	}

	function onMapPointerDown(e: PointerEvent) {
		isPanning = true;
		panStart  = { x: e.clientX, y: e.clientY, ox: targetOffsetX, oy: targetOffsetY };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onMapPointerMove(e: PointerEvent) {
		if (!isPanning) return;
		targetOffsetX = panStart.ox + (e.clientX - panStart.x);
		targetOffsetY = panStart.oy + (e.clientY - panStart.y);
		mapOffsetX    = targetOffsetX;
		mapOffsetY    = targetOffsetY;
	}

	function onMapPointerUp(e: PointerEvent) {
		isPanning = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function adjustZoom(delta: number) {
		appZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((appZoom + delta) * 10) / 10));
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!e.ctrlKey && !e.metaKey) return;
		if (e.key === '=' || e.key === '+') { e.preventDefault(); adjustZoom(ZOOM_STEP); }
		else if (e.key === '-')             { e.preventDefault(); adjustZoom(-ZOOM_STEP); }
		else if (e.key === '0')             { e.preventDefault(); appZoom = 1; }
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);

		let pollId:   ReturnType<typeof setInterval>;
		let statusId: ReturnType<typeof setInterval>;

		async function pollLaps(): Promise<boolean> {
			try {
				databaseLaps = await fetchLaps();
				return true;
			} catch {
				return false;
			}
		}

		async function pollStatus() {
			try {
				const s = await fetchStatus();
				gameConnected = s.connected;
				connectedGame = s.game;
			} catch {
				gameConnected = false;
				connectedGame = null;
			}
		}

		async function loadConfig() {
			try {
				const cfg = await fetchConfig();
				gamePaths = cfg.games ?? gamePaths;
			} catch {}
		}

		async function initData() {
			let retries = 15;
			while (retries > 0) {
				if (await pollLaps()) break;
				await new Promise<void>(resolve => setTimeout(resolve, 1000));
				retries--;
			}
			const splash = document.getElementById('app-splash');
			const reveal = () => {
				if (!splash) return;
				splash.classList.add('hide');
				setTimeout(() => splash.remove(), 650);
			};
			const MIN_SPLASH = 4000;
			const elapsed = performance.now();
			elapsed < MIN_SPLASH ? setTimeout(reveal, MIN_SPLASH - elapsed) : reveal();
			pollId = setInterval(pollLaps, 3000);
		}

		loadConfig();
		initData();
		pollStatus();
		statusId = setInterval(pollStatus, 2000);

		return () => {
			window.removeEventListener('keydown', handleKeydown);
			clearInterval(pollId);
			clearInterval(statusId);
			cancelAnimationFrame(rafId);
			cancelAnimationFrame(smoothRafId);
		};
	});
</script>

<div
	class="app"
	style="transform: scale({appZoom}); transform-origin: 0 0; width: {100 / appZoom}%; height: {100 / appZoom}vh;"
>
	<Sidebar
		{groupedLaps}
		bind:activeGame
		{selectedLap}
		compLapIds={compLaps.map(c => c.lap.uuid)}
		canAddComp={compLaps.length < 2}
		collapsed={!sidebarOpen}
		onSelectLap={selectLap}
		onAddComp={addCompLap}
		onRemoveComp={removeCompLap}
		onToggle={() => sidebarOpen = !sidebarOpen}
	/>

	<div class="main">
		{#if showSettings}
			<Settings bind:gamePaths bind:appZoom bind:traceZoom onClose={() => { showSettings = false; if (dsTrace) redrawAll(playbackIdx); }} />
		{/if}

		<header class="topbar">
			<div class="topbar-left">
				{#if selectedLap}
					<div class="lap-chip primary">
						<span class="dot"></span>
						<span class="chip-car">{selectedLap.car}</span>
						<span class="chip-time">{selectedLap.lap_time || selectedLap.time}</span>
					</div>
				{/if}
				{#each compLaps as comp}
					<div class="lap-chip">
						<span class="dot" style="background:{comp.color}"></span>
						<span class="chip-time" style="color:{comp.color}">{comp.lap.lap_time || comp.lap.time}</span>
						<button class="chip-remove" onclick={() => removeCompLap(comp.lap.uuid)} aria-label="Remove comparison lap">
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M4 4l8 8M12 4l-8 8"/>
							</svg>
						</button>
					</div>
				{/each}
			</div>

			<div class="topbar-right">
				<div class="game-select">
					<button
						class="game-btn"
						class:open={gameMenuOpen}
						disabled={Object.keys(groupedLaps).length === 0}
						onclick={() => gameMenuOpen = !gameMenuOpen}
						title="Select game"
					>
						{#if activeGame}
							{#if GAME_LOGOS[activeGame]}
								<span class="game-logo"><img src={GAME_LOGOS[activeGame]} alt={gameLabel(activeGame)} /></span>
							{:else}
								<span class="game-text">{gameShort(activeGame)}</span>
							{/if}
						{:else}
							<span class="game-empty">No data</span>
						{/if}
						<svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M4 6l4 4 4-4"/>
						</svg>
					</button>
					{#if gameMenuOpen}
						<button class="game-backdrop" aria-label="Close game menu" onclick={() => gameMenuOpen = false}></button>
						<div class="game-menu">
							{#each Object.keys(groupedLaps) as g}
								<button
									class="game-option"
									class:active={activeGame === g}
									onclick={() => { activeGame = g; gameMenuOpen = false; }}
								>
									{#if GAME_LOGOS[g]}
										<span class="game-logo"><img src={GAME_LOGOS[g]} alt={gameLabel(g)} /></span>
									{:else}
										<span class="game-text">{gameShort(g)}</span>
									{/if}
									<span>{gameLabel(g)}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="sep"></div>

				<div class="status-pill" class:connected={gameConnected} title={gameConnected ? `Connected to ${connectedGame ?? 'sim'}` : 'No game detected'}>
					<span class="status-dot"></span>
					<span>{gameConnected ? (connectedGame ?? 'Connected') : 'No game'}</span>
				</div>

				<div class="sep"></div>

				<button
					class="settings-btn"
					class:active={showSettings}
					onclick={() => showSettings = !showSettings}
				>
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="8" cy="8" r="2.5"/>
						<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"/>
					</svg>
					{showSettings ? 'Close' : 'Settings'}
				</button>
			</div>
		</header>

		<div class="workspace">
			<div
				class="map-area"
				bind:clientWidth={canvasW}
				bind:clientHeight={canvasH}
				role="application"
				aria-label="Track map — scroll to zoom, drag to pan"
				style="cursor:{isPanning ? 'grabbing' : 'grab'}"
				onwheel={onMapWheel}
				onpointerdown={onMapPointerDown}
				onpointermove={onMapPointerMove}
				onpointerup={onMapPointerUp}
			>
				{#if currentTrace.worldX.length > 0}
					<canvas bind:this={mapCanvas} class="fill-canvas"></canvas>
					<div class="map-legend" class:lifted={speedMenuOpen}>
						{#if selectedLap}
							<div class="legend-chip">
								<span class="dot primary-dot"></span>
								<span>{selectedLap.car}</span>
								<span class="legend-time">{selectedLap.lap_time || selectedLap.time}</span>
							</div>
						{/if}
						{#each compLaps as comp}
							<div class="legend-chip">
								<span class="dot" style="background:{comp.color}"></span>
								<span style="color:{comp.color}">{comp.lap.car}</span>
								<span class="legend-time" style="color:{comp.color}">{comp.lap.lap_time || comp.lap.time}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="map-empty">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
							<circle cx="12" cy="12" r="9"/>
							<path d="M12 7v5l3 3"/>
						</svg>
						<span>Select a lap to begin</span>
					</div>
				{/if}
			</div>

			<div class="panel">
				{#if !selectedLap}
					<div class="panel-empty">No lap selected</div>
				{:else}
					<div class="panel-scroll">
						<div class="chart-card">
							<div class="chart-label">
								<span class="chart-dot" style="background:#10b981"></span>
								Throttle
							</div>
							<canvas bind:this={traceCanvas} class="chart-canvas"></canvas>
						</div>

						<div class="chart-card">
							<div class="chart-label">
								<span class="chart-dot" style="background:#ef4444"></span>
								Brake
							</div>
							<canvas bind:this={brakeCanvas} class="chart-canvas"></canvas>
						</div>

						<div class="chart-card">
							<div class="chart-label">
								<span class="chart-dot" style="background:#8b5cf6"></span>
								Steering
							</div>
							<canvas bind:this={steerCanvas} class="chart-canvas"></canvas>
						</div>

						{#if compLaps.length > 0}
							<div class="chart-card">
								<div class="chart-label">
									<span class="chart-dot" style="background:#e5e7eb"></span>
									Delta — vs {compLaps[0].lap.lap_time || compLaps[0].lap.time || 'reference'}
								</div>
								<canvas bind:this={deltaCanvas} class="chart-canvas"></canvas>
							</div>

							<div class="chart-card">
								<div class="chart-label">Comparison — Throttle &amp; Brake</div>
								<div class="comp-grid" style="grid-template-columns: repeat({allLaps.length}, 1fr);">
									{#each allLaps as entry, i}
										<div class="comp-col">
											<div class="comp-col-header">
												<span class="dot" style="background:{entry.color}"></span>
												<span style="color:{entry.color}">{entry.lapTime}</span>
											</div>
											<canvas bind:this={compTraceCanvases[i]} class="comp-canvas"></canvas>
										</div>
									{/each}
								</div>
							</div>

							<div class="chart-card">
								<div class="chart-label">Comparison — Steering</div>
								<div class="comp-grid" style="grid-template-columns: repeat({allLaps.length}, 1fr);">
									{#each allLaps as _, i}
										<div class="comp-col">
											<canvas bind:this={compSteerCanvases[i]} class="comp-canvas steer"></canvas>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<div class="playbar">
			<div class="playbar-controls">
				<button class="pb-btn" onclick={() => seek(currentTime - 1)} aria-label="Step back 1 second">
					<svg viewBox="0 0 16 16" fill="currentColor">
						<path d="M3 3h2v10H3zM6 8L13 3v10z"/>
					</svg>
				</button>
				<button class="pb-play" onclick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'}>
					{#if isPlaying}
						<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 3h3v10H4zM9 3h3v10H9z"/></svg>
					{:else}
						<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l9 5-9 5z"/></svg>
					{/if}
				</button>
				<button class="pb-btn" onclick={() => seek(currentTime + 1)} aria-label="Step forward 1 second">
					<svg viewBox="0 0 16 16" fill="currentColor">
						<path d="M11 3h2v10h-2zM3 3l7 5-7 5z"/>
					</svg>
				</button>
			</div>

			<div class="pb-speed">
					<button class="pb-speed-btn" class:open={speedMenuOpen} onclick={() => speedMenuOpen = !speedMenuOpen} title="Playback speed">
						{playbackSpeed}×
					</button>
					{#if speedMenuOpen}
						<button class="pb-speed-backdrop" aria-label="Close speed menu" onclick={() => speedMenuOpen = false}></button>
						<div class="pb-speed-menu">
							{#each SPEEDS as s}
								<button class="pb-speed-option" class:active={playbackSpeed === s} onclick={() => { playbackSpeed = s; speedMenuOpen = false; }}>
									{s}×
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="pb-time">
				<span class="pb-current">{formatTime(currentTime)}</span>
				<span class="pb-sep">/</span>
				<span class="pb-total">{formatTime(resolvedLapTime)}</span>
			</div>

			<div class="pb-scrubber">
				<input
					type="range"
					min="0"
					max={resolvedLapTime}
					step="0.01"
					bind:value={currentTime}
					oninput={() => { stopPlayback(); seek(currentTime); }}
					style="--pct:{resolvedLapTime > 0 ? (currentTime / resolvedLapTime) * 100 : 0}%"
				/>
			</div>

			<div class="pb-nudge">
				<button onclick={() => seek(currentTime - 0.1)}>−0.1s</button>
				<button onclick={() => seek(currentTime + 0.1)}>+0.1s</button>
			</div>
		</div>
	</div>
</div>

<style>
	.app {
		display: flex;
		height: 100vh;
		overflow: hidden;
		background: #08090b;
	}

	.main {
		position: relative;
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 44px;
		padding: 0 12px;
		border-bottom: 1px solid rgba(255,255,255,0.06);
		background: rgba(12,13,16,0.80);
		backdrop-filter: blur(8px);
		flex-shrink: 0;
		gap: 8px;
	}

	.topbar-left, .topbar-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.lap-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px;
		border-radius: 5px;
		background: rgba(255,255,255,0.04);
		border: 1px solid rgba(255,255,255,0.08);
		font-size: 11px;
		font-family: var(--font-mono);
	}

	.lap-chip.primary {
		background: rgba(16,185,129,0.08);
		border-color: rgba(16,185,129,0.20);
	}

	.lap-chip .dot {
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		background: #10b981;
		flex-shrink: 0;
	}

	.chip-car  { color: rgba(255,255,255,0.70); }
	.chip-time { color: #10b981; font-variant-numeric: tabular-nums; }

	.chip-remove {
		display: flex;
		align-items: center;
		background: none;
		border: none;
		cursor: pointer;
		color: rgba(255,255,255,0.20);
		padding: 0;
		margin-left: 2px;
		transition: color 0.12s;
	}

	.chip-remove:hover { color: #ef4444; }
	.chip-remove svg { width: 11px; height: 11px; }

	.status-pill {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		border-radius: 5px;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(255,255,255,0.06);
		font-size: 10px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.10em;
		color: rgba(255,255,255,0.30);
	}

	.status-pill.connected {
		background: rgba(16,185,129,0.08);
		border-color: rgba(16,185,129,0.20);
		color: #6ee7b7;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		background: rgba(255,255,255,0.20);
		flex-shrink: 0;
	}

	.status-pill.connected .status-dot {
		background: #10b981;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50%       { opacity: 0.4; }
	}

	.sep {
		width: 1px;
		height: 16px;
		background: rgba(255,255,255,0.08);
	}

	.settings-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		border-radius: 5px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 10px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.10em;
		color: rgba(255,255,255,0.35);
		transition: color 0.12s, background 0.12s;
	}

	.settings-btn:hover, .settings-btn.active {
		color: #fff;
		background: rgba(255,255,255,0.05);
	}

	.settings-btn svg { width: 13px; height: 13px; }

	.workspace {
		flex: 1;
		display: flex;
		gap: 10px;
		padding: 10px;
		overflow: hidden;
		min-height: 0;
	}

	.map-area {
		position: relative;
		flex: 1;
		border-radius: 6px;
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
		background: #0a0b0d;
		overflow: hidden;
	}

	.fill-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.map-legend {
		position: absolute;
		bottom: 12px;
		left: 12px;
		display: flex;
		flex-direction: column;
		gap: 5px;
		z-index: 10;
		transition: bottom 0.18s ease;
	}

	.map-legend.lifted {
		bottom: 150px;
	}

	.legend-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border-radius: 5px;
		background: rgba(0,0,0,0.60);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255,255,255,0.08);
		font-size: 10px;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.60);
	}

	.dot { width: 6px; height: 6px; border-radius: 9999px; flex-shrink: 0; }
	.primary-dot { background: #10b981; }
	.legend-time { font-variant-numeric: tabular-nums; margin-left: 6px; }

	.map-empty {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}

	.map-empty svg {
		width: 36px;
		height: 36px;
		color: rgba(255,255,255,0.12);
	}

	.map-empty span {
		font-size: 10px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: rgba(255,255,255,0.18);
	}

	.panel {
		width: 420px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-radius: 6px;
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
		background: #0b0c0e;
		overflow: hidden;
	}

	.panel-empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: rgba(255,255,255,0.12);
	}

	.panel-scroll {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.chart-card {
		border-radius: 5px;
		background: rgba(255,255,255,0.02);
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
		overflow: hidden;
	}

	.chart-label {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px 4px;
		font-size: 9px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: rgba(255,255,255,0.30);
	}

	.chart-dot {
		width: 5px;
		height: 5px;
		border-radius: 9999px;
	}

	.chart-canvas {
		display: block;
		width: 100%;
		height: 90px;
		margin: 0 0 10px;
		padding: 0 10px;
		box-sizing: border-box;
	}

	.comp-grid {
		display: grid;
		gap: 1px;
		background: rgba(255,255,255,0.05);
	}

	.comp-col {
		background: #0b0c0e;
		display: flex;
		flex-direction: column;
	}

	.comp-col-header {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 6px 8px 2px;
		font-size: 9px;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.comp-canvas {
		display: block;
		width: 100%;
		height: 70px;
		padding: 0 5px 6px;
		box-sizing: border-box;
	}

	.comp-canvas.steer { height: 60px; padding-top: 4px; }

	.playbar {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 52px;
		padding: 0 14px;
		border-top: 1px solid rgba(255,255,255,0.06);
		background: rgba(12,13,16,0.90);
		backdrop-filter: blur(8px);
		flex-shrink: 0;
	}

	.playbar-controls {
		display: flex;
		align-items: center;
		gap: 3px;
		flex-shrink: 0;
	}

	.pb-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 5px;
		background: none;
		border: none;
		cursor: pointer;
		color: rgba(255,255,255,0.35);
		transition: color 0.12s, background 0.12s;
	}

	.pb-btn:hover { color: #fff; background: rgba(255,255,255,0.06); }
	.pb-btn svg   { width: 14px; height: 14px; }

	.pb-play {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: #10b981;
		border: none;
		cursor: pointer;
		color: #000;
		transition: background 0.12s, transform 0.1s;
	}

	.pb-play:hover  { background: #34d399; }
	.pb-play:active { transform: scale(0.95); }
	.pb-play svg    { width: 14px; height: 14px; }

	.pb-time {
		display: flex;
		align-items: baseline;
		gap: 3px;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.pb-current { font-size: 13px; color: #fff; }
	.pb-sep     { font-size: 11px; color: rgba(255,255,255,0.15); }
	.pb-total   { font-size: 11px; color: rgba(255,255,255,0.25); }

	.pb-scrubber {
		flex: 1;
	}

	.pb-scrubber input[type="range"] {
		width: 100%;
		height: 6px;
		border-radius: 9999px;
		appearance: none;
		cursor: pointer;
		background: linear-gradient(
			to right,
			rgba(16,185,129,0.85) 0%,
			rgba(16,185,129,0.85) var(--pct),
			rgba(255,255,255,0.08) var(--pct),
			rgba(255,255,255,0.08) 100%
		);
		outline: none;
	}

	.pb-scrubber input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 9999px;
		background: #10b981;
		transition: transform 0.1s;
	}

	.pb-scrubber input[type="range"]::-webkit-slider-thumb:hover {
		transform: scale(1.25);
	}

	.pb-nudge {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.pb-nudge button {
		padding: 3px 10px;
		height: 24px;
		display: flex;
		align-items: center;
		border-radius: 4px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 10px;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.30);
		transition: color 0.12s, background 0.12s;
	}

	.pb-nudge button:hover { color: #fff; background: rgba(255,255,255,0.06); }

	.pb-speed {
		position: relative;
		flex-shrink: 0;
	}

	.pb-speed-btn {
		min-width: 36px;
		height: 24px;
		padding: 0 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 5px;
		background: rgba(255,255,255,0.04);
		border: 1px solid rgba(255,255,255,0.08);
		cursor: pointer;
		font-size: 11px;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: rgba(255,255,255,0.70);
		transition: color 0.12s, background 0.12s;
	}

	.pb-speed-btn:hover, .pb-speed-btn.open {
		color: #fff;
		background: rgba(255,255,255,0.07);
	}

	.pb-speed-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: none;
		border: none;
		cursor: default;
	}

	.pb-speed-menu {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		z-index: 50;
		min-width: 64px;
		padding: 4px;
		border-radius: 6px;
		background: #0c0d10;
		border: 1px solid rgba(255,255,255,0.10);
		box-shadow: 0 -8px 30px rgba(0,0,0,0.50);
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.pb-speed-option {
		padding: 6px 10px;
		border-radius: 4px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		font-size: 11px;
		line-height: 1;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: rgba(255,255,255,0.70);
		transition: background 0.12s, color 0.12s;
	}

	.pb-speed-option:hover { background: rgba(255,255,255,0.05); color: #fff; }
	.pb-speed-option.active { color: #6ee7b7; }

	.game-select {
		position: relative;
	}

	.game-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border-radius: 5px;
		background: rgba(255,255,255,0.04);
		border: 1px solid rgba(255,255,255,0.08);
		cursor: pointer;
		font-size: 11px;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.80);
		transition: background 0.12s, border-color 0.12s;
	}

	.game-btn:hover:not(:disabled) { background: rgba(255,255,255,0.07); }
	.game-btn:disabled { opacity: 0.5; cursor: default; }

	.game-btn .chevron {
		width: 12px;
		height: 12px;
		color: rgba(255,255,255,0.40);
		transition: transform 0.15s;
	}

	.game-btn.open .chevron { transform: rotate(180deg); }

	.game-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: none;
		border: none;
		cursor: default;
	}

	.game-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 50;
		min-width: 190px;
		padding: 4px;
		border-radius: 6px;
		background: #0c0d10;
		border: 1px solid rgba(255,255,255,0.10);
		box-shadow: 0 8px 30px rgba(0,0,0,0.50);
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.game-option {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 4px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		font-size: 11px;
		line-height: 1;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.70);
		transition: background 0.12s, color 0.12s;
	}

	.game-option:hover { background: rgba(255,255,255,0.05); color: #fff; }
	.game-option.active { color: #6ee7b7; }

	.game-text {
		font-size: 11px;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.80);
		flex-shrink: 0;
	}

	.game-empty { color: rgba(255,255,255,0.45); }

	.game-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 18px;
		padding: 2px 5px;
		border-radius: 4px;
		background: #fff;
		flex-shrink: 0;
	}

	.game-logo img {
		height: 13px;
		width: auto;
		max-width: 72px;
		object-fit: contain;
		display: block;
	}
</style>
