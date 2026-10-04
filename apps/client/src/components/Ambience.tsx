const PARTICLES = Array.from({ length: 22 }, (_, index) => ({
  id: index,
  left: `${(index * 47) % 97}%`,
  top: `${(index * 31) % 91}%`,
  delay: `${(index % 7) * -0.8}s`,
  duration: `${5 + (index % 5)}s`
}));

export function Ambience() {
  return (
    <div className="ambience" aria-hidden="true">
      <div className="ambience__mist ambience__mist--one" />
      <div className="ambience__mist ambience__mist--two" />
      <div className="ambience__rune" />
      {PARTICLES.map((particle) => (
        <i
          key={particle.id}
          className="ambience__particle"
          style={{
            left: particle.left,
            top: particle.top,
            animationDelay: particle.delay,
            animationDuration: particle.duration
          }}
        />
      ))}
    </div>
  );
}
