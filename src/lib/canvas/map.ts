import { distBucket, type DownsampledTrace, type Trace } from './shared.js';
import type { TrackBoundaries } from '../api.js';

interface CompLap {
	trace: Trace;
	ds:    DownsampledTrace;
	color: string;
}

function isGarbage(x: number, z: number): boolean {
	return (x === 0 && z === 0) || Math.abs(x) > 50000 || Math.abs(z) > 50000;
}

export function smoothBoundary(pts: { x: number; z: number }[], window = 7): { x: number; z: number }[] {
	const n = pts.length;
	if (n < window || window < 3) return pts;
	const gx = (p: any) => p.x ?? p[0];
	const gz = (p: any) => p.z ?? p[1];
	const half = window >> 1;
	const out: { x: number; z: number }[] = [];
	for (let i = 0; i < n; i++) {
		let sx = 0, sz = 0;
		for (let k = -half; k <= half; k++) {
			const p = pts[((i + k) % n + n) % n];
			sx += gx(p);
			sz += gz(p);
		}
		out.push({ x: sx / window, z: sz / window });
	}
	return out;
}

export function fitMap(
	trace: Trace,
	w:     number,
	h:     number
): { scale: number; offsetX: number; offsetY: number } | null {
	let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
	for (let i = 0; i < trace.worldX.length; i++) {
		const x = trace.worldX[i], z = trace.worldZ[i];
		if (isGarbage(x, z)) continue;
		if (x < minX) minX = x; if (x > maxX) maxX = x;
		if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
	}
	if (!isFinite(minX)) return null;

	const traceW = maxX - minX || 1;
	const traceZ = maxZ - minZ || 1;
	const scale  = Math.min((w * 0.88) / traceW, (h * 0.88) / traceZ);

	return {
		scale,
		offsetX: w / 2 - ((minX + maxX) / 2) * scale,
		offsetY: h / 2 + ((minZ + maxZ) / 2) * scale,
	};
}

