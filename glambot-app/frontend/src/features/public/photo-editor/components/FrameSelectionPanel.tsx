'use client';

import { useMemo, useState } from 'react';
import GlassCard from '@/components/shared/GlassCard';
import type { Frame } from '../api/getFrames';
import type { FilterType } from '../pages/PhotoEditorPage';

// Right panel with tabs for frame and filter selection
type TabType = 'frame' | 'filter';

const tabs: { id: TabType; label: string }[] = [
  { id: 'frame', label: 'Frame' },
  { id: 'filter', label: 'Filter' },
];

// Static filter list — keep order in sync with `lib/filters.ts` getFiltersByType.
// `swatch` = dua warna gradasi yang mewakili tone filter, dipakai kotak info
// warna di sisi kanan tiap baris (bukan hasil render asli, hanya petunjuk cepat).
const FILTER_OPTIONS: {
  id: FilterType;
  name: string;
  swatch: [string, string];
}[] = [
  { id: 'original', name: 'Original', swatch: ['#F9F7F7', '#B0B7C3'] },
  { id: 'warm', name: 'Warm', swatch: ['#FFD9A0', '#F0A868'] },
  { id: 'cool', name: 'Cool', swatch: ['#A9D6F5', '#5B8FD1'] },
  { id: 'vintage', name: 'Vintage', swatch: ['#D9C4A0', '#A98B63'] },
  { id: 'dramatic', name: 'Dramatic', swatch: ['#6E7B8B', '#1F2933'] },
  { id: 'mono', name: 'Mono', swatch: ['#FFFFFF', '#2B2B2B'] },
  { id: 'sepia', name: 'Sepia', swatch: ['#E4C9A0', '#8A6A44'] },
  { id: 'vivid', name: 'Vivid', swatch: ['#FF8A5B', '#4FC3F7'] },
  { id: 'soft', name: 'Soft', swatch: ['#F3E9E4', '#CBBFC0'] },
  { id: 'film', name: 'Film', swatch: ['#DCCFC0', '#8E8578'] },
  { id: 'noir', name: 'Noir', swatch: ['#EDEDED', '#0B0B0B'] },
  { id: 'sunset', name: 'Sunset', swatch: ['#FFB07C', '#E0587B'] },
  { id: 'mint', name: 'Mint', swatch: ['#C8F4E4', '#6FC9B0'] },
  { id: 'pastel', name: 'Pastel', swatch: ['#FFE3EC', '#CDE7F0'] },
  { id: 'blush', name: 'Blush', swatch: ['#FFDCE0', '#F2A5B0'] },
  { id: 'moody', name: 'Moody', swatch: ['#7A8B99', '#22303C'] },
];

interface FrameSelectionPanelProps {
  frames: Frame[];
  selectedFrame: Frame | null;
  selectedFilter: FilterType;
  activeTab: TabType;
  onFrameSelect: (frame: Frame) => void;
  onFilterSelect: (filter: FilterType) => void;
  onTabChange: (tab: TabType) => void;
}

interface FrameItemProps {
  frame: Frame;
  isSelected: boolean;
  onClick: () => void;
}

