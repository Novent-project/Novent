import { setupCanvas, buildSlots, distBucket, drawValueLabel, type DownsampledTrace, type Trace, type ChartWindow } from './shared.js';

interface CompLap {
	trace: Trace;
	ds:    DownsampledTrace;
	color: string;
}

export function drawBrake(
	canvas:   HTMLCanvasElement | null,
	ds:       DownsampledTrace | null,
	trace:    Trace,
	idx:      number,
	window:   ChartWindow,
	compLaps: CompLap[]
) {
	if (!canvas || !ds || !window.windowSize) return;
	const { ctx, w, h } = setupCanvas(canvas);
	const toY   = (pct: number) => h - (Math.max(0, Math.min(100, pct)) / 100) * h;
	const slots = buildSlots(window.windowSize);
	const slotW = w / (slots.length - 1);
	const dsIdx = distBucket(trace.normPos[idx] ?? 0, ds.brake.length);

	function fill(data: number[], centerIdx: number, fillColor: string, strokeColor: string, dashed = false) {
		ctx.beginPath();
		ctx.fillStyle = fillColor;
		let started = false;
		for (let s = 0; s < slots.length; s++) {
			const i = centerIdx + slots[s];
			const v = (i >= 0 && i < data.length) ? data[i] * 100 : 0;
			started ? ctx.lineTo(s * slotW, toY(v)) : (ctx.moveTo(s * slotW, toY(v)), started = true);
		}
		ctx.lineTo((slots.length - 1) * slotW, h);
		ctx.lineTo(0, h);
		ctx.closePath();
		ctx.fill();

		ctx.beginPath();
		ctx.strokeStyle = strokeColor;
		ctx.lineWidth   = 1.5;
		ctx.lineJoin    = 'round';
		ctx.setLineDash(dashed ? [4, 3] : []);
		started = false;
		for (let s = 0; s < slots.length; s++) {
			const i = centerIdx + slots[s];
			const v = (i >= 0 && i < data.length) ? data[i] * 100 : 0;
			started ? ctx.lineTo(s * slotW, toY(v)) : (ctx.moveTo(s * slotW, toY(v)), started = true);
		}
		ctx.stroke();
		ctx.setLineDash([]);
	}

	fill(ds.brake, dsIdx, 'rgba(239,68,68,0.20)', 'rgba(239,68,68,0.95)');

	for (const comp of compLaps) {
		const compDsIdx = dsIdx;
		fill(comp.ds.brake, compDsIdx, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.50)', true);
	}

	ctx.fillStyle = 'rgba(255,255,255,0.25)';
	ctx.font      = '9px monospace';
	ctx.textAlign = 'left';
	ctx.fillText('100', 3, toY(96) + 9);
	ctx.fillText('0',   3, toY(4));

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(255,255,255,0.15)';
	ctx.lineWidth   = 1;
	ctx.setLineDash([3, 3]);
	ctx.moveTo(w / 2, 0);
	ctx.lineTo(w / 2, h);
	ctx.stroke();
	ctx.setLineDash([]);

	const val  = (dsIdx >= 0 && dsIdx < ds.brake.length) ? ds.brake[dsIdx] * 100 : 0;
	const dotY = toY(val);
	ctx.beginPath();
	ctx.shadowColor = 'rgba(239,68,68,0.9)';
	ctx.shadowBlur  = 10;
	ctx.fillStyle   = '#ef4444';
	ctx.arc(w / 2, dotY, 3.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.shadowBlur = 0;

	drawValueLabel(ctx, w, h, dotY, Math.round(val) + '%', '#ef4444');
}
