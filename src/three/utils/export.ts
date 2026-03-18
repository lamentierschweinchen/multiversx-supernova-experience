import * as THREE from 'three';

// ============================================================
// Export utility — render Three.js canvas to PNG blob
// ============================================================

/**
 * Capture the current Three.js scene as a PNG blob.
 * Renders at specified resolution (default: 2x canvas for retina quality).
 */
export async function exportPNG(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width?: number,
  height?: number,
): Promise<Blob> {
  const canvas = renderer.domElement;
  const targetWidth = width ?? canvas.width * 2;
  const targetHeight = height ?? canvas.height * 2;

  // Store original size
  const originalWidth = canvas.width;
  const originalHeight = canvas.height;
  const originalPixelRatio = renderer.getPixelRatio();

  // Resize to target
  renderer.setPixelRatio(1);
  renderer.setSize(targetWidth, targetHeight, false);

  // Update camera aspect if perspective
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = targetWidth / targetHeight;
    camera.updateProjectionMatrix();
  }

  // Render with preserveDrawingBuffer
  renderer.render(scene, camera);

  // Extract as blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to export canvas to PNG'));
      },
      'image/png',
      1.0,
    );
  });

  // Restore original size
  renderer.setPixelRatio(originalPixelRatio);
  renderer.setSize(originalWidth, originalHeight, false);

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = originalWidth / originalHeight;
    camera.updateProjectionMatrix();
  }

  return blob;
}

/**
 * Trigger a browser download of a Blob as a named file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
