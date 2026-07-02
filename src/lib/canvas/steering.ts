import { setupCanvas, buildSlots, distBucket, drawValueLabel, type DownsampledTrace, type Trace, type ChartWindow } from './shared.js';

interface CompLap {
	trace: Trace;
	ds:    DownsampledTrace;
	color: string;
}

function hexToRgb(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return [r, g, b];
}

function drawSteerChannel(
	ctx:         CanvasRenderingContext2D,
	slots:       number[],
	slotW:       number,
	h:           number,
	data:        number[],
	centerIdx:   number,
	fillColor:   string,
	strokeColor: string,
	dashed       = false
) {
	const toY = (v: number) => (h / 2) - (Math.max(-1, Math.min(1, v)) * (h / 2));

	ctx.beginPath();
	ctx.fillStyle = fillColor;
	let started = false;
	for (let s = 0; s < slots.length; s++) {
		const i = centerIdx + slots[s];
		const v = (i >= 0 && i < data.length) ? data[i] : 0;
		started ? ctx.lineTo(s * slotW, toY(v)) : (ctx.moveTo(s * slotW, toY(v)), started = true);
	}
	ctx.lineTo((slots.length - 1) * slotW, h / 2);
	ctx.lineTo(0, h / 2);
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
		const v = (i >= 0 && i < data.length) ? data[i] : 0;
		started ? ctx.lineTo(s * slotW, toY(v)) : (ctx.moveTo(s * slotW, toY(v)), started = true);
	}
	ctx.stroke();
	ctx.setLineDash([]);
}

export function drawSteering(
	canvas:   HTMLCanvasElement | null,
	ds:       DownsampledTrace | null,
	trace:    Trace,
	idx:      number,
	window:   ChartWindow,
	compLaps: CompLap[]
) {
	if (!canvas || !ds || !window.windowSize) return;
	const { ctx, w, h } = setupCanvas(canvas);
	const toY   = (v: number) => (h / 2) - (Math.max(-1, Math.min(1, v)) * (h / 2));
	const slots = buildSlots(window.windowSize);
	const slotW = w / (slots.length - 1);
	const dsIdx = distBucket(trace.normPos[idx] ?? 0, ds.steer.length);

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(255,255,255,0.08)';
	ctx.lineWidth   = 1;
	ctx.moveTo(0, h / 2);
	ctx.lineTo(w, h / 2);
	ctx.stroke();

	drawSteerChannel(ctx, slots, slotW, h, ds.steer, dsIdx,
		'rgba(139,92,246,0.20)', 'rgba(139,92,246,0.90)');

	for (const comp of compLaps) {
		const compDsIdx = dsIdx;
		drawSteerChannel(ctx, slots, slotW, h, comp.ds.steer, compDsIdx,
			'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.45)', true);
	}

	ctx.fillStyle = 'rgba(255,255,255,0.25)';
	ctx.font      = '9px monospace';
	ctx.textAlign = 'left';
	ctx.fillText('L', 3, toY(0.85) + 10);
	ctx.fillText('R', 3, toY(-0.85));

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(255,255,255,0.25)';
	ctx.lineWidth   = 1;
	ctx.setLineDash([4, 4]);
	ctx.moveTo(w / 2, 0);
	ctx.lineTo(w / 2, h);
	ctx.stroke();
	ctx.setLineDash([]);

	const val  = (dsIdx >= 0 && dsIdx < ds.steer.length) ? ds.steer[dsIdx] : 0;
	const dotY = toY(val);
	ctx.beginPath();
	ctx.shadowColor = 'rgba(139,92,246,0.9)';
	ctx.shadowBlur  = 10;
	ctx.fillStyle   = '#8b5cf6';
	ctx.arc(w / 2, dotY, 3.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.shadowBlur = 0;

	const absVal = Math.abs(val * 100);
	const dir    = val > 0.005 ? 'L' : val < -0.005 ? 'R' : '';
	const label  = dir ? `${dir} ${Math.round(absVal)}%` : `${Math.round(absVal)}%`;
	drawValueLabel(ctx, w, h, dotY, label, '#8b5cf6');
}

export function drawSteeringSingle(
	canvas: HTMLCanvasElement | null,
	ds:     DownsampledTrace | null,
	trace:  Trace,
	idx:    number,
	window: ChartWindow,
	color:  string
) {
	if (!canvas || !ds || !window.windowSize) return;
	const { ctx, w, h } = setupCanvas(canvas);
	const slots = buildSlots(window.windowSize);
	const slotW = w / (slots.length - 1);
	const dsIdx = distBucket(trace.normPos[idx] ?? 0, ds.steer.length);

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(161,161,170,0.12)';
	ctx.lineWidth   = 1;
	ctx.moveTo(0, h / 2);
	ctx.lineTo(w, h / 2);
	ctx.stroke();

	const [r, g, b] = color === 'primary' ? [139, 92, 246] : hexToRgb(color);
	drawSteerChannel(ctx, slots, slotW, h, ds.steer, dsIdx,
		`rgba(${r},${g},${b},0.20)`, `rgba(${r},${g},${b},0.90)`);

	ctx.fillStyle = 'rgba(161,161,170,0.6)';
	ctx.font      = '9px monospace';
	ctx.textAlign = 'left';
	const toY = (v: number) => (h / 2) - (Math.max(-1, Math.min(1, v)) * (h / 2));
	ctx.fillText('L', 3, toY(0.85) + 10);
	ctx.fillText('R', 3, toY(-0.85));

	ctx.beginPath();
	ctx.strokeStyle = 'rgba(161,161,170,0.2)';
	ctx.lineWidth   = 1;
	ctx.setLineDash([4, 4]);
	ctx.moveTo(w / 2, 0);
	ctx.lineTo(w / 2, h);
	ctx.stroke();
	ctx.setLineDash([]);
}
