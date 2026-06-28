<script lang="ts">
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index";
  import { Separator } from "$lib/components/ui/separator/index";
  import * as Sidebar from "$lib/components/ui/sidebar/index";
  import * as Menubar from "$lib/components/ui/menubar/index";
  import * as Tabs from "$lib/components/ui/tabs/index";
  import * as Card from "$lib/components/ui/card/index";
  import { onMount } from 'svelte';
  import { AspectRatio } from "$lib/components/ui/aspect-ratio/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  let bookmarks = $state(false);
  let fullUrls = $state(true);
  let currentSector = $state<number>(1);
  let appZoom = $state(1);
  const ZOOM_STEP = 0.1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;
  let scrubberEl = $state<HTMLInputElement | null>(null);
  let selectedLap = $state<any>(null);
  let liveMode = $state(false);
  let trackBoundaries = $state<{
    inner: {x: number, y: number}[],
    outer: {x: number, y: number}[]
  } | null>(null);
  interface SessionData {
        laps: any[]; 
        fastestId: string | null;
        minTime: number;
  }
  let databaseLaps = $state<any[]>([]);
  type GroupedLapsType = Record<string, Record<string, Record<string, Record<string, SessionData>>>>;
  let mapScale    = $state(1);
  let mapOffsetX  = $state(0);
  let mapOffsetY  = $state(0);
  let isPanning   = $state(false);
  let panStart    = { x: 0, y: 0, ox: 0, oy: 0 };
  let mapFitted   = false;

  let targetScale   = 1;
  let targetOffsetX = 0;
  let targetOffsetY = 0;
  let smoothRafId   = -1;
  let smoothRunning = false;
  let brakeCanvas = $state<HTMLCanvasElement | null>(null);
  
let showSettings = $state(false);
let gamePaths = $state<Record<string, string>>({ AC: '', ACC: '', iRacing: '', LMU: '' });
let saveStatus = $state('');

async function loadConfig() {
  try {
    const res = await fetch('http://127.0.0.1:8000/config');
    if (res.ok) {
      const config = await res.json();
      gamePaths = config.games ?? { AC: '', ACC: '', iRacing: '', LMU: '' };
    }
  } catch {}
}

