/**
 * Deterministic Cartoon Avatar Generator
 * Generates unique SVG avatars from username hash
 * ~200 combinations, no external dependencies
 */

// Simple hash function for deterministic randomness
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Seeded random number generator
class SeededRandom {
  constructor(seed) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }
}

// Avatar component definitions
const SKIN_TONES = [
  '#FFDFC4', '#F0D5BE', '#EECEB3', '#E1B899', '#D7A984',
  '#CA9567', '#A57C5D', '#704139', '#5C3A2E', '#3D2817'
];

const HAIR_STYLES = [
  { type: 'short', path: 'M40,25 Q40,15 50,15 Q60,15 60,25 Z' },
  { type: 'wavy', path: 'M35,25 Q35,12 50,10 Q65,12 65,25 Q62,20 58,22 Q54,18 50,20 Q46,18 42,22 Q38,20 35,25 Z' },
  { type: 'curly', path: 'M38,25 C38,18 42,12 50,12 C58,12 62,18 62,25 L60,23 L58,25 L56,23 L54,25 L52,23 L50,25 L48,23 L46,25 L44,23 L42,25 L40,23 Z' },
  { type: 'spiky', path: 'M40,25 L42,15 L44,25 L46,12 L48,25 L50,10 L52,25 L54,12 L56,25 L58,15 L60,25 Z' },
  { type: 'bald', path: '' }
];

const HAIR_COLORS = [
  '#2C1B18', '#000000', '#4E3524', '#8B4513', '#A0522D',
  '#DEB887', '#FFD700', '#E74C3C', '#9B59B6', '#3498DB'
];

const EYE_STYLES = [
  { left: 'M35,45 Q35,42 38,42 Q41,42 41,45 Q41,48 38,48 Q35,48 35,45 Z',
    right: 'M59,45 Q59,42 62,42 Q65,42 65,45 Q65,48 62,48 Q59,48 59,45 Z' },
  { left: 'M35,45 L41,45 M38,43 L38,47',
    right: 'M59,45 L65,45 M62,43 L62,47' },
  { left: 'M35,45 Q38,42 41,45 Q38,48 35,45',
    right: 'M59,45 Q62,42 65,45 Q62,48 59,45' }
];

const MOUTH_STYLES = [
  'M40,65 Q50,70 60,65',
  'M40,65 Q50,72 60,65',
  'M42,65 L58,65',
  'M40,68 Q50,63 60,68',
  'M42,65 Q50,68 58,65'
];

const ACCESSORIES = [
  null, // No accessory
  { type: 'glasses', path: 'M30,42 L42,42 L42,48 L30,48 Z M58,42 L70,48 L70,42 L58,48 Z M42,45 L58,45' },
  { type: 'hat', path: 'M35,15 L35,20 L65,20 L65,15 Q50,5 35,15 Z' },
  { type: 'earring', path: 'M28,50 Q28,52 30,52 Q32,52 32,50 Q32,48 30,48 Q28,48 28,50 Z' }
];

/**
 * Generate deterministic avatar data from username
 * @param {string} username - User's name
 * @returns {object} Avatar configuration
 */
export function generateAvatarConfig(username) {
  if (!username || typeof username !== 'string') {
    username = 'default';
  }

  const hash = hashCode(username);
  const rng = new SeededRandom(hash);

  return {
    skinTone: rng.pick(SKIN_TONES),
    hairStyle: rng.pick(HAIR_STYLES),
    hairColor: rng.pick(HAIR_COLORS),
    eyeStyle: rng.pick(EYE_STYLES),
    mouthStyle: rng.pick(MOUTH_STYLES),
    accessory: rng.pick(ACCESSORIES)
  };
}

/**
 * Generate SVG avatar JSX component
 * @param {string} username - User's name
 * @param {object} options - Size and className options
 * @returns {JSX.Element} SVG avatar component
 */
export function AvatarSVG({ username, size = 100, className = '' }) {
  const config = generateAvatarConfig(username);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Face */}
      <circle cx="50" cy="50" r="35" fill={config.skinTone} />
      
      {/* Hair */}
      {config.hairStyle.path && (
        <path d={config.hairStyle.path} fill={config.hairColor} />
      )}
      
      {/* Eyes */}
      <path d={config.eyeStyle.left} fill="#2C3E50" />
      <path d={config.eyeStyle.right} fill="#2C3E50" />
      
      {/* Mouth */}
      <path d={config.mouthStyle} stroke="#2C3E50" strokeWidth="2" fill="none" strokeLinecap="round" />
      
      {/* Accessory */}
      {config.accessory && (
        <path d={config.accessory.path} fill="none" stroke="#2C3E50" strokeWidth="2" />
      )}
    </svg>
  );
}

/**
 * Generate avatar as data URL for storage
 * @param {string} username - User's name
 * @returns {string} Data URL of avatar SVG
 */
export function generateAvatarDataURL(username) {
  const config = generateAvatarConfig(username);
  
  const svg = `
    <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="35" fill="${config.skinTone}" />
      ${config.hairStyle.path ? `<path d="${config.hairStyle.path}" fill="${config.hairColor}" />` : ''}
      <path d="${config.eyeStyle.left}" fill="#2C3E50" />
      <path d="${config.eyeStyle.right}" fill="#2C3E50" />
      <path d="${config.mouthStyle}" stroke="#2C3E50" stroke-width="2" fill="none" stroke-linecap="round" />
      ${config.accessory ? `<path d="${config.accessory.path}" fill="none" stroke="#2C3E50" stroke-width="2" />` : ''}
    </svg>
  `.trim();
  
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default {
  generateAvatarConfig,
  AvatarSVG,
  generateAvatarDataURL
};