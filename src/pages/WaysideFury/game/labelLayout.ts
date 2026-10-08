import type { RenderLabel } from './render';
interface PositionedLabel extends RenderLabel { left: number; bottom: number; width?: number; height?: number }
interface Box { x: number; y: number; width: number; height: number }
const intersects = (a: Box, b: Box) => a.x < b.x + b.width + 5 && a.x + a.width + 5 > b.x && a.y < b.y + b.height + 5 && a.y + a.height + 5 > b.y;

// Lay out native DOM labels without changing their simulation-space anchors.
// Suppress excess edge labels instead of stacking unreadable names over actors.
export function layoutLabels(labels: RenderLabel[], width: number, height: number, top: number, focus?: { x: number; y: number }) {
  const occupied: Box[] = focus ? [{ x: focus.x * width - 30, y: focus.y * height - 76, width: 60, height: 86 }] : [];
  return labels.flatMap<PositionedLabel>(label => {
    if (label.kind === 'floater') return [{ ...label, left: label.x * width, bottom: label.y * height, width: undefined, height: undefined }];
    const w = Math.max(1, Math.min(220, width - 16, label.text.length * 7 + 22));
    // Match the DOM's fixed box. Explicit lines are retained; long names use
    // ellipsis rather than wrapping beyond the space reserved for this label.
    const h = Math.max(28, Math.ceil(label.text.split('\n').length * 14.4 + 12));
    const left = Math.max(8, Math.min(width - w - 8, label.x * width - w / 2));
    const bottom = Math.max(top + h, Math.min(height - 10, label.y * height));
    for (const offset of [0, -34, 34, -68, 68, -102, 102, -136, 136]) {
      const box = { x: left, y: bottom - h + offset, width: w, height: h };
      if (box.y < top || box.y + h > height - 8 || occupied.some(other => intersects(box, other))) continue;
      occupied.push(box);
      return [{ ...label, left: left + w / 2, bottom: box.y + h, width: w, height: h }];
    }
    return [];
  });
}
