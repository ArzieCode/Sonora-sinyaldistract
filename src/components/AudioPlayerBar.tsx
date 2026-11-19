import React, { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, Volume2, VolumeX } from 'lucide-react';

interface AudioPlayerBarProps {
  src: string;
  label: string;
  tag?: string;
  downloadFilename?: string;
  onPlaybackProgress?: (timeSec: number | null) => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  src,
  label,
  tag,
  downloadFilename,
  onPlaybackProgress,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [src]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        setCurrentTime(audio.currentTime);
        onPlaybackProgress?.(audio.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, onPlaybackProgress]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const val = Number(e.target.value);
    if (audio) {
      audio.currentTime = val;
    }
    setCurrentTime(val);
    onPlaybackProgress?.(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
      audioRef.current.muted = v === 0;
    }
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    const nextMuted = !isMuted;
    if (audio) {
      audio.muted = nextMuted;
    }
    setIsMuted(nextMuted);
  };

  const fmtTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00.00';
    const mins = Math.floor(sec / 60);
    const rem = (sec % 60).toFixed(2).padStart(5, '0');
    return `${mins}:${rem}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => {
          setIsPlaying(false);
          onPlaybackProgress?.(null);
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-[var(--accent)] bg-[var(--accent)] text-[var(--panel)] transition-opacity hover:opacity-90"
        aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
        ) : (
          <Play className="h-3.5 w-3.5 translate-x-[0.5px]" strokeWidth={1.75} />
        )}
      </button>

      <div className="min-w-[160px] flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate font-medium text-[var(--text-primary)]">
            {label}
            {tag && (
              <span className="ml-1.5 font-mono text-[10px] text-[var(--text-secondary)]">
                [{tag}]
              </span>
            )}
          </span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          aria-label={`Seek ${label}`}
          className="sonora-slider w-full cursor-pointer"
        />
      </div>

      {/* Volume control */}
      <div className="hidden items-center gap-1.5 sm:flex">
        <button
          type="button"
          onClick={toggleMute}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5" strokeWidth={1.6} />
          ) : (
            <Volume2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          aria-label={`Volume for ${label}`}
          className="sonora-slider w-14 cursor-pointer"
        />
      </div>

      {downloadFilename && (
        <a
          href={src}
          download={downloadFilename}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 font-mono text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)] whitespace-nowrap"
        >
          <Download className="h-3 w-3" strokeWidth={1.6} />
          WAV
        </a>
      )}
    </div>
  );
};
