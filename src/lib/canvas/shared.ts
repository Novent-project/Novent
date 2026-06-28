export interface Trace {
	gas:     number[];
	brake:   number[];
	steer:   number[];
	normPos: number[];
	worldX:  number[];
	worldZ:  number[];
	time:    number[];
}

export interface DownsampledTrace {
	gas:   number[];
	brake: number[];
	steer: number[];
	time:  number[];
}

export interface ChartWindow {
	windowSize: number;
	step:       number;
}

export const TRACE_RESOLUTION = 2000;

export const LAP_COLORS = ['#ffffff', '#f59e0b', '#3b82f6'] as const;

export function downsample(src: Trace, lapTimeSec: number): DownsampledTrace | null {
	const n = src.gas.length;
	if (!n || !lapTimeSec) return null;

	const buckets = Math.min(TRACE_RESOLUTION, n);
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

	return { gas, brake, steer, time };
}

export function chartWindowFor(ds: DownsampledTrace, lapTimeSec: number): ChartWindow {
	const pps        = ds.gas.length / lapTimeSec;
	const windowSize = Math.floor(pps * 10);
	return { windowSize, step: 1 };
}

export function setupCanvas(canvas: HTMLCanvasElement): {
	ctx: CanvasRenderingContext2D;
	w: number;
	h: number;
	dpr: number;
} {
	const dpr = window.devicePixelRatio || 1;
	const w   = canvas.offsetWidth;
	const h   = canvas.offsetHeight;
	if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
		canvas.width  = w * dpr;
		canvas.height = h * dpr;
	}
	const ctx = canvas.getContext('2d')!;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, w, h);
	return { ctx, w, h, dpr };
}

export function buildSlots(windowSize: number): number[] {
	const slots: number[] = [];
	for (let o = -windowSize; o <= windowSize; o++) slots.push(o);
	return slots;
}

export function compIndexAt(
	comp: { trace: Trace; ds: DownsampledTrace },
	primaryTime: number
): number {
	const rawIdx = comp.trace.time.findIndex(pt => pt >= primaryTime);
	const raw    = rawIdx === -1 ? comp.trace.time.length - 1 : rawIdx;
	return Math.round(Math.max(0, raw) * (comp.ds.gas.length / comp.trace.gas.length));
}
