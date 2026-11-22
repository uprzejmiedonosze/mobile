// Leniwie: expo-camera przy imporcie wymaga modułu natywnego, a build bez niego ma działać (poza tym ekranem).
export default function Camera() {
  const { WaitingCameraScreen } = require('../../src/screens/WaitingCameraScreen');
  return <WaitingCameraScreen />;
}
