export const generateResultCard = async ({ name, rank, score, accuracy, quizTitle, totalPlayers }) => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');

  // Purple gradient background
  const grad = ctx.createLinearGradient(0, 0, 800, 420);
  grad.addColorStop(0, '#46178F');
  grad.addColorStop(1, '#7C3AED');
  ctx.fillStyle = grad;
  ctx.roundRect(0, 0, 800, 420, 20);
  ctx.fill();

  // Decorative circles
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath(); ctx.arc(700, 80, 120, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(100, 360, 80, 0, Math.PI * 2); ctx.fill();

  // Name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 44px Arial, sans-serif';
  ctx.fillText(name, 50, 90);

  // Rank & score
  ctx.fillStyle = '#FCD34D';
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillText(`🏆 Rank #${rank} of ${totalPlayers}`, 50, 155);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 52px Arial, sans-serif';
  ctx.fillText(`${score} points`, 50, 225);

  // Accuracy
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '28px Arial, sans-serif';
  ctx.fillText(`${accuracy}% accuracy`, 50, 275);

  // Quiz title
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText(quizTitle || 'Prashnify', 50, 340);

  // Branding
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText('Played on Prashnify', 50, 390);

  return canvas.toDataURL('image/png');
};
