// frontend/src/utils/avatar.js
// DiceBear Avatar System - Utility Functions

const DICEBEAR_VERSION = '7.x';
const AVATAR_STYLE = 'fun-emoji'; // Using fun-emoji for cartoon-style avatars

/**
 * Generate a DiceBear avatar URL from a seed
 * @param {string} seed - Unique seed for avatar generation
 * @returns {string} Complete avatar URL
 */
export const getAvatarUrl = (seed) => {
  if (!seed) {
    console.warn('No seed provided for avatar');
    return getAvatarUrl('default');
  }
  
  return `https://api.dicebear.com/${DICEBEAR_VERSION}/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
};

/**
 * Generate a random seed for avatar
 * @returns {string} Random seed string
 */
export const generateRandomSeed = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Store avatar seed in localStorage
 * @param {string} seed - Avatar seed to store
 */
export const saveAvatarSeed = (seed) => {
  try {
    localStorage.setItem('avatarSeed', seed);
  } catch (error) {
    console.error('Failed to save avatar seed:', error);
  }
};

/**
 * Retrieve avatar seed from localStorage
 * @returns {string|null} Stored avatar seed or null
 */
export const getStoredAvatarSeed = () => {
  try {
    return localStorage.getItem('avatarSeed');
  } catch (error) {
    console.error('Failed to retrieve avatar seed:', error);
    return null;
  }
};

/**
 * Clear stored avatar seed
 */
export const clearAvatarSeed = () => {
  try {
    localStorage.removeItem('avatarSeed');
  } catch (error) {
    console.error('Failed to clear avatar seed:', error);
  }
};

/**
 * Request a unique avatar seed from backend
 * @param {string} quizCode - Quiz room code
 * @param {string} participantId - Participant ID
 * @returns {Promise<string>} Unique avatar seed
 */
export const requestUniqueAvatar = async (quizCode, participantId) => {
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/avatar/unique`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quizCode,
        participantId,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get unique avatar');
    }

    const data = await response.json();
    return data.seed;
  } catch (error) {
    console.error('Error requesting unique avatar:', error);
    // Fallback to random seed if backend fails
    return generateRandomSeed();
  }
};

/**
 * Validate avatar seed format
 * @param {string} seed - Seed to validate
 * @returns {boolean} Whether seed is valid
 */
export const isValidSeed = (seed) => {
  return typeof seed === 'string' && seed.length > 0 && seed.length < 200;
};