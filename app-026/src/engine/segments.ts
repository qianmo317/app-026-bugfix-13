import type { Script } from '../types'
import type { ScrollEngine } from './scroller'

export interface SegRange {
  /** 对应 script.segments 中的段 id；全篇兜底段为 '__all__' */
  id: string
  title: string
  start: number
  end: number // 不含
  loop?: boolean
  lineIds: string[]
}

const ALL_ID = '__all__'

/**
 * 计算各唱段在行数组中的起止范围。
 * 传入 filter 时，行数组是“过滤后”的数组（例如只保留某一角色的行），
 * 返回的 start/end 会映射到过滤后的压缩行号空间（引擎/虚拟列表使用的行号），
 * lineIds 也只保留过滤后剩下的行。
 */
export function segmentRanges(script: Script, filter?: (idx: number) => boolean): SegRange[] {
  // 原始行号 -> 过滤后行号
  const remap = new Map<number, number>()
  if (filter) {
    let k = 0
    script.lines.forEach((_, i) => {
      if (filter(i)) remap.set(i, k++)
    })
  }

  const indexOfLine = new Map(script.lines.map((l, i) => [l.id, i] as const))

  const out: SegRange[] = []
  for (const seg of script.segments) {
    // 保留段内原顺序，过滤掉本角色没有的行
    const kept = seg.lineIds
      .map((id, pos) => ({ id, orig: indexOfLine.get(id), pos }))
      .filter((x): x is { id: string; orig: number; pos: number } => x.orig !== undefined && (!filter || filter(x.orig)))
    if (kept.length === 0) continue
    kept.sort((a, b) => a.pos - b.pos)
    const compact = kept.map((x) => (filter ? remap.get(x.orig)! : x.orig))
    out.push({
      id: seg.id,
      title: seg.title,
      start: compact[0],
      end: compact[compact.length - 1] + 1,
      loop: seg.loop,
      lineIds: filter ? kept.map((x) => x.id) : seg.lineIds,
    })
  }

  if (out.length === 0 && script.lines.length > 0) {
    // 无段定义或该角色一句都没有：全篇兜底（行号空间与 filter 一致）
    const n = filter ? remap.size : script.lines.length
    if (n > 0) {
      out.push({
        id: ALL_ID,
        title: '全篇',
        start: 0,
        end: n,
        lineIds: filter ? script.lines.filter((_, i) => filter!(i)).map((l) => l.id) : script.lines.map((l) => l.id),
      })
    }
  }
  return out
}

/** 按段 id 在分栏两侧找到同一段；找不到（该角色在此段无台词）返回 -1 */
export function rangeIndexById(ranges: SegRange[], id: string): number {
  return ranges.findIndex((r) => r.id === id)
}

/** 跳转到第 k 段（保持播放状态），自动应用该段的循环标记 */
export function jumpToSegment(engine: ScrollEngine, ranges: SegRange[], k: number): boolean {
  if (!ranges.length) return false
  const kk = Math.max(0, Math.min(ranges.length - 1, k))
  const wasPlaying = engine.state === 'playing'
  engine.seekIndex(ranges[kk].start)
  if (wasPlaying) engine.play()
  const r = ranges[kk]
  engine.setLoopRange(r.loop ? { startPos: engine.posForIndex(r.start), endPos: engine.posForIndex(r.end) } : null)
  return true
}
