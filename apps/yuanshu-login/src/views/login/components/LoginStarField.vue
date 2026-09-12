<template>
  <canvas ref="canvasRef" class="star-field" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animId = 0

interface Star {
  x: number
  y: number
  baseX: number
  baseY: number
  r: number
  alphaBase: number
  twinkleSpeed: number
  twinklePhase: number
  driftAmt: number
  driftSpeed: number
  driftPhaseX: number
  driftPhaseY: number
}

interface Connection {
  from: number
  to: number
  normDist: number
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  speed: number
  len: number
  spawnTime: number
  duration: number
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let W = 0
  let H = 0
  let stars: Star[] = []
  let connections: Connection[] = []
  const meteors: Meteor[] = []
  let nextMeteorTime = 8 + Math.random() * 10
  let mouseX = -9999
  let mouseY = -9999

  function resize() {
    W = window.innerWidth
    H = window.innerHeight
    canvas!.width = W
    canvas!.height = H
    initStars()
  }

  function initStars() {
    const count = Math.min(Math.floor((W * H) / 8000), 200)
    stars = []
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      stars.push({
        x, y, baseX: x, baseY: y,
        r: 0.6 + Math.random() * 3.0,
        alphaBase: 0.2 + Math.random() * 0.8,
        twinkleSpeed: 0.2 + Math.random() * 0.6,
        twinklePhase: Math.random() * Math.PI * 2,
        driftAmt: 6 + Math.random() * 22,
        driftSpeed: 0.06 + Math.random() * 0.18,
        driftPhaseX: Math.random() * Math.PI * 2,
        driftPhaseY: Math.random() * Math.PI * 2,
      })
    }
    buildConnections()
  }

  function buildConnections() {
    const maxDist = Math.min(W, H) * 0.18
    connections = []
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].baseX - stars[j].baseX
        const dy = stars[i].baseY - stars[j].baseY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < maxDist && Math.random() < 0.30) {
          connections.push({ from: i, to: j, normDist: dist / maxDist })
        }
      }
    }
  }

  function spawnMeteor(currentTime: number, index: number = 0) {
    const baseAngle = (Math.random() * 0.5 + 0.25) * Math.PI
    const spread = (index - 1) * 0.08
    const angle = Math.min(Math.max(baseAngle + spread, 0.15 * Math.PI), 0.85 * Math.PI)
    const speed = 300 + Math.random() * 250
    const margin = 40
    const side = Math.floor(Math.random() * 3)
    let x: number, y: number
    if (side === 0) {
      x = Math.random() * (W + margin * 2) - margin
      y = -margin
    } else if (side === 1) {
      x = W + margin
      y = Math.random() * H * 0.5
    } else {
      x = -margin
      y = Math.random() * H * 0.5
    }
    meteors.push({
      x, y,
      vx: Math.cos(angle) * speed * (side === 2 ? 1 : side === 1 ? -1 : (Math.random() > 0.5 ? 1 : -1)),
      vy: Math.sin(angle) * speed,
      life: 1,
      speed,
      len: 80 + Math.random() * 60,
      spawnTime: currentTime,
      duration: 0.6 + Math.random() * 0.6,
    })
  }

  function draw(time: number) {
    if (!ctx) return
    const t = time * 0.001

    ctx.clearRect(0, 0, W, H)

    // 1) Update stars position
    for (const s of stars) {
      const driftX = Math.sin(t * s.driftSpeed + s.driftPhaseX) * s.driftAmt
      const driftY = Math.cos(t * s.driftSpeed * 0.7 + s.driftPhaseY) * s.driftAmt * 0.7
      s.x = s.baseX + driftX
      s.y = s.baseY + driftY
    }

    // 2) Draw connections
    const brandColor = '#2468f2'

    for (const c of connections) {
      const a = stars[c.from]
      const b = stars[c.to]
      const dx = a.x - b.x
      const dy = a.y - b.y
      const curDist = Math.sqrt(dx * dx + dy * dy)
      const maxDist = Math.min(W, H) * 0.3
      if (curDist > maxDist) continue

      const distFactor = (1 - c.normDist) * (1 - curDist / maxDist)
      const wave = 0.5 + 0.5 * Math.sin(t * 0.25 + (a.x + b.y) * 0.004)
      const opacity = distFactor * 0.4 * wave

      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = brandColor
      ctx.globalAlpha = Math.max(0, opacity)
      ctx.lineWidth = 0.5
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // 3) Draw stars
    for (const s of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed * Math.PI * 2 + s.twinklePhase)
      const alpha = s.alphaBase * (0.3 + 0.7 * twinkle)

      if (s.r > 1.2) {
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4)
        glow.addColorStop(0, `rgba(100, 140, 255, ${alpha * 0.2})`)
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    // 4) Mouse glow
    if (mouseX > 0 && mouseY > 0) {
      const gradient = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 200)
      gradient.addColorStop(0, `rgba(100, 140, 255, 0.03)`)
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(mouseX, mouseY, 200, 0, Math.PI * 2)
      ctx.fill()
    }

    // 5) Meteors
    if (t >= nextMeteorTime && meteors.length === 0) {
      const count = 2 + Math.floor(Math.random() * 5)
      for (let k = 0; k < count; k++) {
        spawnMeteor(t, k)
      }
      nextMeteorTime = t + 10 + Math.random() * 20
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]
      const age = t - m.spawnTime
      const duration = m.duration
      m.life = Math.max(0, 1 - age / duration)
      if (m.life <= 0) {
        meteors.splice(i, 1)
        continue
      }
      m.x += m.vx * 0.016
      m.y += m.vy * 0.016

      const fade = m.life < 0.3
        ? m.life / 0.3
        : m.life > 0.7
          ? (1 - m.life) / 0.3 + 0.4
          : 1.0
      const headAlpha = fade * 0.9

      const tailLen = m.len * (0.3 + 0.7 * m.life)
      const nx = m.vx / Math.sqrt(m.vx * m.vx + m.vy * m.vy)
      const ny = m.vy / Math.sqrt(m.vx * m.vx + m.vy * m.vy)
      const grad = ctx.createLinearGradient(
        m.x, m.y,
        m.x - nx * tailLen, m.y - ny * tailLen
      )
      grad.addColorStop(0, `rgba(160, 190, 255, ${headAlpha})`)
      grad.addColorStop(0.3, `rgba(120, 160, 255, ${headAlpha * 0.4})`)
      grad.addColorStop(1, 'transparent')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.2 + m.life * 1.0
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.moveTo(m.x, m.y)
      ctx.lineTo(m.x - nx * tailLen, m.y - ny * tailLen)
      ctx.stroke()

      const headGlow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 6)
      headGlow.addColorStop(0, `rgba(200, 220, 255, ${headAlpha * 0.6})`)
      headGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = headGlow
      ctx.beginPath()
      ctx.arc(m.x, m.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }

    animId = requestAnimationFrame(draw)
  }

  function onMouseMove(e: MouseEvent) {
    mouseX = e.clientX
    mouseY = e.clientY
  }

  function onMouseLeave() {
    mouseX = -9999
    mouseY = -9999
  }

  window.addEventListener('resize', resize)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseleave', onMouseLeave)
  resize()
  animId = requestAnimationFrame(draw)

  onBeforeUnmount(() => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseleave', onMouseLeave)
  })
})
</script>

<style scoped>
.star-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}
</style>
