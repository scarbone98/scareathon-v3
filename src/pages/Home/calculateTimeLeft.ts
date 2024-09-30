export function calculateTimeLeft(endDate: Date): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  difference: number;
} {
  const difference = +endDate - +new Date();
  let timeLeft = {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    difference: difference,
  };

  if (difference > 0) {
    timeLeft = {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
      difference: difference,
    };
  }

  return timeLeft;
}
