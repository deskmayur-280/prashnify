/**
 * Persistent device ID stored in localStorage.
 * Used to prevent duplicate sessions from the same device.
 */
export const getDeviceId = () => {
  let id = localStorage.getItem('quiz_device_id');
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('quiz_device_id', id);
  }
  return id;
};
