import React, { useEffect, useRef } from 'react';
import {
  INDIA_MAP_BOUNDS,
  INDIA_BOUNDARY_PATH,
  TELECOM_NODES,
  FIBER_LINKS,
  NODE_DICT
} from './indiaMapData';

export const IndiaTelecomCanvas = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = null;
    let isVisible = true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Pre-parse Path2D object for native high-performance rendering
    let indiaPath2D = null;
    try {
      if (typeof Path2D !== 'undefined') {
        indiaPath2D = new Path2D(INDIA_BOUNDARY_PATH);
      }
    } catch (e) {
      console.warn('Path2D not supported or parse error', e);
    }

    // Screen dimensions & scaling parameters
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Map transformation parameters (from 1000x1150 coordinate space to canvas)
    let mapScale = 1;
    let mapOffsetX = 0;
    let mapOffsetY = 0;

    // Pre-allocated runtime structures for 60fps performance
    // Packets moving along links
    const PACKET_COUNT = window.innerWidth < 768 ? 26 : 48;
    const packets = [];
    const linkCount = FIBER_LINKS.length;

    const packetColors = [
      '#00f5ff', // Electric Cyan
      '#38bdf8', // Sky Blue
      '#818cf8', // Indigo
      '#c084fc', // Purple
      '#f43f5e', // Neon Rose/Pink
      '#34d399', // Emerald
      '#fbbf24'  // Amber
    ];

    for (let i = 0; i < PACKET_COUNT; i++) {
      const linkIdx = i % linkCount;
      const [fromId, toId] = FIBER_LINKS[linkIdx];
      packets.push({
        fromId,
        toId,
        progress: Math.random(),
        speed: 0.0035 + Math.random() * 0.0065,
        color: packetColors[i % packetColors.length],
        size: 2.2 + Math.random() * 1.6,
        tail: 5
      });
    }

    // Floating background ambient particles
    const PARTICLE_COUNT = window.innerWidth < 768 ? 25 : 60;
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0003,
        vy: -0.00015 - Math.random() * 0.0004,
        size: 1 + Math.random() * 2.2,
        alpha: 0.2 + Math.random() * 0.5,
        pulseSpeed: 0.02 + Math.random() * 0.03,
        pulseVal: Math.random() * Math.PI * 2
      });
    }

    // Node pulse states
    const nodeStateMap = {};
    TELECOM_NODES.forEach((n, idx) => {
      nodeStateMap[n.id] = {
        phase: (idx * 0.4) % (Math.PI * 2),
        speed: 0.028 + (idx % 6) * 0.007,
        pingRadius: 0,
        pingActive: false,
        pingMax: n.tier === 1 ? 36 : 22,
        pingSpeed: 0.45 + Math.random() * 0.35
      };
    });

    // Random periodic pings from major hubs
    let lastPingTime = 0;

    // Resize and recalculate map viewport transform
    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const isDesktop = width >= 1024;
      const isTablet = width >= 768 && width < 1024;

      // Allow map to occupy a prominent, visible portion of the viewport
      const availWidth = isDesktop ? width * 0.72 : width * 0.95;
      const availHeight = height * 0.92;

      const scaleX = availWidth / INDIA_MAP_BOUNDS.viewWidth;
      const scaleY = availHeight / INDIA_MAP_BOUNDS.viewHeight;
      mapScale = Math.min(scaleX, scaleY);

      if (isDesktop) {
        // Positioned spanning the center and center-left
        mapOffsetX = Math.max(10, width * 0.06 + (availWidth - INDIA_MAP_BOUNDS.viewWidth * mapScale) / 2);
        mapOffsetY = (height - INDIA_MAP_BOUNDS.viewHeight * mapScale) / 2;
      } else if (isTablet) {
        mapOffsetX = (width - INDIA_MAP_BOUNDS.viewWidth * mapScale) / 2;
        mapOffsetY = (height - INDIA_MAP_BOUNDS.viewHeight * mapScale) / 2;
      } else {
        // Mobile: center
        mapOffsetX = (width - INDIA_MAP_BOUNDS.viewWidth * mapScale) / 2;
        mapOffsetY = Math.max(10, (height - INDIA_MAP_BOUNDS.viewHeight * mapScale) * 0.35);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Transform coordinate from 1000x1150 map space to screen pixels
    const toScreen = (mapX, mapY) => {
      return [
        mapOffsetX + mapX * mapScale,
        mapOffsetY + mapY * mapScale
      ];
    };

    // Main animation loop
    let lastTime = performance.now();

    const render = (time) => {
      try {
        if (!isVisible) {
          animId = requestAnimationFrame(render);
          return;
        }

        const dt = Math.min(time - lastTime, 60);
        lastTime = time;

      // 1. Reset transform matrix on every frame to guarantee scale NEVER accumulates!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // 2. Base Dark Navy Background
      ctx.fillStyle = '#06111f';
      ctx.fillRect(0, 0, width, height);

      // 3. Ambient Radial Nebula Glows behind key telecom corridors
      const [delX, delY] = toScreen(NODE_DICT.DEL?.x || 325, NODE_DICT.DEL?.y || 358);
      const [mumX, mumY] = toScreen(NODE_DICT.MUM?.x || 189, NODE_DICT.MUM?.y || 696);
      const [blrX, blrY] = toScreen(NODE_DICT.BLR?.x || 337, NODE_DICT.BLR?.y || 913);

      // North Central Nebula Glow (Cyan / Teal)
      if (!isNaN(delX) && !isNaN(delY)) {
        const rNorth = Math.max(10, mapScale * 420);
        const gradNorth = ctx.createRadialGradient(delX, delY, 10, delX, delY, rNorth);
        gradNorth.addColorStop(0, 'rgba(6, 182, 212, 0.16)');
        gradNorth.addColorStop(0.5, 'rgba(14, 116, 144, 0.07)');
        gradNorth.addColorStop(1, 'rgba(6, 17, 31, 0)');
        ctx.fillStyle = gradNorth;
        ctx.fillRect(0, 0, width, height);
      }

      // West Coast / Mumbai Nebula Glow (Indigo / Purple)
      if (!isNaN(mumX) && !isNaN(mumY)) {
        const rWest = Math.max(10, mapScale * 380);
        const gradWest = ctx.createRadialGradient(mumX, mumY, 10, mumX, mumY, rWest);
        gradWest.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
        gradWest.addColorStop(0.5, 'rgba(79, 70, 229, 0.06)');
        gradWest.addColorStop(1, 'rgba(6, 17, 31, 0)');
        ctx.fillStyle = gradWest;
        ctx.fillRect(0, 0, width, height);
      }

      // South Tech Corridor Nebula Glow (Cyan / Violet)
      if (!isNaN(blrX) && !isNaN(blrY)) {
        const rSouth = Math.max(10, mapScale * 340);
        const gradSouth = ctx.createRadialGradient(blrX, blrY, 10, blrX, blrY, rSouth);
        gradSouth.addColorStop(0, 'rgba(168, 85, 247, 0.14)');
        gradSouth.addColorStop(0.6, 'rgba(6, 182, 212, 0.04)');
        gradSouth.addColorStop(1, 'rgba(6, 17, 31, 0)');
        ctx.fillStyle = gradSouth;
        ctx.fillRect(0, 0, width, height);
      }

      // 4. Subtle Latitude/Longitude Coordinate Grid
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 64;
      for (let x = (mapOffsetX % gridSize); x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = (mapOffsetY % gridSize); y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // 5. Ambient Floating Stardust Particles
      ctx.save();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.pulseVal += p.pulseSpeed;

        if (p.x < 0) p.x += 1;
        if (p.x > 1) p.x -= 1;
        if (p.y < 0) p.y += 1;
        if (p.y > 1) p.y -= 1;

        const currentAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulseVal));
        const px = p.x * width;
        const py = p.y * height;

        ctx.fillStyle = `rgba(56, 189, 248, ${currentAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 6. Draw India Map Silhouette & Vibrant Glowing Neon Borders
      ctx.save();
      ctx.translate(mapOffsetX, mapOffsetY);
      ctx.scale(mapScale, mapScale);

      if (indiaPath2D) {
        // Map Interior Fill (Dark cyber-landmass with subtle gradient)
        const landGrad = ctx.createLinearGradient(100, 50, 800, 1100);
        landGrad.addColorStop(0, 'rgba(8, 28, 56, 0.65)');
        landGrad.addColorStop(0.5, 'rgba(6, 22, 45, 0.75)');
        landGrad.addColorStop(1, 'rgba(10, 26, 52, 0.65)');
        ctx.fillStyle = landGrad;
        ctx.fill(indiaPath2D);

        // Multi-layered Neon Glowing Border
        const sw = (px) => Math.max(0.8, px / mapScale);

        // Outer wide soft glow
        ctx.save();
        ctx.shadowColor = '#00f5ff';
        ctx.shadowBlur = 18 / mapScale;
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.45)';
        ctx.lineWidth = sw(3.6);
        ctx.stroke(indiaPath2D);
        ctx.restore();

        // Mid vibrant glow
        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8 / mapScale;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = sw(2.0);
        ctx.stroke(indiaPath2D);
        ctx.restore();

        // Core crisp neon boundary
        const neonBorderGrad = ctx.createLinearGradient(200, 50, 750, 1050);
        neonBorderGrad.addColorStop(0, '#00f5ff'); // North: Cyan
        neonBorderGrad.addColorStop(0.35, '#38bdf8'); // West: Sky Blue
        neonBorderGrad.addColorStop(0.65, '#818cf8'); // Deccan: Indigo
        neonBorderGrad.addColorStop(1, '#c084fc'); // South: Violet

        ctx.save();
        ctx.shadowColor = '#00f5ff';
        ctx.shadowBlur = 4 / mapScale;
        ctx.strokeStyle = neonBorderGrad;
        ctx.lineWidth = sw(1.5);
        ctx.stroke(indiaPath2D);
        ctx.restore();
      }
      ctx.restore();

      // 7. Draw Optical Fiber Connection Links
      ctx.save();
      for (let i = 0; i < FIBER_LINKS.length; i++) {
        const [idA, idB] = FIBER_LINKS[i];
        const nA = NODE_DICT[idA];
        const nB = NODE_DICT[idB];
        if (!nA || !nB) continue;

        const [x1, y1] = toScreen(nA.x, nA.y);
        const [x2, y2] = toScreen(nB.x, nB.y);

        const isSubsea = nA.subsea || nB.subsea;
        const isGoldenRing = (nA.tier === 1 && nB.tier === 1);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        if (isSubsea) {
          ctx.save();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([6, 4]);
          ctx.shadowColor = '#f43f5e';
          ctx.shadowBlur = 6;
          ctx.stroke();
          ctx.restore();
        } else if (isGoldenRing) {
          // National Super-Highway Backbone with vibrant cyan glow
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 245, 255, 0.6)';
          ctx.lineWidth = 1.8;
          ctx.shadowColor = '#00f5ff';
          ctx.shadowBlur = 8;
          ctx.setLineDash([]);
          ctx.stroke();
          ctx.restore();
        } else {
          // Regional Interconnects
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([]);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 8. Animate & Render Moving Data Transmission Packets
      ctx.save();
      for (let i = 0; i < packets.length; i++) {
        const pkt = packets[i];
        pkt.progress += pkt.speed;
        if (pkt.progress >= 1) {
          pkt.progress = 0;
          if (Math.random() > 0.45) {
            const nextLink = Math.floor(Math.random() * linkCount);
            pkt.fromId = FIBER_LINKS[nextLink][0];
            pkt.toId = FIBER_LINKS[nextLink][1];
          }
        }

        const nA = NODE_DICT[pkt.fromId];
        const nB = NODE_DICT[pkt.toId];
        if (!nA || !nB) continue;

        const [x1, y1] = toScreen(nA.x, nA.y);
        const [x2, y2] = toScreen(nB.x, nB.y);

        const currX = x1 + (x2 - x1) * pkt.progress;
        const currY = y1 + (y2 - y1) * pkt.progress;

        // Packet head with bright glow
        ctx.fillStyle = pkt.color;
        ctx.shadowColor = pkt.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(currX, currY, pkt.size, 0, Math.PI * 2);
        ctx.fill();

        // Laser speed comet tail
        const tailP = Math.max(0, pkt.progress - 0.08);
        const tailX = x1 + (x2 - x1) * tailP;
        const tailY = y1 + (y2 - y1) * tailP;

        const tailGrad = ctx.createLinearGradient(currX, currY, tailX, tailY);
        tailGrad.addColorStop(0, pkt.color);
        tailGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.strokeStyle = tailGrad;
        ctx.lineWidth = pkt.size * 0.95;
        ctx.beginPath();
        ctx.moveTo(currX, currY);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }
      ctx.restore();

      // 9. Periodic Ping Waves from Major Telecom Hubs
      if (time - lastPingTime > 2200) {
        lastPingTime = time;
        const majorHubs = ['DEL', 'MUM', 'BLR', 'HYD', 'MAA', 'CCU', 'AMD', 'GAU'];
        const chosen = majorHubs[Math.floor(Math.random() * majorHubs.length)];
        if (nodeStateMap[chosen]) {
          nodeStateMap[chosen].pingActive = true;
          nodeStateMap[chosen].pingRadius = 4;
        }
      }

      // 10. Draw Telecom Network Nodes with Pulse Waves & Labels
      ctx.save();
      for (let i = 0; i < TELECOM_NODES.length; i++) {
        const node = TELECOM_NODES[i];
        const st = nodeStateMap[node.id];
        if (!st) continue;

        st.phase += st.speed;
        const [sx, sy] = toScreen(node.x, node.y);

        const isT1 = node.tier === 1;
        const isT2 = node.tier === 2;

        const baseRadius = isT1 ? 5.2 : (isT2 ? 3.6 : 2.6);
        const pulseFactor = 0.85 + 0.3 * Math.sin(st.phase);
        const radius = baseRadius * pulseFactor;

        // Active Hub Ping Wave Animation
        if (st.pingActive) {
          st.pingRadius += st.pingSpeed;
          const pingAlpha = Math.max(0, 1 - st.pingRadius / st.pingMax);
          if (pingAlpha <= 0) {
            st.pingActive = false;
            st.pingRadius = 0;
          } else {
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx, sy, st.pingRadius, 0, Math.PI * 2);
            ctx.strokeStyle = isT1 ? `rgba(0, 245, 255, ${pingAlpha * 0.8})` : `rgba(168, 85, 247, ${pingAlpha * 0.7})`;
            ctx.lineWidth = 1.8;
            ctx.shadowColor = isT1 ? '#00f5ff' : '#a855f7';
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.restore();
          }
        }

        // Node Glow Halo
        const glowRadius = radius * (isT1 ? 4.2 : 3.0);
        const nodeGrad = ctx.createRadialGradient(sx, sy, 1, sx, sy, glowRadius);
        if (isT1) {
          nodeGrad.addColorStop(0, 'rgba(0, 245, 255, 0.9)');
          nodeGrad.addColorStop(0.4, 'rgba(6, 182, 212, 0.45)');
          nodeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else if (node.landing) {
          nodeGrad.addColorStop(0, 'rgba(244, 63, 94, 0.9)');
          nodeGrad.addColorStop(0.4, 'rgba(225, 29, 72, 0.4)');
          nodeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          nodeGrad.addColorStop(0, 'rgba(129, 140, 248, 0.85)');
          nodeGrad.addColorStop(0.4, 'rgba(99, 102, 241, 0.35)');
          nodeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }

        ctx.fillStyle = nodeGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Node Solid Core
        ctx.fillStyle = isT1 ? '#00f5ff' : (node.landing ? '#f43f5e' : '#a5b4fc');
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();

        // White Center Hotspot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // City labels for all verified nodes with collision-free placement
        const shouldShowLabel = width >= 960 || isT1 || ['AMD', 'GAU', 'JAI', 'LKO', 'COK', 'SXR', 'HYD'].includes(node.id);
        if (shouldShowLabel) {
          const fontSize = isT1
            ? Math.max(10, Math.min(12, Math.round(11 * (width / 1440))))
            : Math.max(8.5, Math.min(10.5, Math.round(9.5 * (width / 1440))));
          ctx.font = `${isT1 ? '700' : '500'} ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillStyle = isT1 ? '#ffffff' : 'rgba(215, 226, 240, 0.9)';

          const offsetDist = radius + 6;
          let textOffsetX = sx;
          let textOffsetY = sy;
          let textAlign = 'left';

          switch (node.labelPos) {
            case 'left':
              textOffsetX = sx - offsetDist;
              textOffsetY = sy + 3.5;
              textAlign = 'right';
              break;
            case 'right':
              textOffsetX = sx + offsetDist;
              textOffsetY = sy + 3.5;
              textAlign = 'left';
              break;
            case 'top':
              textOffsetX = sx;
              textOffsetY = sy - offsetDist - 2;
              textAlign = 'center';
              break;
            case 'bottom':
              textOffsetX = sx;
              textOffsetY = sy + offsetDist + 8;
              textAlign = 'center';
              break;
            case 'top-left':
              textOffsetX = sx - offsetDist;
              textOffsetY = sy - 4;
              textAlign = 'right';
              break;
            case 'top-right':
              textOffsetX = sx + offsetDist;
              textOffsetY = sy - 4;
              textAlign = 'left';
              break;
            case 'bottom-left':
              textOffsetX = sx - offsetDist;
              textOffsetY = sy + 10;
              textAlign = 'right';
              break;
            case 'bottom-right':
              textOffsetX = sx + offsetDist;
              textOffsetY = sy + 10;
              textAlign = 'left';
              break;
            default:
              textOffsetX = sx + offsetDist;
              textOffsetY = sy + 3.5;
              textAlign = 'left';
          }

          ctx.save();
          ctx.textAlign = textAlign;
          ctx.shadowColor = '#06111f';
          ctx.shadowBlur = 8;
          ctx.fillText(node.name, textOffsetX, textOffsetY);
          ctx.restore();
        }
      }
      ctx.restore();

      } catch (err) {
        console.error('Canvas render loop error:', err);
      }

      if (!reducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    // Tab visibility handling: pause render when tab inactive
    const handleVisibility = () => {
      isVisible = !document.hidden;
      if (isVisible && !reducedMotion) {
        lastTime = performance.now();
        animId = requestAnimationFrame(render);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    // Initial render call
    animId = requestAnimationFrame(render);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="telecom-network-canvas"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 1,
        pointerEvents: 'none',
        display: 'block'
      }}
    />
  );
};

export default IndiaTelecomCanvas;