export function drawMap(
	canvas:     HTMLCanvasElement | null,
	w:          number,
	h:          number,
	trace:      Trace,
	ds:         DownsampledTrace | null,
	scale:      number,
	offsetX:    number,
	offsetY:    number,
	idx:        number,
	boundaries: TrackBoundaries | null,
	compLaps:   CompLap[]
) {
	if (!canvas || !trace.worldX.length) return;

	const dpr = window.devicePixelRatio || 1;
	canvas.width  = w * dpr;
	canvas.height = h * dpr;
	const ctx = canvas.getContext('2d')!;
	ctx.scale(dpr, dpr);
	ctx.clearRect(0, 0, w, h);

	const toScreen = (wx: number, wz: number) => ({
		sx: wx  *  scale + offsetX,
		sz: wz  * -scale + offsetY,
	});

	if (boundaries?.inner && boundaries?.outer) {
		ctx.lineWidth   = 3;
		ctx.lineCap     = 'round';
		ctx.lineJoin    = 'round';
		ctx.strokeStyle = 'rgba(255,255,255,0.18)';

		for (const arr of [boundaries.outer, boundaries.inner]) {
			if (!arr?.length) continue;
			const sp: { x: number; y: number }[] = [];
			for (const pt of arr) {
				const px = pt.x ?? (pt as any)[0];
				const pz = pt.z ?? (pt as any)[1];
				if (px === undefined || pz === undefined) continue;
				const { sx, sz } = toScreen(px, pz);
				if (isNaN(sx) || isNaN(sz)) continue;
				sp.push({ x: sx, y: sz });
			}
			if (sp.length < 3) continue;
			const n = sp.length;
			ctx.beginPath();
			ctx.moveTo((sp[n - 1].x + sp[0].x) / 2, (sp[n - 1].y + sp[0].y) / 2);
			for (let i = 0; i < n; i++) {
				const cur = sp[i];
				const nxt = sp[(i + 1) % n];
				ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) / 2, (cur.y + nxt.y) / 2);
			}
			ctx.closePath();
			ctx.stroke();
		}
	}

	const total    = trace.worldX.length;
	const diagLen  = Math.sqrt((Math.max(...trace.worldX) - Math.min(...trace.worldX)) ** 2 + (Math.max(...trace.worldZ) - Math.min(...trace.worldZ)) ** 2);
	const lineStep = Math.max(1, Math.floor(total / (diagLen * 2)));

	if (ds) {
		const dsTotal = ds.gas.length;
		ctx.lineWidth = Math.max(2, 3 * Math.min(scale / 3, 1.5));
		ctx.lineCap   = 'round';
		ctx.lineJoin  = 'round';

		for (let i = 0; i < total - lineStep; i += lineStep) {
			const wx = trace.worldX[i], wz = trace.worldZ[i];
			const nx = trace.worldX[i + lineStep], nz = trace.worldZ[i + lineStep];
			if (isGarbage(wx, wz) || isGarbage(nx, nz)) continue;

			const di = distBucket(trace.normPos[i] ?? 0, dsTotal);
			const g  = ds.gas[di]   ?? 0;
			const b  = ds.brake[di] ?? 0;

			ctx.beginPath();
			ctx.strokeStyle = b > 0.05
				? `rgba(239,68,68,${0.5 + b * 0.5})`
				: g > 0.05
					? `rgba(16,185,129,${0.5 + g * 0.5})`
					: 'rgba(255,255,255,0.35)';
			const { sx: x1, sz: z1 } = toScreen(wx, wz);
			const { sx: x2, sz: z2 } = toScreen(nx, nz);
			ctx.moveTo(x1, z1);
			ctx.lineTo(x2, z2);
			ctx.stroke();
		}
	} else {
		ctx.beginPath();
		ctx.strokeStyle = 'rgba(255,255,255,0.8)';
		ctx.lineWidth   = 3;
		ctx.lineCap     = 'round';
		ctx.lineJoin    = 'round';
		let first = true;
		for (let i = 0; i < total; i += lineStep) {
			const wx = trace.worldX[i], wz = trace.worldZ[i];
			if (isGarbage(wx, wz)) continue;
			const { sx, sz } = toScreen(wx, wz);
			first ? ctx.moveTo(sx, sz) : ctx.lineTo(sx, sz);
			first = false;
		}
		ctx.stroke();
	}

	const sf = toScreen(trace.worldX[0], trace.worldZ[0]);
	if (!isGarbage(trace.worldX[0], trace.worldZ[0])) {
		ctx.beginPath();
		ctx.fillStyle = '#ef4444';
		ctx.arc(sf.sx, sf.sz, 6, 0, Math.PI * 2);
		ctx.fill();
	}

	for (const comp of compLaps) {
		const t          = trace.time[idx] ?? 0;
		const compRawIdx = comp.trace.time.findIndex(pt => pt >= t);
		const ci         = compRawIdx === -1 ? comp.trace.time.length - 1 : compRawIdx;
		const wx         = comp.trace.worldX[ci];
		const wz         = comp.trace.worldZ[ci];
		if (!isGarbage(wx, wz)) {
			const { sx, sz } = toScreen(wx, wz);
			ctx.beginPath();
			ctx.fillStyle   = comp.color;
			ctx.shadowColor = comp.color;
			ctx.shadowBlur  = 10;
			ctx.arc(sx, sz, 5, 0, Math.PI * 2);
			ctx.fill();
			ctx.shadowBlur = 0;
		}
	}

	const carWX = trace.worldX[idx];
	const carWZ = trace.worldZ[idx];
	if (!isGarbage(carWX, carWZ)) {
		const { sx, sz } = toScreen(carWX, carWZ);
		ctx.beginPath();
		ctx.fillStyle   = 'white';
		ctx.shadowColor = 'rgba(255,255,255,0.9)';
		ctx.shadowBlur  = 12;
		ctx.arc(sx, sz, 6, 0, Math.PI * 2);
		ctx.fill();
		ctx.shadowBlur = 0;
	}
}
