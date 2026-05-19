import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

interface TranscriptionResult {
  text: string
  segments: TranscriptionSegment[]
  duration: number
  language: string
}

interface Chapter {
  time: string
  title: string
  duration: string
}

class WhisperService {
  private whisperUrl: string

  constructor() {
    this.whisperUrl = process.env.WHISPER_URL || 'http://localhost:8178'
  }

  async transcribe(filePath: string): Promise<TranscriptionResult> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found: ' + filePath)
      }

      console.log('Transcribing file:', filePath)

      // Use child_process to call curl - most reliable way to send multipart to whisper.cpp
      const { execSync } = require('child_process')
      const curlCmd = `curl -s -X POST "${this.whisperUrl}/inference" \
        -F "file=@${filePath}" \
        -F "temperature=0.0" \
        -F "temperature_inc=0.2" \
        -F "response_format=verbose_json"`

      const resultRaw = execSync(curlCmd, { maxBuffer: 50 * 1024 * 1024, timeout: 300000 }).toString()
      const result = JSON.parse(resultRaw)

      console.log('Transcription complete:', result.text?.length || 0, 'chars')

      // whisper.cpp returns segments with start/end in seconds
      const segments: TranscriptionSegment[] = (result.segments || []).map((seg: any) => ({
        start: seg.start || 0,
        end: seg.end || 0,
        text: (seg.text || '').trim(),
      }))

      const duration = result.duration || (segments.length > 0 ? segments[segments.length - 1].end : 0)

      return {
        text: result.text || segments.map(s => s.text).join(' '),
        segments,
        duration,
        language: result.language || result.detected_language || 'es',
      }
    } catch (error: any) {
      console.error('Whisper transcription error:', error.message)
      throw error
    }
  }

  async transcribeVideo(videoPath: string): Promise<TranscriptionResult> {
    const tempDir = '/tmp/whisper'
    const audioPath = path.join(tempDir, uuidv4() + '.wav')

    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      console.log('Extracting audio from:', videoPath)

      const { execSync } = require('child_process')
      execSync('ffmpeg -i "' + videoPath + '" -vn -acodec pcm_s16le -ar 16000 -ac 1 "' + audioPath + '" -y', {
        stdio: 'pipe',
        timeout: 120000,
      })

      console.log('Audio extracted to:', audioPath)

      const result = await this.transcribe(audioPath)

      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath)
      }

      return result
    } catch (error) {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath)
      }
      throw error
    }
  }

  generateChapters(segments: TranscriptionSegment[]): Chapter[] {
    if (segments.length === 0) return []

    const chapters: Chapter[] = []
    const minChapterDuration = 30
    const maxChapters = 10

    let currentChapterStart = 0
    let currentChapterText = ''

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      currentChapterText += ' ' + segment.text

      const timeSinceLastChapter = segment.start - currentChapterStart
      const isLastSegment = i === segments.length - 1
      const hasTopicChange = this.detectTopicChange(segment.text)

      if ((timeSinceLastChapter >= minChapterDuration && hasTopicChange) || isLastSegment) {
        const duration = segment.end - currentChapterStart
        chapters.push({
          time: this.formatTime(currentChapterStart),
          title: this.generateChapterTitle(currentChapterText),
          duration: this.formatDuration(duration),
        })

        currentChapterStart = segment.end
        currentChapterText = ''
      }

      if (chapters.length >= maxChapters) break
    }

    return chapters
  }

  private detectTopicChange(text: string): boolean {
    const topicIndicators = [
      'ahora', 'siguiente', 'paso', 'primero', 'segundo', 'tercero',
      'después', 'luego', 'finalmente', 'por último', 'continuamos',
    ]
    const lowerText = text.toLowerCase()
    return topicIndicators.some(indicator => lowerText.includes(indicator))
  }

  private generateChapterTitle(text: string): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10)
    if (sentences.length === 0) return 'Capítulo'

    let title = sentences[0].trim()
    if (title.length > 50) {
      title = title.substring(0, 47) + '...'
    }
    return title.charAt(0).toUpperCase() + title.slice(1)
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins + ':' + secs.toString().padStart(2, '0')
  }

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    if (mins === 0) return secs + 's'
    return mins + ':' + secs.toString().padStart(2, '0')
  }

  generateSRT(segments: TranscriptionSegment[]): string {
    return segments.map((segment, index) => {
      const startTime = this.formatSRTTime(segment.start)
      const endTime = this.formatSRTTime(segment.end)
      return (index + 1) + '\n' + startTime + ' --> ' + endTime + '\n' + segment.text + '\n'
    }).join('\n')
  }

  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    return hours.toString().padStart(2, '0') + ':' + mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0') + ',' + ms.toString().padStart(3, '0')
  }
}

export const whisperService = new WhisperService()
export default whisperService
