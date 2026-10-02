import type { Camera, Object3D, Scene, WebGLRenderer } from "three";

// renderer.compileAsync, minus its crash: three's version polls each material's program,
// and a material disposed meanwhile (the scene torn down mid-compile: a quick exit, or
// React's dev double-mount) has none left, so the poll throws from a timer and the promise
// never settles. A material with no program here is skipped; anything still in the scene
// gets compiled on the frame that draws it, as it always did.
export function compileShaders(renderer: WebGLRenderer, object: Object3D, camera: Camera, scene: Scene | null = null) {
  const materials = renderer.compile(object, camera, scene);
  return new Promise<void>((resolve) => {
    const check = () => {
      materials.forEach((material) => {
        const program = (renderer.properties.get(material) as { currentProgram?: { isReady(): boolean } }).currentProgram;
        if (!program || program.isReady()) materials.delete(material);
      });
      if (materials.size === 0) resolve();
      else window.setTimeout(check, 10);
    };
    // (Without KHR_parallel_shader_compile, isReady blocks till the program's linked;
    // checking from a timer lets this task end first, as three's does)
    if (renderer.extensions.has("KHR_parallel_shader_compile")) check();
    else window.setTimeout(check, 10);
  });
}
