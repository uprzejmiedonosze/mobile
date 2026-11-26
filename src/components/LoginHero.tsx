import { Image, useWindowDimensions } from 'react-native';

// Zdjęcie na górze ekranu logowania, od krawędzi do krawędzi (także pod paskiem statusu) – to samo co na stronie www
// (uprzejmiedonosze: src/img/hero.jpg), wbudowane w appkę, więc działa też bez sieci.
const HERO = require('../../assets/login-hero.jpg');
const HERO_ASPECT = 1200 / 903;

export function LoginHero() {
  const { width } = useWindowDimensions();
  return (
    <Image
      source={HERO}
      style={{ width, height: Math.round(width / HERO_ASPECT) }}
      resizeMode="cover"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Furgonetka zaparkowana na chodniku"
    />
  );
}
