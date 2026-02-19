import { useEffect, useRef } from "react";

type ShapeType = "eighth" | "double-eighth" | "quarter" | "treble";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  o: number;
  shape: ShapeType;
  rotation: number;
}

const SHAPES: ShapeType[] = ["eighth", "double-eighth", "quarter", "treble"];

function drawEighthNote(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -s * 3);
  ctx.lineWidth = s * 0.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.7, s * 0.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -s * 3);
  ctx.quadraticCurveTo(s * 1.5, -s * 2.2, s * 0.5, -s * 1.2);
  ctx.lineWidth = s * 0.25;
  ctx.stroke();
}

function drawDoubleEighth(ctx: CanvasRenderingContext2D, s: number) {
  const gap = s * 1.4;
  ctx.beginPath();
  ctx.moveTo(-gap / 2, 0);
  ctx.lineTo(-gap / 2, -s * 3);
  ctx.lineWidth = s * 0.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-gap / 2, 0, s * 0.6, s * 0.45, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(gap / 2, s * 0.3);
  ctx.lineTo(gap / 2, -s * 2.7);
  ctx.lineWidth = s * 0.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(gap / 2, s * 0.3, s * 0.6, s * 0.45, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-gap / 2, -s * 3);
  ctx.lineTo(gap / 2, -s * 2.7);
  ctx.lineWidth = s * 0.4;
  ctx.stroke();
}

function drawQuarterNote(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -s * 3);
  ctx.lineWidth = s * 0.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.7, s * 0.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrebleClef(ctx: CanvasRenderingContext2D, s: number) {
  ctx.lineWidth = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(0, -s * 3);
  ctx.lineTo(0, s * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -s * 1.5, s * 0.8, -Math.PI * 0.5, Math.PI * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, s * 0.3, s * 0.6, Math.PI * 0.5, -Math.PI * 0.8, true);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, s * 1.8, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

const drawShape: Record<ShapeType, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  eighth: drawEighthNote,
  "double-eighth": drawDoubleEighth,
  quarter: drawQuarterNote,
  treble: drawTrebleClef,
};

function getAccentHSL(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return raw || "160 84% 39%";
}

const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: Particle[] = [];
    let accentHSL = getAccentHSL();

    const accentInterval = setInterval(() => {
      accentHSL = getAccentHSL();
    }, 1000);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 1.5,
        o: Math.random() * 0.3 + 0.05,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        rotation: Math.random() * Math.PI * 2,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsla(${accentHSL.replace(/%/g, "%")} / ${0.06 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = `hsl(${accentHSL} / ${p.o})`;
        ctx.strokeStyle = `hsl(${accentHSL} / ${p.o})`;
        drawShape[p.shape](ctx, p.size);
        ctx.restore();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(accentInterval);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
};

export default AnimatedBackground;
