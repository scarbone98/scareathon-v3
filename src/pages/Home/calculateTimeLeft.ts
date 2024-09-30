export function calculateTimeLeft(endDate: Date) {
  const now = new Date();
  const difference = +endDate - +now;
  
  const timeLeft = {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
    difference
  };

  return timeLeft;
}
