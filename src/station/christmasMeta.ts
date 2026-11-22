// Measurements of the Christmas models (written by art/station/build_christmas.py into
// art/station/christmas_meta.json, copied here): where christmas.ts hangs the tree's lights,
// the bulbs along each garland swag, and the candles' flames (each relative to its prop's origin)
export const CHRISTMAS_META = {
  tree: { height: 2.05, baseY: 0.36, baseRadius: 0.442, topY: 1.83, starY: 1.93 },
  swagLength: 1.5,
  swagBulbs: [
    [0.125, -0.127, 0.261],
    [0.375, -0.226, 0.256],
    [0.625, -0.283, 0.247],
    [0.875, -0.283, 0.245],
    [1.125, -0.226, 0.241],
    [1.375, -0.127, 0.234],
  ] as [number, number, number][],
  candleWicks: [
    [-0.05, 0.251, -0.025],
    [0.05, 0.191, -0.03],
    [0, 0.151, 0.06],
  ] as [number, number, number][],
};
