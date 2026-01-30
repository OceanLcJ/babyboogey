'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

interface MouseSpotlightProps {
  size?: number;
  color?: string;
  opacity?: number;
}

export function MouseSpotlight({
  size = 600,
  color = 'rgba(120, 119, 198, 0.12)',
  opacity = 1,
}: MouseSpotlightProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const mouseX = useMotionValue(-size);
  const mouseY = useMotionValue(-size);

  const springConfig = { damping: 30, stiffness: 150, mass: 0.5 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  useEffect(() => {
    const hasHover = window.matchMedia('(hover: hover)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!hasHover || prefersReducedMotion) return;

    setIsEnabled(true);

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX - size / 2);
      mouseY.set(e.clientY - size / 2);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY, size]);

  if (!isEnabled) return null;

  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-30 select-none rounded-full"
      style={{
        x,
        y,
        opacity,
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        willChange: 'transform',
      }}
      aria-hidden="true"
    />
  );
}