async function saveConfig() {
  try {
    const res = await fetch('http://127.0.0.1:8000/config/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games: gamePaths }),
    });
    saveStatus = res.ok ? 'Saved' : 'Failed to save';
  } catch {
    saveStatus = 'Failed to save';
  }
  setTimeout(() => saveStatus = '', 2000);
}
  function drawBrakeTrace(idx: number) {
    const canvas = brakeCanvas;
    const ds     = dsTrace;
    if (!canvas || !ds) return;

    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { windowSize } = chartWindow;
    if (!windowSize) return;

    const toY   = (pct: number) => h - (Math.max(0, Math.min(100, pct)) / 100) * h;
    const ratio = ds.brake.length / currentTrace.brake.length;
    const dsIdx = Math.round(idx * ratio);

    const slots: number[] = [];
    for (let o = -windowSize; o <= windowSize; o++) slots.push(o);
    const slotW = w / (slots.length - 1);


    ctx.beginPath();
    ctx.fillStyle = "rgba(239,68,68,0.2)";
    let started = false;
    for (let s = 0; s < slots.length; s++) {
      const i = dsIdx + slots[s];
      const v = (i >= 0 && i < ds.brake.length) ? ds.brake[i] * 100 : 0;
      const x = s * slotW, y = toY(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.lineTo((slots.length - 1) * slotW, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(239,68,68,0.95)";
    ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    started = false;
    for (let s = 0; s < slots.length; s++) {
      const i = dsIdx + slots[s];
      const v = (i >= 0 && i < ds.brake.length) ? ds.brake[i] * 100 : 0;
      const x = s * slotW, y = toY(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();


for (const comp of compLaps) {
  const t = currentTrace.time[idx] ?? 0;
  const compRawIdx = comp.trace.time.findIndex(pt => pt >= t);
  const compDsIdx  = Math.round(Math.max(0, compRawIdx === -1 ? comp.trace.time.length - 1 : compRawIdx) * (comp.ds.brake.length / comp.trace.brake.length));

  ctx.beginPath(); ctx.fillStyle = `rgba(255,255,255,0.04)`;
  let started = false;
  for (let s = 0; s < slots.length; s++) {
    const i = compDsIdx + slots[s];
    const v = (i >= 0 && i < comp.ds.brake.length) ? comp.ds.brake[i] * 100 : 0;
    const x = s * slotW, y = toY(v);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.lineTo((slots.length-1)*slotW, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();


  ctx.beginPath();
  ctx.strokeStyle = `rgba(255,255,255,0.5)`;
  ctx.lineWidth = 1.5; ctx.lineJoin = "round";
  ctx.setLineDash([4, 3]);
  started = false;
  for (let s = 0; s < slots.length; s++) {
    const i = compDsIdx + slots[s];
    const v = (i >= 0 && i < comp.ds.brake.length) ? comp.ds.brake[i] * 100 : 0;
    const x = s * slotW, y = toY(v);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}
    ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.font = "9px monospace"; ctx.textAlign = "left";
    ctx.fillText("100", 3, toY(96) + 9);
    ctx.fillText("0",   3, toY(4));

    ctx.beginPath(); ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1;
    ctx.setLineDash([3,3]); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.stroke(); ctx.setLineDash([]);
    {
      const val = (dsIdx >= 0 && dsIdx < ds.brake.length) ? ds.brake[dsIdx] * 100 : 0;
      const dotX = w / 2;
      const dotY = toY(val);

      ctx.beginPath();
      ctx.shadowColor = "rgba(239,68,68,0.9)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#ef4444";
      ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
   
      const label = Math.round(val) + "%";
      ctx.font = "bold 9px monospace";
      const tw = ctx.measureText(label).width;
      const px = 5, py = 3;
      const bx = dotX + 7, by = dotY - 8;
      ctx.fillStyle = "rgba(20,20,20,0.85)";
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + px * 2, 14 + py, 3);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "left";
      ctx.fillText(label, bx + px, by + 10);
    }
    ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.font = "9px monospace";
  }
  

  const LERP = 0.14;
  function adjustZoom(delta: number) {
    appZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((appZoom + delta) * 10) / 10));
  }

  function handleKeydown(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); adjustZoom(ZOOM_STEP); }
    else if (e.key === '-')             { e.preventDefault(); adjustZoom(-ZOOM_STEP); }
    else if (e.key === '0')             { e.preventDefault(); appZoom = 1; }
  }

  function smoothTick() {
    const dx = targetOffsetX - mapOffsetX;
    const dy = targetOffsetY - mapOffsetY;
    const ds = targetScale   - mapScale;

    const still =
      Math.abs(dx) < 0.04 &&
      Math.abs(dy) < 0.04 &&
      Math.abs(ds) < 0.00008;

    if (still) {
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

  let groupedLaps = $derived.by(() => {
    const result: GroupedLapsType = {};

    for (const lap of databaseLaps) {
      const game  = lap.game  || "ACC";
      const track = lap.track || "Unknown Track";
      const car   = lap.car   || "Unknown Car";

      let dateStr = "Unknown Date";
      if (lap.date_time) {
        const rawDate = lap.date_time.split('_')[0];
        dateStr = new Date(rawDate).toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' 
        });
      }

      if (!result[game]) result[game] = {};
      if (!result[game][track]) result[game][track] = {};
      if (!result[game][track][car]) result[game][track][car] = {};
      if (!result[game][track][car][dateStr]) {
        result[game][track][car][dateStr] = {
          laps: [],
          fastestId: null,
          minTime: Infinity
        };
      }

      const session = result[game][track][car][dateStr];
      session.laps.push(lap);

      const timeSec = parseLapTime(lap.lap_time || lap.time);
      if (timeSec > 0 && timeSec < session.minTime) {
        session.minTime = timeSec;
        session.fastestId = lap.uuid;
      }
    }
    
    return result;
  });

  let telemetryData = $state({
    lapTime:   '0:00.000',
    trackName: '',
    car:       '',
  });

  let currentTrace = $state.raw({
    gas:    [] as number[],
    brake:  [] as number[],
    steer:  [] as number[],
    normPos:[] as number[],
    worldX: [] as number[],
    worldZ: [] as number[],
    time:   [] as number[],
  });
  let steeringCanvas = $state<HTMLCanvasElement | null>(null);

  let resolvedLapTime = $state(0);
  let totalLapTime    = $derived(resolvedLapTime);

  let playbackIndex  = $state(0);
  let exactIndex     = $state(0);
  let isPlaying      = $state(false);
  let animationFrameId: number;

  let mapCanvas   = $state<HTMLCanvasElement | null>(null);
  let canvasWidth = $state(0);
  let canvasHeight= $state(0);

  let traceCanvas = $state<HTMLCanvasElement | null>(null);

  let compTraceCanvases: (HTMLCanvasElement | null)[] = $state([]);
  let compSteerCanvases: (HTMLCanvasElement | null)[] = $state([]);

  let allLaps = $derived.by(() => {
    const t = currentTrace.time[playbackIndex] ?? 0;
    return [
      {
        lapTime:   telemetryData.lapTime,
        car:       telemetryData.car,
        color:     LAP_COLORS[0] as string,
        ds:        dsTrace,
        trace:     currentTrace,
        rawIdx:    playbackIndex,
        isPrimary: true,
      },
      ...compLaps.map((comp) => {
        const compRawIdx = comp.trace.time.findIndex(pt => pt >= t);
        return {
          lapTime:   comp.lap.lap_time || comp.lap.time,
          car:       comp.lap.car,
          color:     comp.color,
          ds:        comp.ds,
          trace:     comp.trace,
          rawIdx:    compRawIdx === -1 ? comp.trace.time.length - 1 : compRawIdx,
          isPrimary: false,
        };
      }),
    ];
  });

  let chartWindow = { windowSize: 0, step: 1 };
  const TRACE_RESOLUTION = 2000;

  interface DownsampledTrace {
    gas:   number[];
    brake: number[];
    steer: number[];
    time:  number[];
  }
  let dsTrace = $state<DownsampledTrace | null>(null);

  const LAP_COLORS = ['#ffffff', '#f59e0b', '#3b82f6'] as const;

  interface CompLap {
    lap:     any;
    trace:   typeof currentTrace;
    ds:      DownsampledTrace;
    color:   string;
    lapTime: number;
  }
  let compLaps = $state<CompLap[]>([]);

  async function addCompLap(lap: any) {
    if (compLaps.length >= 2) return;
    if (compLaps.some(c => c.lap.uuid === lap.uuid)) return;
    if (selectedLap?.uuid === lap.uuid) return;

    try {
      const res         = await fetch(`http://127.0.0.1:8000/laps/${lap.uuid}/telemetry`);
      const fetchedData = await res.json();

      const trace = {
        gas:    fetchedData.gas                   ?? [],
        brake:  fetchedData.brake                 ?? [],
        steer:  fetchedData.steering              ?? [],
        normPos:fetchedData.normalizedCarPosition ?? [],
        worldX: fetchedData.worldX                ?? [],
        worldZ: fetchedData.worldZ                ?? [],
        time:   fetchedData.time                  ?? [],
      };

      const lapTimeSec = parseLapTime(lap.lap_time || lap.time);
      const n          = trace.gas.length;
      const buckets    = Math.min(TRACE_RESOLUTION, n);
      const gas:   number[] = new Array(buckets);
      const brake: number[] = new Array(buckets);
      const steer: number[] = new Array(buckets);
      const time:  number[] = new Array(buckets);

      for (let b = 0; b < buckets; b++) {
        const start = Math.floor((b / buckets) * n);
        const end   = Math.floor(((b + 1) / buckets) * n);
        let maxGas = 0, maxBrake = 0, sumSteer = 0, count = 0;
        for (let i = start; i < end; i++) {
          if (trace.gas[i]   > maxGas)   maxGas   = trace.gas[i];
          if (trace.brake[i] > maxBrake) maxBrake = trace.brake[i];
          sumSteer += trace.steer[i];
          count++;
        }
        gas[b]   = maxGas;
        brake[b] = maxBrake;
        steer[b] = count > 0 ? sumSteer / count : 0;
        time[b]  = trace.time[start] ?? (lapTimeSec * (b / buckets));
      }

      const color = LAP_COLORS[compLaps.length + 1];
      compLaps = [...compLaps, { lap, trace, ds: { gas, brake, steer, time }, color, lapTime: lapTimeSec }];

      drawTrace(playbackIndex);
      drawSteeringTrace(playbackIndex);
    } catch (e) {
      console.error('Failed to load comparison lap', e);
    }
  }

  function removeCompLap(uuid: string) {
    compLaps = compLaps.filter(c => c.lap.uuid !== uuid);
    drawTrace(playbackIndex);
    drawSteeringTrace(playbackIndex);
  }

  function downsampleTrace(lapTimeSec: number) {
    const src = currentTrace;
    const n   = src.gas.length;
    if (!n || !lapTimeSec) { dsTrace = null; return; }

    const buckets  = Math.min(TRACE_RESOLUTION, n);
    const gas:   number[] = new Array(buckets);
    const brake: number[] = new Array(buckets);
    const steer: number[] = new Array(buckets);
    const time:  number[] = new Array(buckets);

    for (let b = 0; b < buckets; b++) {
      const start = Math.floor((b / buckets) * n);
      const end   = Math.floor(((b + 1) / buckets) * n);

      let maxGas = 0, maxBrake = 0, sumSteer = 0, count = 0;
      for (let i = start; i < end; i++) {
        if (src.gas[i]   > maxGas)   maxGas   = src.gas[i];
        if (src.brake[i] > maxBrake) maxBrake = src.brake[i];
        sumSteer += src.steer[i];
        count++;
      }

      gas[b]   = maxGas;
      brake[b] = maxBrake;
      steer[b] = count > 0 ? sumSteer / count : 0;
      time[b]  = src.time[start] ?? (lapTimeSec * (b / buckets));
    }

    dsTrace = { gas, brake, steer, time };

    const pps        = buckets / lapTimeSec;
    const windowSize = Math.floor(pps * 10);
    chartWindow = { windowSize, step: 1 };
  }

  let currentTime = $state(0);

  const bounds = $derived.by(() => {
    const xs = currentTrace.worldX;
    const zs = currentTrace.worldZ;
    if (!xs?.length) return { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    let minX = xs[0], maxX = xs[0], minZ = zs[0], maxZ = zs[0];
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i];
      if (zs[i] < minZ) minZ = zs[i]; if (zs[i] > maxZ) maxZ = zs[i];
    }
    if (maxX === minX) maxX = minX + 1;
    if (maxZ === minZ) maxZ = minZ + 1;
    return { minX, maxX, minZ, maxZ };
  });

  function fitMapToTrace() {
    if (!mapCanvas || !currentTrace.worldX.length) return;
    const w = canvasWidth;
    const h = canvasHeight;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < currentTrace.worldX.length; i++) {
      const x = currentTrace.worldX[i], z = currentTrace.worldZ[i];
      if (isGarbageCoord(x, z)) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!isFinite(minX)) return;

    const traceW = maxX - minX || 1;
    const traceZ = maxZ - minZ || 1;
    const scale  = Math.min((w * 0.88) / traceW, (h * 0.88) / traceZ);

    mapScale   = scale * 0.4;
    mapOffsetX = w / 2;
    mapOffsetY = h / 2;

    targetScale   = scale;
    targetOffsetX = w / 2 - ((minX + maxX) / 2) * scale;
    targetOffsetY = h / 2 + ((minZ + maxZ) / 2) * scale;

    mapFitted = true;
    nudgeSmooth();
  }

  function isGarbageCoord(x: number, z: number) {
    return (x === 0 && z === 0) || Math.abs(x) > 50000 || Math.abs(z) > 50000;
  }

  function drawSteeringTrace(idx: number) {
    const canvas = steeringCanvas;
    const ds     = dsTrace;
    if (!canvas || !ds) return;

    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { windowSize } = chartWindow;
    if (!windowSize) return;

    const toY    = (v: number) => (h / 2) - (Math.max(-1, Math.min(1, v)) * (h / 2));
    const ratio  = ds.steer.length / currentTrace.steer.length;
    const dsIdx  = Math.round(idx * ratio);

    const slots: number[] = [];
    for (let offset = -windowSize; offset <= windowSize; offset++) slots.push(offset);
    const slotW = w / (slots.length - 1);

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth   = 1;
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    function drawSteerChannel(
      dsData: DownsampledTrace,
      centerIdx: number,
      fillColor: string,
      strokeColor: string
    ) {
      ctx.beginPath();
      ctx.fillStyle = fillColor;
      let started = false;
      for (let s = 0; s < slots.length; s++) {
        const i   = centerIdx + slots[s];
        const val = (i >= 0 && i < dsData.steer.length) ? dsData.steer[i] : 0;
        const x   = s * slotW;
        started ? ctx.lineTo(x, toY(val)) : (ctx.moveTo(x, toY(val)), started = true);
      }
      ctx.lineTo((slots.length - 1) * slotW, h / 2);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth   = 1.5;
      ctx.lineJoin    = "round";
      started = false;
      for (let s = 0; s < slots.length; s++) {
        const i   = centerIdx + slots[s];
        const val = (i >= 0 && i < dsData.steer.length) ? dsData.steer[i] : 0;
        const x   = s * slotW;
        started ? ctx.lineTo(x, toY(val)) : (ctx.moveTo(x, toY(val)), started = true);
      }
      ctx.stroke();
    }

    drawSteerChannel(ds, dsIdx, "rgba(139,92,246,0.2)", "rgba(139,92,246,0.9)");

    for (const comp of compLaps) {
      const compRatio  = comp.ds.steer.length / comp.trace.steer.length;
      const t          = currentTrace.time[idx] ?? 0;
      const compRawIdx = comp.trace.time.findIndex(pt => pt >= t);
      const compDsIdx  = Math.round(Math.max(0, compRawIdx === -1 ? comp.trace.time.length - 1 : compRawIdx) * compRatio);
      ctx.beginPath(); ctx.fillStyle = `rgba(255,255,255,0.04)`;
      let steerStarted = false;
      for (let s = 0; s < slots.length; s++) {
        const i = compDsIdx + slots[s];
        const val = (i >= 0 && i < comp.ds.steer.length) ? comp.ds.steer[i] : 0;
        const x = s * slotW;
        steerStarted ? ctx.lineTo(x, toY(val)) : (ctx.moveTo(x, toY(val)), steerStarted = true);
      }
      ctx.lineTo((slots.length - 1) * slotW, h / 2); ctx.lineTo(0, h / 2); ctx.closePath(); ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,0.45)`;
      ctx.lineWidth = 1.5; ctx.lineJoin = "round";
      ctx.setLineDash([4, 3]);
      steerStarted = false;
      for (let s = 0; s < slots.length; s++) {
        const i = compDsIdx + slots[s];
        const val = (i >= 0 && i < comp.ds.steer.length) ? comp.ds.steer[i] : 0;
        const x = s * slotW;
        steerStarted ? ctx.lineTo(x, toY(val)) : (ctx.moveTo(x, toY(val)), steerStarted = true);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font      = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("L", 4, toY(0.85) + 10);
    ctx.fillText("R", 4, toY(-0.85));

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);
    {
      const val = (dsIdx >= 0 && dsIdx < ds.steer.length) ? ds.steer[dsIdx] : 0;
      const dotX = w / 2;
      const dotY = toY(val);
      ctx.beginPath();
      ctx.shadowColor = "rgba(139,92,246,0.9)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#8b5cf6";
      ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      const absVal = Math.abs(val * 100);
      const dir = val > 0.005 ? "L" : val < -0.005 ? "R" : "";
      const label = dir ? `${dir} ${Math.round(absVal)}%` : `${Math.round(absVal)}%`;
      ctx.font = "bold 9px monospace";
      const tw = ctx.measureText(label).width;
      const px = 5, py = 3;
      const bx = dotX + 7, by = dotY - 8;
      ctx.fillStyle = "rgba(20,20,20,0.85)";
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + px * 2, 14 + py, 3);
      ctx.fill();
      ctx.fillStyle = "#8b5cf6";
      ctx.textAlign = "left";
      ctx.fillText(label, bx + px, by + 10);
    }
    if (compLaps.length > 0) {
      drawSingleLapSteer(compSteerCanvases[0] ?? null, ds, currentTrace, idx, 'primary');
      for (let ci = 0; ci < compLaps.length; ci++) {
        const comp = compLaps[ci];
        const t    = currentTrace.time[idx] ?? 0;
        const compRawIdx2 = comp.trace.time.findIndex(pt => pt >= t);
        const compIdx     = compRawIdx2 === -1 ? comp.trace.time.length - 1 : compRawIdx2;
        drawSingleLapSteer(compSteerCanvases[ci + 1] ?? null, comp.ds, comp.trace, compIdx, comp.color);
      }
    }
  }

  function parseLapTime(timeStr: string | number): number {
    if (!timeStr) return 0;
    if (typeof timeStr === 'number') return timeStr > 3600 ? timeStr / 1000 : timeStr;
    const str = String(timeStr).trim();
    if (/^\d+$/.test(str)) return parseInt(str, 10) / 1000;
    if (/^\d+\.\d+$/.test(str)) {
      const val = parseFloat(str);
      return val > 3600 ? val / 1000 : val;
    }
    const m = str.match(/^(\d+):(\d+)[.:](\d+)$/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / 1000;
    return parseFloat(str) || 0;
  }

  function formatTime(s: number): string {
    const clamped = Math.max(0, s);
    const m = Math.floor(clamped / 60);
    return `${m}:${(clamped % 60).toFixed(2).padStart(5, '0')}`;
  }

  function drawTrace(idx: number) {
    const canvas = traceCanvas;
    const ds     = dsTrace;
    if (!canvas || !ds) return;

    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
    }

    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { windowSize } = chartWindow;
    if (!windowSize) return;

    const toY    = (pct: number) => h - (Math.max(0, Math.min(100, pct)) / 100) * h;
    const ratio  = ds.gas.length / currentTrace.gas.length;
    const dsIdx  = Math.round(idx * ratio);

    const slots: number[] = [];
    for (let offset = -windowSize; offset <= windowSize; offset++) slots.push(offset);
    const slotW = w / (slots.length - 1);

  function drawChannel(
  dsData: DownsampledTrace,
  centerIdx: number,
  getVal: (i: number) => number,
  fillColor: string,
  strokeColor: string,
  totalLen: number,
  dashed = false
) {
  ctx.beginPath();
  ctx.fillStyle = fillColor;
  let started = false;
  for (let s = 0; s < slots.length; s++) {
    const i   = centerIdx + slots[s];
    const val = (i >= 0 && i < totalLen) ? getVal(i) : 0;
    const x   = s * slotW;
    const y   = toY(val);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.lineTo((slots.length - 1) * slotW, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = "round";
  ctx.setLineDash(dashed ? [4, 3] : []);
  started = false;
  for (let s = 0; s < slots.length; s++) {
    const i   = centerIdx + slots[s];
    const val = (i >= 0 && i < totalLen) ? getVal(i) : 0;
    const x   = s * slotW;
    const y   = toY(val);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

    drawChannel(ds, dsIdx, i => ds.gas[i] * 100, "rgba(255,255,255,0.08)", "rgba(255,255,255,0.9)",  ds.gas.length);
    drawChannel(ds, dsIdx, i => ds.gas[i] * 100, "rgba(16,185,129,0.15)",  "rgba(16,185,129,0.95)",  ds.gas.length);

    for (const comp of compLaps) {
      const t          = currentTrace.time[idx] ?? 0;
      const compRawIdx = comp.trace.time.findIndex(pt => pt >= t);
      const compDsIdx  = Math.round(Math.max(0, compRawIdx === -1 ? comp.trace.time.length - 1 : compRawIdx) * (comp.ds.gas.length / comp.trace.gas.length));


      drawChannel(comp.ds, compDsIdx, i => comp.ds.gas[i] * 100, `rgba(255,255,255,0.04)`, `rgba(255,255,255,0.5)`, comp.ds.gas.length, true);
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font      = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("100%", 4, toY(98) + 10);
    ctx.fillText("50%",  4, toY(50)  + 4);
    ctx.fillText("0%",   4, toY(2)   + 0);

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);
    {
      const val = (dsIdx >= 0 && dsIdx < ds.gas.length) ? ds.gas[dsIdx] * 100 : 0;
      const dotX = w / 2;
      const dotY = toY(val);
      ctx.beginPath();
      ctx.shadowColor = "rgba(16,185,129,0.9)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#10b981";
      ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      const label = Math.round(val) + "%";
      ctx.font = "bold 9px monospace";
      const tw = ctx.measureText(label).width;
      const px = 5, py = 3;
      const bx = dotX + 7, by = dotY;
      ctx.fillStyle = "rgba(20,20,20,0.85)";
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + px * 2, 14 + py, 3);
      ctx.fill();
      ctx.fillStyle = "#10b981";
      ctx.textAlign = "left";
      ctx.fillText(label, bx + px, by + 10);
    }

    if (compLaps.length > 0) {
      drawSingleLapTrace(compTraceCanvases[0] ?? null, ds, currentTrace, idx, 'primary');
      for (let ci = 0; ci < compLaps.length; ci++) {
        const comp = compLaps[ci];
        const t    = currentTrace.time[idx] ?? 0;
        const compRawIdx2 = comp.trace.time.findIndex(pt => pt >= t);
        const compIdx     = compRawIdx2 === -1 ? comp.trace.time.length - 1 : compRawIdx2;
        drawSingleLapTrace(compTraceCanvases[ci + 1] ?? null, comp.ds, comp.trace, compIdx, comp.color);
      }
    }
  }

  function drawSingleLapTrace(
    canvas: HTMLCanvasElement | null,
    ds: DownsampledTrace,
    rawTrace: typeof currentTrace,
    idx: number,
    color: string
  ) {
    if (!canvas || !ds) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { windowSize } = chartWindow;
    if (!windowSize) return;

    const toY   = (pct: number) => h - (Math.max(0, Math.min(100, pct)) / 100) * h;
    const ratio = ds.gas.length / (rawTrace.gas.length || 1);
    const dsIdx = Math.round(idx * ratio);

    const slots: number[] = [];
    for (let o = -windowSize; o <= windowSize; o++) slots.push(o);
    const slotW = w / (slots.length - 1);

    function drawChannel(
      getVal: (i: number) => number,
      fillAlpha: number,
      strokeAlpha: number,
      cr: number, cg: number, cb: number
    ) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${fillAlpha})`;
      let started = false;
      for (let s = 0; s < slots.length; s++) {
        const i   = dsIdx + slots[s];
        const val = (i >= 0 && i < ds.gas.length) ? getVal(i) : 0;
        const x   = s * slotW;
        const y   = toY(val);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.lineTo((slots.length - 1) * slotW, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${strokeAlpha})`;
      ctx.lineWidth = 1.5; ctx.lineJoin = "round";
      started = false;
      for (let s = 0; s < slots.length; s++) {
        const i   = dsIdx + slots[s];
        const val = (i >= 0 && i < ds.gas.length) ? getVal(i) : 0;
        const x   = s * slotW;
        const y   = toY(val);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    drawChannel(i => ds.gas[i] * 100,   0.15, 0.95, 16, 185, 129);
    drawChannel(i => ds.brake[i] * 100, 0.25, 0.95, 239, 68, 68);

    ctx.fillStyle = "rgba(161,161,170,0.8)";
    ctx.font      = "10px monospace"; ctx.textAlign = "left";
    ctx.fillText("100%", 4, toY(98) + 10);
    ctx.fillText("0%",   4, toY(2));

    ctx.beginPath(); ctx.strokeStyle = "rgba(161,161,170,0.3)";
    ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawSingleLapSteer(
    canvas: HTMLCanvasElement | null,
    ds: DownsampledTrace,
    rawTrace: typeof currentTrace,
    idx: number,
    color: string
  ) {
    if (!canvas || !ds) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { windowSize } = chartWindow;
    if (!windowSize) return;

    const toY   = (v: number) => (h / 2) - (Math.max(-1, Math.min(1, v)) * (h / 2));
    const ratio = ds.steer.length / (rawTrace.steer.length || 1);
    const dsIdx = Math.round(idx * ratio);

    const slots: number[] = [];
    for (let o = -windowSize; o <= windowSize; o++) slots.push(o);
    const slotW = w / (slots.length - 1);

    ctx.beginPath(); ctx.strokeStyle = "rgba(161,161,170,0.15)";
    ctx.lineWidth = 1; ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

    let sr = 139, sg = 92, sb = 246;
    if (color !== 'primary') {
      sr = parseInt(color.slice(1, 3), 16);
      sg = parseInt(color.slice(3, 5), 16);
      sb = parseInt(color.slice(5, 7), 16);
    }

    ctx.beginPath();
    ctx.fillStyle = `rgba(${sr},${sg},${sb},0.2)`;
    let started = false;
    for (let s = 0; s < slots.length; s++) {
      const i   = dsIdx + slots[s];
      const val = (i >= 0 && i < ds.steer.length) ? ds.steer[i] : 0;
      const x   = s * slotW;
      if (!started) { ctx.moveTo(x, toY(val)); started = true; } else ctx.lineTo(x, toY(val));
    }
    ctx.lineTo((slots.length - 1) * slotW, h / 2); ctx.lineTo(0, h / 2); ctx.closePath(); ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.9)`;
    ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    started = false;
    for (let s = 0; s < slots.length; s++) {
      const i   = dsIdx + slots[s];
      const val = (i >= 0 && i < ds.steer.length) ? ds.steer[i] : 0;
      const x   = s * slotW;
      if (!started) { ctx.moveTo(x, toY(val)); started = true; } else ctx.lineTo(x, toY(val));
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(161,161,170,0.8)";
    ctx.font      = "10px monospace"; ctx.textAlign = "left";
    ctx.fillText("L", 4, toY(0.85) + 10);
    ctx.fillText("R", 4, toY(-0.85));

    ctx.beginPath(); ctx.strokeStyle = "rgba(161,161,170,0.3)";
    ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
  }

  async function fetchTrackBoundaries(simId: string, trackId: string, UUID: string) {
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/boundaries/${encodeURIComponent(simId)}/${encodeURIComponent(trackId)}/${encodeURIComponent(UUID)}`
      );
      trackBoundaries = res.ok ? await res.json() : null;
    } catch {
      trackBoundaries = null;
    }
  }

  function startPlayback(lapTimeSec: number) {
  if (isPlaying) stopPlayback();
  if (!currentTrace.gas.length || lapTimeSec <= 0) return;

  isPlaying  = true;
  exactIndex = playbackIndex;

  const totalPoints = currentTrace.gas.length;
  const pps         = totalPoints / lapTimeSec;

  let lastTimestamp: number | null = null;
  let lastTraceUpdate = 0;

  function tick(timestamp: number) {
    if (!isPlaying) return;

    if (lastTimestamp === null) {
      lastTimestamp    = timestamp;
      animationFrameId = requestAnimationFrame(tick);
      return;
    }

    const dt      = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
    lastTimestamp = timestamp;

    exactIndex = Math.min(exactIndex + pps * dt, totalPoints - 1);
    if (exactIndex >= totalPoints - 1) {
      exactIndex    = totalPoints - 1;
      playbackIndex = totalPoints - 1;
      currentTime   = currentTrace.time[totalPoints - 1] ?? totalLapTime;
      drawTrace(playbackIndex);
      drawSteeringTrace(playbackIndex);
      drawBrakeTrace(playbackIndex);
      stopPlayback(true);
      return;
    }

    playbackIndex = Math.floor(exactIndex);
    currentTime   = currentTrace.time[playbackIndex] ?? 0;

    if (timestamp - lastTraceUpdate > 100) {
      drawTrace(playbackIndex);
      drawSteeringTrace(playbackIndex);
      drawBrakeTrace(playbackIndex);
      lastTraceUpdate = timestamp;
    }

    animationFrameId = requestAnimationFrame(tick);
  }

  animationFrameId = requestAnimationFrame(tick);
}

  function togglePlayback() {
    isPlaying ? stopPlayback() : startPlayback(resolvedLapTime);
  }

  function onMapWheel(e: WheelEvent) {
    e.preventDefault();
    const rect     = mapCanvas!.getBoundingClientRect();
    const mouseX   = e.clientX - rect.left;
    const mouseY   = e.clientY - rect.top;

    const delta    = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
    const factor   = Math.pow(0.999, delta);
    const newScale = Math.max(0.2, Math.min(targetScale * factor, 80));

    targetOffsetX = mouseX - (mouseX - targetOffsetX) * (newScale / targetScale);
    targetOffsetY = mouseY - (mouseY - targetOffsetY) * (newScale / targetScale);
    targetScale   = newScale;

    nudgeSmooth();
  }

  function onMapPointerDown(e: PointerEvent) {
    isPanning = true;
    panStart  = { x: e.clientX, y: e.clientY, ox: targetOffsetX, oy: targetOffsetY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onMapPointerMove(e: PointerEvent) {
    if (!isPanning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;

    targetOffsetX = panStart.ox + dx;
    targetOffsetY = panStart.oy + dy;

    mapOffsetX = targetOffsetX;
    mapOffsetY = targetOffsetY;
  }

  function onMapPointerUp(e: PointerEvent) {
    isPanning = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

function stopPlayback(fromEndOfLap = false) {
  cancelAnimationFrame(animationFrameId);
  isPlaying = false;
  if (fromEndOfLap && scrubberEl) {
    scrubberEl.value = String(currentTrace.time[playbackIndex] ?? 0);
  }
}

  $effect(() => {
    if (!mapCanvas || canvasWidth === 0 || canvasHeight === 0 || !currentTrace.worldX.length) return;

    if (!mapFitted) fitMapToTrace();

    const ctx = mapCanvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    mapCanvas.width  = canvasWidth  * dpr;
    mapCanvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const toScreen = (wx: number, wz: number) => ({
      sx: wx  *  mapScale + mapOffsetX,
      sz: wz  * -mapScale + mapOffsetY,
    });

    const isGarbage = isGarbageCoord;

    if (trackBoundaries?.inner && trackBoundaries?.outer) {
      ctx.lineWidth   = 3;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.2)";

      const drawBoundary = (arr: any[]) => {
        if (!arr?.length) return;
        ctx.beginPath();
        let first = true;
        for (const pt of arr) {
          const px = pt.x ?? pt[0];
          const pz = pt.z ?? pt[1];
          if (px === undefined || pz === undefined) continue;
          const { sx, sz } = toScreen(px, pz);
          if (isNaN(sx) || isNaN(sz)) continue;
          first ? ctx.moveTo(sx, sz) : ctx.lineTo(sx, sz);
          first = false;
        }
        ctx.closePath();
        ctx.stroke();
      };

      drawBoundary(trackBoundaries.outer);
      drawBoundary(trackBoundaries.inner);
    }

    const diagLen  = Math.sqrt((bounds.maxX - bounds.minX) ** 2 + (bounds.maxZ - bounds.minZ) ** 2);
    const lineStep = Math.max(1, Math.floor(currentTrace.worldX.length / (diagLen * 2)));

    if (dsTrace) {
      const total   = currentTrace.worldX.length;
      const dsTotal = dsTrace.gas.length;

      ctx.lineWidth = Math.max(2, 3 * Math.min(mapScale / 3, 1.5));
      ctx.lineCap   = "round";
      ctx.lineJoin  = "round";

      for (let i = 0; i < total - lineStep; i += lineStep) {
        const wx = currentTrace.worldX[i], wz = currentTrace.worldZ[i];
        const nx = currentTrace.worldX[i + lineStep], nz = currentTrace.worldZ[i + lineStep];
        if (isGarbage(wx, wz) || isGarbage(nx, nz)) continue;

        const dsIdx = Math.round((i / total) * dsTotal);
        const g     = dsTrace.gas[dsIdx]   ?? 0;
        const b     = dsTrace.brake[dsIdx] ?? 0;

        let color: string;
        if (b > 0.05)      color = `rgba(239,68,68,${0.5 + b * 0.5})`;
        else if (g > 0.05) color = `rgba(16,185,129,${0.5 + g * 0.5})`;
        else               color = "rgba(255,255,255,0.35)";

        const { sx: x1, sz: z1 } = toScreen(wx, wz);
        const { sx: x2, sz: z2 } = toScreen(nx, nz);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.moveTo(x1, z1);
        ctx.lineTo(x2, z2);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth   = 3;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      let firstPt = true;
      for (let i = 0; i < currentTrace.worldX.length; i += lineStep) {
        const wx = currentTrace.worldX[i], wz = currentTrace.worldZ[i];
        if (isGarbage(wx, wz)) continue;
        const { sx, sz } = toScreen(wx, wz);
        firstPt ? ctx.moveTo(sx, sz) : ctx.lineTo(sx, sz);
        firstPt = false;
      }
      ctx.stroke();
    }

    const sf = toScreen(currentTrace.worldX[0], currentTrace.worldZ[0]);
    if (!isGarbage(currentTrace.worldX[0], currentTrace.worldZ[0])) {
      ctx.beginPath();
      ctx.fillStyle = "#ef4444";
      ctx.arc(sf.sx, sf.sz, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const comp of compLaps) {
      const t          = currentTrace.time[playbackIndex] ?? 0;
      const compRawIdx = comp.trace.time.findIndex(pt => pt >= t);
      const i          = compRawIdx === -1 ? comp.trace.time.length - 1 : compRawIdx;
      const wx         = comp.trace.worldX[i];
      const wz         = comp.trace.worldZ[i];
      if (!isGarbage(wx, wz)) {
        const { sx, sz } = toScreen(wx, wz);
        const hex = comp.color;
        ctx.beginPath();
        ctx.fillStyle   = hex;
        ctx.shadowColor = hex;
        ctx.shadowBlur  = 10;
        ctx.arc(sx, sz, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur  = 0;
      }
    }

    const carWX = currentTrace.worldX[playbackIndex];
    const carWZ = currentTrace.worldZ[playbackIndex];
    if (!isGarbage(carWX, carWZ)) {
      const { sx: cx, sz: cz } = toScreen(carWX, carWZ);
      ctx.beginPath();
      ctx.fillStyle   = "white";
      ctx.shadowColor = "rgba(255,255,255,0.9)";
      ctx.shadowBlur  = 12;
      ctx.arc(cx, cz, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  });

  $effect(() => {
    if (compLaps.length === 0 || !dsTrace) return;

    const idx   = playbackIndex;
    const cTr   = compTraceCanvases.slice();
    const cSt   = compSteerCanvases.slice();
    const laps  = compLaps.slice();

    Promise.resolve().then(() => {
      drawSingleLapTrace(cTr[0] ?? null, dsTrace!, currentTrace, idx, 'primary');
      drawSingleLapSteer(cSt[0] ?? null, dsTrace!, currentTrace, idx, 'primary');

      const t = currentTrace.time[idx] ?? 0;
      for (let ci = 0; ci < laps.length; ci++) {
        const comp       = laps[ci];
        const compRawIdx = comp.trace.time.findIndex(pt => pt >= t);
        const compIdx    = compRawIdx === -1 ? comp.trace.time.length - 1 : compRawIdx;
        drawSingleLapTrace(cTr[ci + 1] ?? null, comp.ds, comp.trace, compIdx, comp.color);
        drawSingleLapSteer(cSt[ci + 1] ?? null, comp.ds, comp.trace, compIdx, comp.color);
      }
    });
  });

  async function selectLap(lap: any) {
    selectedLap = lap;
    liveMode    = false;
    stopPlayback();

    const lapTimeSec = parseLapTime(lap.lap_time || lap.time);

    try {
      const res         = await fetch(`http://127.0.0.1:8000/laps/${lap.uuid}/telemetry`);
      const fetchedData = await res.json();

      currentTrace = {
        gas:    fetchedData.gas                   ?? [],
        brake:  fetchedData.brake                 ?? [],
        steer:  fetchedData.steering              ?? [],
        normPos:fetchedData.normalizedCarPosition ?? [],
        worldX: fetchedData.worldX                ?? [],
        worldZ: fetchedData.worldZ                ?? [],
        time:   fetchedData.time                  ?? [],
      };

      mapFitted = false;

      telemetryData.car       = lap.car;
      telemetryData.trackName = lap.track;
      telemetryData.lapTime   = String(lap.lap_time || lap.time);
      resolvedLapTime         = lapTimeSec;

      await fetchTrackBoundaries(lap.game || "ACC", lap.track, lap.uuid);

      playbackIndex = 0;
      exactIndex    = 0;

      downsampleTrace(lapTimeSec);
      drawTrace(playbackIndex);
      drawBrakeTrace(playbackIndex);
      drawSteeringTrace(playbackIndex);

      if (currentTrace.normPos.length > 0) startPlayback(lapTimeSec);
    } catch (e) {
      console.error("Failed to load telemetry", e);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    loadConfig();
    let pollInterval: ReturnType<typeof setInterval>;

    const fetchLaps = async (): Promise<boolean> => {
      try {
        const res = await fetch('http://127.0.0.1:8000/laps');
        if (res.ok) {
          databaseLaps = (await res.json()) as any[];
          return true; 
        }
      } catch {
      }
      return false;
    };

    const initData = async (): Promise<void> => {
      let retries = 15;
      while (retries > 0) {
        const success = await fetchLaps();
        if (success) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        retries--;
      }
      pollInterval = setInterval(fetchLaps, 3000);
    };

    initData();

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      if (pollInterval) clearInterval(pollInterval);
      cancelAnimationFrame(smoothRafId); 
    };
  });
</script>

<svelte:head>
  <style>
    html { overflow: hidden; height: 100vh; margin: 0; }
    body { overflow: hidden; margin: 0; transform-origin: 0 0; }
  </style>
</svelte:head>


<Sidebar.Provider style="height: {100/appZoom}vh; overflow: hidden; transform: scale({appZoom}); transform-origin: 0 0; width: {100/appZoom}%;">
  <AppSidebar
    {groupedLaps}
    {selectedLap}
    compLapIds={compLaps.map(c => c.lap.uuid)}
    canAddComp={compLaps.length < 2}
    onSelectLap={selectLap}
    onAddComp={addCompLap}
    onRemoveComp={removeCompLap}
  />

  <Sidebar.Inset class="relative flex flex-col overflow-hidden bg-[#0a0a0a] pb-[52px]" style="height: 100%;">
  {#if showSettings}
  <div class="absolute inset-0 z-40 bg-[#0a0a0a] flex flex-col">
    <div class="flex h-11 shrink-0 items-center justify-between px-4 border-b border-white/[0.06] bg-[#0f0f0f]">
      <span class="flex items-center gap-2 text-[11px] font-mono text-white/60 uppercase tracking-widest">
        <span class="material-symbols-outlined" style="font-size:15px;">tune</span>
        Settings
      </span>
      <button onclick={() => showSettings = false} class="text-white-600 hover:text-white transition-colors">
        <span class="material-symbols-outlined" style="font-size:18px;">close</span>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
      <div class="flex flex-col gap-4">
        <p class="text-[9px] font-mono uppercase tracking-[0.15em] text-white-600">Game Install Paths</p>
        <p class="text-[10px] font-mono text-white-700 leading-relaxed">
          Point each entry to your game's root install folder so Novent can reliably detect when the game is running.
        </p>

        {#each Object.keys(gamePaths) as key}
          <div class="flex flex-col gap-1.5">
            <label class="text-[10px] font-mono text-white-500 uppercase tracking-widest">{key}</label>
            <input
              type="text"
              bind:value={gamePaths[key]}
                placeholder={
                  key === 'AC'      ? 'C:/Program Files (x86)/Steam/steamapps/common/assettocorsa/acs.exe' :
                  key === 'ACC'     ? 'C:/Program Files (x86)/Steam/steamapps/common/Assetto Corsa Competizione/AC2.exe' :
                  key === 'LMU'     ? 'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe' :
                  key === 'iRacing' ? 'C:/Users/username/Documents/iRacing/iRacingSim64DX11.exe' :
                  'Path to game executable (.exe)'
                }
              class="w-full bg-zinc-900 border border-white/[0.08] rounded px-3 py-2 text-[11px] font-mono
                     text-white/80 placeholder:text-zinc-700 focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>
        {/each}
      </div>

      <div class="flex items-center gap-3">
        <button
          onclick={saveConfig}
          class="px-4 py-2 rounded bg-white/5 border border-white/10 text-[11px] font-mono
                 text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          Save
        </button>
        {#if saveStatus}
          <span class="text-[10px] font-mono {saveStatus === 'Saved' ? 'text-emerald-500' : 'text-red-400'}">{saveStatus}</span>
        {/if}
      </div>
    </div>
  </div>
{/if}

    <header class="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 bg-[#0f0f0f]">
      <div class="flex items-center gap-2">
        <Sidebar.Trigger class="w-8 h-8 [&_svg]:!w-3.5 [&_svg]:!h-3.5 text-zinc-500 hover:text-white" />
        <Separator orientation="vertical" class="h-4 bg-white/10" />
        <div class="flex items-center gap-1">
          {#if telemetryData.trackName}
            <div class="flex items-center gap-2 px-2.5 py-1 rounded bg-white/5 border border-white/10">
              <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
              <span class="text-[11px] font-mono text-white/80">{telemetryData.car}</span>
              <span class="text-[11px] font-mono text-emerald-400 tabular-nums">{telemetryData.lapTime}</span>
            </div>
          {/if}
          {#each compLaps as comp}
            <div class="flex items-center gap-2 px-2.5 py-1 rounded bg-white/5 border border-white/10">
              <span class="w-1.5 h-1.5 rounded-full" style="background:{comp.color}"></span>
              <span class="text-[11px] font-mono tabular-nums" style="color:{comp.color}">{comp.lap.lap_time || comp.lap.time}</span>
              <button onclick={() => removeCompLap(comp.lap.uuid)} class="flex items-center text-white/20 hover:text-red-400 transition-colors ml-0.5">
                <span class="material-symbols-outlined" style="font-size:13px;">close</span>
              </button>
            </div>
          {/each}
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-0.5">
          <button onclick={() => adjustZoom(-ZOOM_STEP)} class="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-white/5 transition-all"><span class="material-symbols-outlined" style="font-size:16px;">remove</span></button>
          <span class="text-[10px] font-mono text-white-600 w-8 text-center tabular-nums">{Math.round(appZoom * 100)}%</span>
          <button onclick={() => adjustZoom(ZOOM_STEP)}  class="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-white/5 transition-all"><span class="material-symbols-outlined" style="font-size:16px;">add</span></button>
        </div>
        <Separator orientation="vertical" class="h-4 bg-white/10" />
        <button
        onclick={() => showSettings = !showSettings}
        class="flex items-center gap-1.5 text-[11px] font-mono text-white-600 uppercase tracking-widest hover:text-white transition-colors"
      >
        <span class="material-symbols-outlined" style="font-size:15px;">{showSettings ? 'close' : 'settings'}</span>
        {showSettings ? 'Close' : 'Settings'}
      </button>
      </div>
      
    </header>

    <div class="flex flex-1 overflow-hidden min-h-0">

  
      <div
        class="relative flex-1 bg-black"
        bind:clientWidth={canvasWidth}
        bind:clientHeight={canvasHeight}
        role="application"
        aria-label="Track map — scroll to zoom, drag to pan"
        onwheel={onMapWheel}
        onpointerdown={onMapPointerDown}
        onpointermove={onMapPointerMove}
        onpointerup={onMapPointerUp}
        style="cursor: {isPanning ? 'grabbing' : 'grab'}"
      >
        {#if currentTrace.worldX.length > 0}
          <canvas bind:this={mapCanvas} class="absolute inset-0 w-full h-full block"></canvas>
          <div class="absolute bottom-4 left-4 flex flex-col gap-1.5 z-10">
            {#if telemetryData.car}
              <div class="flex items-center gap-2 px-2.5 py-1.5 rounded bg-black/70 backdrop-blur-sm border border-white/10">
                <span class="w-2 h-2 rounded-full bg-white shrink-0"></span>
                <span class="text-[10px] font-mono text-white/70">{telemetryData.car}</span>
                <span class="ml-2 text-[10px] font-mono text-emerald-400 tabular-nums">{telemetryData.lapTime}</span>
              </div>
            {/if}
            {#each compLaps as comp}
              <div class="flex items-center gap-2 px-2.5 py-1.5 rounded bg-black/70 backdrop-blur-sm border border-white/10">
                <span class="w-2 h-2 rounded-full shrink-0" style="background:{comp.color}"></span>
                <span class="text-[10px] font-mono tabular-nums" style="color:{comp.color}">{comp.lap.car}</span>
                <span class="ml-2 text-[10px] font-mono tabular-nums" style="color:{comp.color}">{comp.lap.lap_time || comp.lap.time}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="flex flex-col items-center gap-3">
              <div class="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center">
                <span class="material-symbols-outlined text-white/30" style="font-size:22px;">schedule</span>
              </div>
              <span class="text-[11px] font-mono uppercase tracking-widest text-white/20">Select a lap to begin</span>
            </div>
          </div>
        {/if}
      </div>


      <div class="w-[420px] shrink-0 border-l border-white/[0.06] flex flex-col bg-[#0a0a0a] overflow-hidden">

        {#if !selectedLap}
          <div class="flex-1 flex items-center justify-center">
            <span class="text-[11px] font-mono uppercase tracking-widest text-white/15">No lap selected</span>
          </div>
        {:else}
          <div class="flex-1 overflow-y-auto overflow-x-hidden">


            <div class="border-b border-white/[0.06]">
              <div class="flex items-center justify-between px-4 pt-3 pb-1">
                <span class="text-[9px] font-mono uppercase tracking-[0.15em] text-zinc-600">Throttle</span>
                <span class="w-2 h-[2px] rounded-full bg-emerald-500 inline-block"></span>
              </div>
              <div class="px-3 pb-3">
                <canvas bind:this={traceCanvas} class="w-full block rounded-sm" style="height: 90px;"></canvas>
              </div>
            </div>


            <div class="border-b border-white/[0.06]">
              <div class="flex items-center justify-between px-4 pt-3 pb-1">
                <span class="text-[9px] font-mono uppercase tracking-[0.15em] text-zinc-600">Brake</span>
                <span class="w-2 h-[2px] rounded-full bg-red-500 inline-block"></span>
              </div>
              <div class="px-3 pb-3">
                <canvas bind:this={brakeCanvas} class="w-full block rounded-sm" style="height: 90px;"></canvas>
              </div>
            </div>

            <div class="border-b border-white/[0.06]">
              <div class="flex items-center justify-between px-4 pt-3 pb-1">
                <span class="text-[9px] font-mono uppercase tracking-[0.15em] text-zinc-600">Steering</span>
                <span class="w-2 h-[2px] rounded-full bg-violet-500 inline-block"></span>
              </div>
              <div class="px-3 pb-3">
                <canvas bind:this={steeringCanvas} class="w-full block rounded-sm" style="height: 90px;"></canvas>
              </div>
            </div>

   
            {#if compLaps.length > 0}
              <div class="border-b border-white/[0.06]">
                <div class="px-4 pt-3 pb-1">
                  <span class="text-[9px] font-mono uppercase tracking-[0.15em] text-zinc-600">Comparison — Throttle &amp; Brake</span>
                </div>
                <div class="grid gap-px bg-white/[0.04]" style="grid-template-columns: repeat({allLaps.length}, 1fr);">
                  {#each allLaps as lapEntry, i}
                    <div class="flex flex-col bg-[#0a0a0a]">
                      <div class="flex items-center gap-1.5 px-2 pt-2 pb-1 shrink-0">
                        <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:{lapEntry.color}"></span>
                        <span class="text-[9px] font-mono tabular-nums truncate" style="color:{lapEntry.color}">{lapEntry.lapTime}</span>
                      </div>
                      <div class="px-1.5 pb-2">
                        <canvas bind:this={compTraceCanvases[i]} class="w-full block rounded-sm" style="height:70px;"></canvas>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <div>
                <div class="px-4 pt-3 pb-1">
                  <span class="text-[9px] font-mono uppercase tracking-[0.15em] text-zinc-600">Comparison — Steering</span>
                </div>
                <div class="grid gap-px bg-white/[0.04]" style="grid-template-columns: repeat({allLaps.length}, 1fr);">
                  {#each allLaps as lapEntry, i}
                    <div class="flex flex-col bg-[#0a0a0a]">
                      <div class="px-1.5 pt-1 pb-2">
                        <canvas bind:this={compSteerCanvases[i]} class="w-full block rounded-sm" style="height:60px;"></canvas>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

          </div>
        {/if}
      </div>
    </div>

  </Sidebar.Inset>
</Sidebar.Provider>


<div class="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[#0f0f0f] px-4 py-2.5 flex items-center gap-4">


  <div class="flex items-center gap-1 shrink-0">
    <button
      onclick={() => {
      const t = Math.max(0, currentTime - 1);
      let idx = currentTrace.time.findIndex(pt => pt >= t);
      if (idx === -1) idx = currentTrace.time.length - 1;
      playbackIndex = Math.max(0, idx);
      exactIndex    = playbackIndex;
      currentTime   = currentTrace.time[playbackIndex] ?? 0; 
      drawTrace(playbackIndex); drawSteeringTrace(playbackIndex); drawBrakeTrace(playbackIndex);
    }}
      class="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
    >
      <span class="material-symbols-outlined" style="font-size:18px;">skip_previous</span>
    </button>
    <button
      onclick={togglePlayback}
      class="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 active:scale-95 transition-all"
    >
      {#if isPlaying}
        <span class="material-symbols-outlined" style="font-size:20px;">pause</span>
      {:else}
        <span class="material-symbols-outlined" style="font-size:20px;">play_arrow</span>
      {/if}
    </button>
    <button
      onclick={() => {
    const t = Math.min(totalLapTime, currentTime + 1);
    let idx = currentTrace.time.findIndex(pt => pt >= t);
    if (idx === -1) idx = currentTrace.time.length - 1;
    playbackIndex = Math.max(0, idx);
    exactIndex    = playbackIndex;
    currentTime   = currentTrace.time[playbackIndex] ?? 0; 
    drawTrace(playbackIndex); drawSteeringTrace(playbackIndex); drawBrakeTrace(playbackIndex);
  }}
      class="w-7 h-7 flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
    >
      <span class="material-symbols-outlined" style="font-size:18px;">skip_next</span>
    </button>
  </div>


  <div class="flex items-baseline gap-1 shrink-0 font-mono tabular-nums">
    <span class="text-sm text-white">{formatTime(currentTime)}</span>
    <span class="text-xs text-white/20">/</span>
    <span class="text-xs text-white/30">{formatTime(totalLapTime)}</span>
  </div>


  <div class="flex-1">
    <input
      type="range"
      min="0"
      max={totalLapTime}
      step="0.01"
      bind:value={currentTime}
      oninput={(e) => {
        stopPlayback();
        const t = currentTime;
        let idx = currentTrace.time.findIndex(pt => pt >= t);
        if (idx === -1) idx = currentTrace.time.length - 1;
        playbackIndex = Math.max(0, idx);
        exactIndex    = playbackIndex;
        drawTrace(playbackIndex);
        drawSteeringTrace(playbackIndex);
        drawBrakeTrace(playbackIndex);
      }}
      class="w-full h-1 rounded-full appearance-none cursor-pointer
             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
             [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
             [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(255,255,255,0.4)]
             [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:transition-transform
             [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3
             [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
      style="background: linear-gradient(to right, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.6) {totalLapTime > 0 ? (currentTime / totalLapTime) * 100 : 0}%, rgba(255,255,255,0.08) {totalLapTime > 0 ? (currentTime / totalLapTime) * 100 : 0}%, rgba(255,255,255,0.08) 100%)"
    />
  </div>


  <div class="flex items-center gap-1 shrink-0">
    <button onclick={() => {
  const t = Math.max(0, currentTime - 0.1);
  let idx = currentTrace.time.findIndex(pt => pt >= t);
  if (idx === -1) idx = currentTrace.time.length - 1;
  playbackIndex = Math.max(0, idx);
  exactIndex    = playbackIndex;
  currentTime   = currentTrace.time[playbackIndex] ?? 0; 
  drawTrace(playbackIndex); drawSteeringTrace(playbackIndex); drawBrakeTrace(playbackIndex);
}} class="px-2 h-6 flex items-center justify-center rounded text-[10px] font-mono text-zinc-600 hover:text-white hover:bg-white/5 transition-all">−0.1s</button>
    <button onclick={() => {
  const t = Math.min(totalLapTime, currentTime + 0.1);
  let idx = currentTrace.time.findIndex(pt => pt >= t);
  if (idx === -1) idx = currentTrace.time.length - 1;
  playbackIndex = Math.max(0, idx);
  exactIndex    = playbackIndex;
  currentTime   = currentTrace.time[playbackIndex] ?? 0;  
  drawTrace(playbackIndex); drawSteeringTrace(playbackIndex); drawBrakeTrace(playbackIndex);
}} class="px-2 h-6 flex items-center justify-center rounded text-[10px] font-mono text-zinc-600 hover:text-white hover:bg-white/5 transition-all">+0.1s</button>
  </div>
</div>
