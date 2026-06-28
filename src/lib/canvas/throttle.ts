import { setupCanvas, buildSlots, compIndexAt, type DownsampledTrace, type Trace, type ChartWindow } from './shared.js';

interface CompLap {
	trace: Trace;
	ds:    DownsampledTrace;
	color: string;
}

function drawChannel(
	ctx:         CanvasRenderingContext2D,
	slots:       number[],
	slotW:       number,
	h:           number,
	centerIdx:   number,
	getVal:      (i: number) => number,
	totalLen:    number,
	fillColor:   string,
	strokeColor: string,
	dashed       = false
) {
	const toY = (pct: number) => h - (Math.max(0, Math.min(100, pct)) / 100) * h;

	ctx.beginPath();
	ctx.fillStyle = fillColor;
	let started = false;
	for (let s = 0; s < slots.length; s++) {
		const i = centerIdx + slots[s];
		const v = (i >= 0 && i < totalLen) ? getVal(i) : 0;
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
		const v = (i >= 0 && i < totalLen) ? getVal(i) : 0;
		started ? ctx.lineTo(s * slotW, toY(v)) : (ctx.moveTo(s * slotW, toY(v)), started = true);
	}
	ctx.stroke();
	ctx.setLineDash([]);
}

export function drawThrottle(
	canvas:    HTMLCanvasElement | null,
	ds:        DownsampledTrace | null,
	trace:     Trace,
	idx:       number,
	window:    ChartWindow,
	compLaps:  CompLap[]
) {
	if (!canvas || !ds || !window.windowSize) return;
	const { ctx, w, h } = setupCanvas(canvas);
	const toY    = (pct: number) => h - (Math.max(0, Math.min(100, pct)) / 100) * h;
	const slots  = buildSlots(window.windowSize);
	const slotW  = w / (slots.length - 1);
	const ratio  = ds.gas.length / (trace.gas.length || 1);
	const dsIdx  = Math.round(idx * ratio);

	drawChannel(ctx, slots, slotW, h, dsIdx, i => ds.gas[i] * 100, ds.gas.length,
		'rgba(16,185,129,0.15)', 'rgba(16,185,129,0.95)');

	for (const comp of compLaps) {
		const compDsIdx = compIndexAt(comp, trace.time[idx] ?? 0);
		drawChannel(ctx, slots, slotW, h, compDsIdx, i => comp.ds.gas[i] * 100, comp.ds.gas.length,
			'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.50)', true);
	}

	ctx.fillStyle = 'rgba(255,255,255,0.25)';
	ctx.font      = '9px monospace';
	ctx.textAlign = 'left';
	ctx.fillText('100%', 3, toY(98) + 10);
	ctx.fillText('50%',  3, toY(50)  + 4);
	ctx.fillText('0%',   3, toY(2));

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(255,255,255,0.25)';
	ctx.lineWidth   = 1;
	ctx.setLineDash([4, 4]);
	ctx.moveTo(w / 2, 0);
	ctx.lineTo(w / 2, h);
	ctx.stroke();
	ctx.setLineDash([]);

	const val  = (dsIdx >= 0 && dsIdx < ds.gas.length) ? ds.gas[dsIdx] * 100 : 0;
	const dotY = toY(val);
	ctx.beginPath();
	ctx.shadowColor = 'rgba(16,185,129,0.9)';
	ctx.shadowBlur  = 10;
	ctx.fillStyle   = '#10b981';
	ctx.arc(w / 2, dotY, 3.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.shadowBlur = 0;

	const label = Math.round(val) + '%';
	ctx.font     = 'bold 9px monospace';
	const tw     = ctx.measureText(label).width;
	ctx.fillStyle = 'rgba(20,20,20,0.85)';
	ctx.beginPath();
	ctx.roundRect(w / 2 + 7, dotY, tw + 10, 17, 3);
	ctx.fill();
	ctx.fillStyle  = '#10b981';
	ctx.textAlign  = 'left';
	ctx.fillText(label, w / 2 + 12, dotY + 11);
}

export function drawThrottleSingle(
	canvas: HTMLCanvasElement | null,
	ds:     DownsampledTrace | null,
	trace:  Trace,
	idx:    number,
	window: ChartWindow
) {
	if (!canvas || !ds || !window.windowSize) return;
	const { ctx, w, h } = setupCanvas(canvas);
	const toY   = (pct: number) => h - (Math.max(0, Math.min(100, pct)) / 100) * h;
	const slots = buildSlots(window.windowSize);
	const slotW = w / (slots.length - 1);
	const ratio = ds.gas.length / (trace.gas.length || 1);
	const dsIdx = Math.round(idx * ratio);

	drawChannel(ctx, slots, slotW, h, dsIdx, i => ds.gas[i]   * 100, ds.gas.length,
		'rgba(16,185,129,0.15)', 'rgba(16,185,129,0.95)');
	drawChannel(ctx, slots, slotW, h, dsIdx, i => ds.brake[i] * 100, ds.brake.length,
		'rgba(239,68,68,0.25)',  'rgba(239,68,68,0.95)');

	ctx.fillStyle = 'rgba(161,161,170,0.6)';
	ctx.font      = '9px monospace';
	ctx.textAlign = 'left';
	ctx.fillText('100%', 3, toY(98) + 10);
	ctx.fillText('0%',   3, toY(2));

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(161,161,170,0.2)';
	ctx.lineWidth   = 1;
	ctx.setLineDash([4, 4]);
	ctx.moveTo(w / 2, 0);
	ctx.lineTo(w / 2, h);
	ctx.stroke();
	ctx.setLineDash([]);
}
