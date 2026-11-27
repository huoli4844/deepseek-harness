/**
 * 录音编码：把浏览器采样转成识别服务接受的 16 kHz 单声道 PCM16 WAV。
 *
 * 边界：只做字节编码与 base64，不访问麦克风。识别服务需要 JSON 传输，
 * 因此最终以不带 data URL 前缀的 base64 提交。
 */

/**
 * 编码单声道浮点采样为 WAV 字节。
 * @param samples - 16 kHz 单声道采样。
 * @returns 完整的 little-endian WAV 字节。
 */
export function encodeWave(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (at: number, value: string): void => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i)
  }
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (const [i, sample] of samples.entries()) {
    const value = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
  }
  return bytes
}

/**
 * 把录音字节编码为 JSON Remote 载体使用的 base64。
 * @param bytes - 完整录音。
 * @returns 不带 data URL 前缀的 base64。
 */
export function audioBase64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}
