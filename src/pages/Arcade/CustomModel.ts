import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function CustomModel(
  loader: GLTFLoader,
  scene: THREE.Scene,
  onLoad: (mixer: THREE.AnimationMixer) => void
) {
  // Load the custom model for the center
  loader.load("/models/AnimationTest.glb", (gltf) => {
    const model = gltf.scene;
    model.scale.set(0.5, 0.5, 0.5); // Adjust scale as needed
    model.position.set(0, 5, 0); // Center of the scene
    scene.add(model);

    // Optional: Add animation if your model has animations
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(gltf.animations[0]);
    action.setDuration(5); // Set the duration to 5 seconds (adjust as needed)
    action.play();
    onLoad(mixer);
  });
}

export default CustomModel;