function FrameItem({ frame, isSelected, onClick }: FrameItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-3 transition-all duration-200
        ${isSelected ? ' scale-105' : ' hover:scale-102'}`}
      aria-pressed={isSelected}
      aria-label={`Select frame ${frame.name}`}
    >
      <div
        className="relative w-full rounded-lg overflow-hidden"
        style={{ aspectRatio: '464/696' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frame.imageUrl}
          alt={frame.name}
          className="w-full h-full object-contain"
        />
      </div>
      <span className="text-white text-sm font-medium">{frame.name}</span>
    </button>
  );
}

export default function FrameSelectionPanel({
  frames,
  selectedFrame,
  selectedFilter,
  activeTab,
  onFrameSelect,
  onFilterSelect,
  onTabChange,
}: FrameSelectionPanelProps) {
  // Filter kategori frame. 'All' = tampilkan semua. Daftar kategori diturunkan
  // dari frame yang ada (unik, terurut). Filter hanya tampil bila ada >1 kategori.
  const [category, setCategory] = useState('All');

  const categories = useMemo(() => {
    const unique = Array.from(new Set(frames.map((f) => f.category))).sort();
    return ['All', ...unique];
  }, [frames]);

  const visibleFrames = useMemo(
    () => (category === 'All' ? frames : frames.filter((f) => f.category === category)),
    [frames, category],
  );

  return (
    <div className="flex flex-col h-full w-full gap-4">
      {/* Tab header */}
      <div className="flex shrink-0 bg-primary/75 rounded-[19.28px] overflow-hidden p-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-3 text-[16px] font-bold rounded-2xl transition-all duration-200
              ${
                activeTab === tab.id
                  ? 'text-white bg-[#3F72AF]'
                  : 'text-white/40'
              }`}
            aria-selected={activeTab === tab.id}
            role="tab"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <GlassCard className="flex-1 min-h-0 flex flex-col overflow-hidden shadow-none rounded-[19.28px]">
        {/* Frame tab */}
        {activeTab === 'frame' && (
          <div className="flex flex-col min-h-0 h-full">
            {/* Header tetap (diam) — label + filter kategori tidak ikut scroll. */}
            <div className="shrink-0 p-4 pb-2">
              {/* Section label */}
              <p className="text-[#ffff]/40 text-[13px] font-semibold uppercase tracking-wide mb-4">
                Frame Style
              </p>

              {/* Filter kategori — baris chip ramping (scroll horizontal).
                  Tampil hanya bila ada lebih dari satu kategori. */}
              {categories.length > 2 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {categories.map((cat) => {
                    const isActive = category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                          isActive
                            ? 'bg-[#3F72AF] text-white'
                            : 'bg-[#F9F7F7]/5 text-[#F9F7F7]/55 hover:bg-[#F9F7F7]/10'
                        }`}
                        aria-pressed={isActive}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Hanya grid frame yang scroll. */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none px-4 pb-4 pt-2">
              {frames.length === 0 ? (
                <p className="text-sm text-white/60 text-center py-8">
                  No frames available
                </p>
              ) : visibleFrames.length === 0 ? (
                <p className="text-sm text-white/60 text-center py-8">
                  No frames in this category
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {visibleFrames.map((frame) => (
                    <FrameItem
                      key={frame.id}
                      frame={frame}
                      isSelected={selectedFrame?.id === frame.id}
                      onClick={() => onFrameSelect(frame)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filter tab */}
        {activeTab === 'filter' && (
          <div className="p-4 flex flex-col gap-2 h-full overflow-y-auto scrollbar-none">
            <p className="text-[#ffff]/40 text-[13px] mb-1">FILTER STYLE</p>
            {FILTER_OPTIONS.map((filter) => {
              const isSelected = selectedFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => onFilterSelect(filter.id)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border transition-all duration-150 text-left
                    ${
                      isSelected
                        ? 'bg-[#3F72AF]/30 border-[#3F72AF] text-[#F9F7F7]'
                        : 'bg-[#F9F7F7]/5 border-[#F9F7F7]/10 text-[#F9F7F7]/60 hover:bg-[#F9F7F7]/10 hover:border-[#F9F7F7]/20'
                    }`}
                  aria-pressed={isSelected}
                >
                  <span className="text-sm font-medium">{filter.name}</span>
                  {/* Kotak info warna — gradasi tone filter, di sisi kanan baris. */}
                  <span
                    className={`ml-auto w-9 h-9 rounded-lg shrink-0 border transition-all duration-150
                      ${
                        isSelected
                          ? 'border-[#3F72AF] ring-2 ring-[#3F72AF]/60'
                          : 'border-[#F9F7F7]/20'
                      }`}
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${filter.swatch[0]} 0%, ${filter.swatch[1]} 100%)`,
                    }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
