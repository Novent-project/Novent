import { setupCanvas, buildSlots, distBucket, drawValueLabel, type DownsampledTrace, type Trace, type ChartWindow } from './shared.js';

export function deltaRangeFor(primary: DownsampledTrace, reference: DownsampledTrace): number {
	const n = Math.min(primary.time.length, reference.time.length);
	let m = 0;
	for (let b = 0; b < n; b++) {
		const d = Math.abs(primary.time[b] - reference.time[b]);
		if (d > m) m = d;
	}
	return Math.max(0.3, Math.ceil(m * 10) / 10);
}

export function drawDelta(
	canvas:    HTMLCanvasElement | null,
	primary:   DownsampledTrace | null,
	reference: DownsampledTrace | null,
	trace:     Trace,
	idx:       number,
	window:    ChartWindow,
	range:     number
) {
	if (!canvas || !primary || !reference || !window.windowSize) return;
	const { ctx, w, h } = setupCanvas(canvas);
	const N      = Math.min(primary.time.length, reference.time.length);
	const center = distBucket(trace.normPos[idx] ?? 0, N);
	const slots  = buildSlots(window.windowSize);
	const slotW  = w / (slots.length - 1);
	const r      = Math.max(0.2, range);
	const toY    = (d: number) => (h / 2) - (Math.max(-r, Math.min(r, d)) / r) * (h / 2);
	const deltaAt = (b: number) => (b >= 0 && b < N) ? primary.time[b] - reference.time[b] : NaN;

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(255,255,255,0.18)';
	ctx.lineWidth   = 1;
	ctx.moveTo(0, h / 2);
	ctx.lineTo(w, h / 2);
	ctx.stroke();

	for (let s = 0; s < slots.length - 1; s++) {
		const d0 = deltaAt(center + slots[s]);
		const d1 = deltaAt(center + slots[s + 1]);
		if (Number.isNaN(d0) || Number.isNaN(d1)) continue;
		const x0 = s * slotW, x1 = (s + 1) * slotW;
		ctx.beginPath();
		ctx.moveTo(x0, h / 2);
		ctx.lineTo(x0, toY(d0));
		ctx.lineTo(x1, toY(d1));
		ctx.lineTo(x1, h / 2);
		ctx.closePath();
		ctx.fillStyle = (d0 + d1) / 2 > 0 ? 'rgba(239,68,68,0.16)' : 'rgba(16,185,129,0.16)';
		ctx.fill();
	}

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(255,255,255,0.85)';
	ctx.lineWidth   = 1.5;
	ctx.lineJoin    = 'round';
	let started = false;
	for (let s = 0; s < slots.length; s++) {
		const d = deltaAt(center + slots[s]);
		if (Number.isNaN(d)) { started = false; continue; }
		const x = s * slotW, y = toY(d);
		started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), started = true);
	}
	ctx.stroke();

	ctx.fillStyle = 'rgba(255,255,255,0.30)';
	ctx.font      = '9px monospace';
	ctx.textAlign = 'left';
	ctx.fillText(`+${r.toFixed(1)}s`, 3, 11);
	ctx.fillText(`-${r.toFixed(1)}s`, 3, h - 4);

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(255,255,255,0.25)';
	ctx.lineWidth   = 1;
	ctx.setLineDash([4, 4]);
	ctx.moveTo(w / 2, 0);
	ctx.lineTo(w / 2, h);
	ctx.stroke();
	ctx.setLineDash([]);

	const cur = deltaAt(center);
	if (!Number.isNaN(cur)) {
		const y   = toY(cur);
		const col = cur > 0.0005 ? '#ef4444' : cur < -0.0005 ? '#10b981' : '#e5e7eb';
		ctx.beginPath();
		ctx.fillStyle = col;
		ctx.arc(w / 2, y, 3.5, 0, Math.PI * 2);
		ctx.fill();

		drawValueLabel(ctx, w, h, y, `${cur > 0 ? '+' : ''}${cur.toFixed(2)}s`, col);
	}
}
