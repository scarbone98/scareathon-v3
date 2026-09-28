import { Box3, BufferAttribute, BufferGeometry, Mesh, Vector3 } from "three";

// The cabinet model comes as one mesh per material, so all the buttons are a
// single mesh, as are both joysticks' sticks. Split such a mesh into its
// separate pieces, so each can move on its own: triangles sharing a vertex
// position are joined, and pieces whose bounds touch count as one part (a
// button's cap and its rim). Each part is centred on its own origin, in the
// original mesh's place in the tree.
export function splitParts(mesh: Mesh): Mesh[] {
  const parent = mesh.parent;
  if (!parent) return [mesh];
  mesh.updateMatrix();
  const source = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
  const position = source.getAttribute("position");
  const count = position.count;

  const root = Int32Array.from({ length: count }, (_, i) => i);
  const find = (i: number) => {
    while (root[i] !== i) {
      root[i] = root[root[i]];
      i = root[i];
    }
    return i;
  };
  const join = (a: number, b: number) => {
    root[find(a)] = find(b);
  };
  const seen = new Map<string, number>();
  for (let i = 0; i < count; i += 1) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else join(i, first);
    if (i % 3) join(i, i - 1);
  }

  const byRoot = new Map<number, number[]>();
  for (let t = 0; t < count / 3; t += 1) {
    const r = find(t * 3);
    const list = byRoot.get(r);
    if (list) list.push(t);
    else byRoot.set(r, [t]);
  }
  const point = new Vector3();
  let parts = [...byRoot.values()].map((triangles) => {
    const box = new Box3();
    triangles.forEach((t) => {
      for (let k = 0; k < 3; k += 1) box.expandByPoint(point.fromBufferAttribute(position, t * 3 + k));
    });
    return { triangles, box };
  });

  // Pieces whose bounds touch are one part
  source.computeBoundingBox();
  const gap = source.boundingBox!.getSize(new Vector3()).length() * 0.001;
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < parts.length && !merged; i += 1) {
      const grown = parts[i].box.clone().expandByScalar(gap);
      for (let j = i + 1; j < parts.length; j += 1) {
        if (!grown.intersectsBox(parts[j].box)) continue;
        parts[i].triangles.push(...parts[j].triangles);
        parts[i].box.union(parts[j].box);
        parts = parts.filter((_, k) => k !== j);
        merged = true;
        break;
      }
    }
  }

  const meshes = parts.map(({ triangles, box }) => {
    const geometry = new BufferGeometry();
    Object.entries(source.attributes).forEach(([name, attribute]) => {
      const size = attribute.itemSize;
      const array = new Float32Array(triangles.length * 3 * size);
      triangles.forEach((t, n) => {
        for (let k = 0; k < 3; k += 1) {
          for (let c = 0; c < size; c += 1) array[(n * 3 + k) * size + c] = attribute.getComponent(t * 3 + k, c);
        }
      });
      geometry.setAttribute(name, new BufferAttribute(array, size, attribute.normalized));
    });
    const center = box.getCenter(new Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    const part = new Mesh(geometry, mesh.material);
    part.name = mesh.name;
    part.position.copy(center);
    parent.add(part);
    return part;
  });
  parent.remove(mesh);
  mesh.geometry.dispose();
  source.dispose();
  return meshes;
}
