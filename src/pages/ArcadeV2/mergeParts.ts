import { Mesh, type BufferGeometry, type Group, type InstancedMesh, type Material, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// A group's fixed parts that share a material, baked into one mesh each: drawn one at a
// time, the little parts (bolts, brackets, louvres, posts) were most of the draw calls,
// and that's what holds a phone's frames up. Only parts that stay put go in: plain meshes
// straight under `group`, no children, shown, not mirrored, and not in `keep` (anything
// that's moved, hidden, swapped or picked out by a tap later on). Materials are shared,
// so anything changed on one (a colour, a flicker) still shows on the merged mesh.
// Returns the merged geometries, for the caller to dispose of.
export function mergeFixedParts(group: Group, keep: Iterable<Object3D> = []): BufferGeometry[] {
  const kept = new Set(keep);
  const runs = new Map<string, Mesh[]>();
  for (const child of group.children) {
    const mesh = child as Mesh;
    if (!mesh.isMesh || (mesh as InstancedMesh).isInstancedMesh || mesh.children.length || kept.has(mesh) || !mesh.visible) continue;
    if (Array.isArray(mesh.material) || (mesh.material as Material).visible === false) continue;
    if (Object.keys(mesh.userData).length || mesh.geometry.morphAttributes.position) continue;
    mesh.updateMatrix();
    if (mesh.matrix.determinant() < 0) continue; // (mirrored: baked in, its faces would turn inside out)
    const geometry = mesh.geometry;
    const key = [mesh.material.uuid, Object.keys(geometry.attributes).sort().join(), geometry.index ? "i" : "-", mesh.renderOrder, mesh.castShadow, mesh.receiveShadow, mesh.frustumCulled, mesh.layers.mask].join("|");
    runs.set(key, [...(runs.get(key) ?? []), mesh]);
  }
  const merged: BufferGeometry[] = [];
  for (const meshes of runs.values()) {
    if (meshes.length < 2) continue;
    const geometry = mergeGeometries(meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrix)));
    if (!geometry) continue;
    const mesh = new Mesh(geometry, meshes[0].material);
    mesh.renderOrder = meshes[0].renderOrder;
    mesh.frustumCulled = meshes[0].frustumCulled;
    meshes.forEach((part) => group.remove(part));
    group.add(mesh);
    merged.push(geometry);
  }
  return merged;
}
