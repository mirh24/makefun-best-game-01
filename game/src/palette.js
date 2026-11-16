// The look plan in one place. NIGHTSHIFT TERMINAL is a container port at
// night: deep navy sky, cold steel, amber floodlights and a cyan accent that
// reads as the site glow. The same names are the CSS custom properties in
// index.html; the two team colours are the only extra entries.
export const PALETTE = {
  canvas: '#0b1220', // night sky and fog
  surface: '#1a2233', // ground and big walls
  hairline: '#2e3d55', // crates, containers, cover
  ink: '#e8f0f8', // light surfaces and HUD text
  muted: '#8ba0b8', // dim text and distant detail
  accent: '#ffb02e', // floodlights, muzzle flash, highlights
  cyan: '#37d3e0', // site glow, objective markers
  steel: '#4a5a70', // containers and barrels
  sand: '#d8b25e', // ground patches and money
  teamBlue: '#3fa9f5', // ORBIT, the attackers (the player)
  teamRed: '#ff5a3c', // UMBRA, the defenders
};

export function shade(name) {
  return PALETTE[name];
}
