'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ChevronRight,
  ChevronLeft,
  LayoutTemplate,
  Hand,
  ZoomIn,
  Sparkles,
  CheckCircle2,
  RotateCw,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import GlassCard from '@/components/shared/GlassCard';
import { playBackendAudio, stopBackendAudioFile } from '@/lib/audio';
import { cn } from '@/lib/utils';

interface PhotoEditorOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

// `audio` = narasi yang diputar saat step tampil (satu file per step).
const STEPS = [
  {
    id: 1,
    title: '1. Pick Frame Layout',
    description: 'Select your preferred frame template from the right panel.',
    icon: LayoutTemplate,
    panelName: 'Frame Panel',
    audio: 'sentuhFrame.mp3',
  },
  {
    id: 2,
    title: '2. Place Photos in Slots',
    description: 'Drag a photo from the left panel or tap to place it into a slot. To replace a photo, simply drop a new photo over it to overwrite.',
    icon: Hand,
    panelName: 'Photo Panel',
    audio: 'seretFoto.mp3',
  },
  {
    id: 3,
    title: '3. Adjust & Zoom Directly',
    description: 'Tap any photo slot directly. Drag with 1 finger to move/pan, or pinch with 2 fingers to zoom.',
    icon: ZoomIn,
    panelName: 'Direct Canvas Touch',
    audio: 'seretZoom.mp3',
  },
  {
    id: 4,
    title: '4. Select Color Filter',
    description: 'Switch to the Filter tab on the right panel to choose color presets for your photo strip.',
    icon: Sparkles,
    panelName: 'Filter Tab',
    audio: 'filter.mp3',
  },
  {
    id: 5,
    title: '5. Confirm & Print',
    description: 'When all slots are filled, tap the Confirm Print button at the bottom right!',
    icon: Sparkles,
    panelName: 'Confirm Print',
    audio: 'pilihCetakFoto.mp3',
  },
];

export default function PhotoEditorOnboarding({
  isOpen,
  onClose,
}: PhotoEditorOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  // Tombol Next baru muncul setelah narasi step ini selesai — user menyimak
  // dulu, sama seperti gating di halaman instruksi.
  const [audioDone, setAudioDone] = useState(false);
  // Putaran pertama (yang muncul otomatis saat editor terbuka) wajib disimak:
  // tidak ada tombol Skip dan dialog tidak bisa ditutup dari luar. Skip baru
  // tersedia kalau user membuka ulang tutorial lewat tombol bantuan.
  const [replay, setReplay] = useState(false);

  // Tutorial dibuka ulang → mulai lagi dari step 1. Disetel saat render (pola
  // "adjust state on prop change") supaya effect narasi di bawah langsung
  // melihat step 0 — kalau lewat effect, narasi step terakhir sempat bunyi
  // sekejap sebelum ke-reset.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setCurrentStep(0);
  }

  // Narasi per step — diputar saat tutorial dibuka dan tiap kali step berganti
  // (termasuk lompat lewat dot). Satu channel: step baru menghentikan narasi
  // step sebelumnya, jadi user yang menekan Next cepat tidak dengar dua suara.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tutup tombol Next tiap ganti step, lalu buka lagi saat narasinya habis.
    setAudioDone(false);
    const file = STEPS[currentStep]?.audio;
    if (!file) {
      setAudioDone(true);
      return;
    }
    let cancelled = false;
    playBackendAudio(file, () => {
      if (!cancelled) setAudioDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;

  // Sekali tutorial ditutup (Skip / "Got it"), bukaan berikutnya dianggap
  // replay → Skip boleh muncul.
  const closeTutorial = () => {
    // Skip di tengah narasi → suaranya ikut berhenti, jangan menyusul di
    // editor. Disapu seluruh clip tutorial (murah, dan tidak bergantung pada
    // step mana yang terakhir diputar); narasi di luar tutorial — mis.
    // peringatan waktu editor — sengaja tidak ikut dihentikan.
    STEPS.forEach((s) => stopBackendAudioFile(s.audio));
    setReplay(true);
    onClose();
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      closeTutorial();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => !open && closeTutorial()}
    >
      <Dialog.Portal>
        {/* Backdrop Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm transition-opacity" />

        {/* Dialog Content Container */}
        <Dialog.Content
          asChild
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-4xl p-0 outline-none"
          // Putaran pertama: tap di luar / Escape tidak menutup tutorial —
          // tanpa ini "tidak ada tombol Skip" gampang dilewati dengan menyentuh
          // backdrop-nya saja.
          onInteractOutside={(e) => {
            if (!replay) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!replay) e.preventDefault();
          }}
        >
          <GlassCard
            variant="default"
            className="overflow-hidden border-2 border-white/75 shadow-[0px_5.38px_26.92px_0px_rgba(17,45,78,0.5)] rounded-[28px] flex flex-col bg-primary"
          >
            <article className="flex flex-col w-full text-white">
              {/* Header */}
              <header className="flex items-center justify-between px-8 py-5 border-b border-white/15 bg-[#112D4E]">
                <div className="flex items-center gap-3.5">
                  <span className="p-2.5 rounded-xl bg-white/10 text-white border border-white/20">
                    <step.icon className="w-6 h-6" />
                  </span>
                  <div>
                    <Dialog.Title className="text-lg font-bold tracking-tight text-white flex items-center gap-2.5">
                      <span>{step.title}</span>
                      <span className="text-xs px-3 py-0.5 rounded-full bg-[#3F72AF]/40 text-[#DBE2EF] border border-[#3F72AF]/60 font-semibold">
                        {step.panelName}
                      </span>
                    </Dialog.Title>
                    <Dialog.Description className="text-sm font-medium text-[#DBE2EF]/80">
                      Step {currentStep + 1} of {totalSteps}
                    </Dialog.Description>
                  </div>
                </div>

                {/* Skip Button (No icon) — hanya saat tutorial dibuka ulang;
                    putaran pertama wajib dijalani sampai selesai. */}
                {replay && (
                  <Dialog.Close asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 px-5 text-sm font-bold hover:bg-white/20 border-white/40 text-white rounded-full transition-all"
                    >
                      <span>Skip</span>
                    </Button>
                  </Dialog.Close>
                )}
              </header>

              {/* Main Visual Animation Section */}
              <section className="p-8 flex flex-col items-center text-center gap-6 bg-[#112D4E]">
                {/* Visual Canvas Mockup mirroring the actual 3-panel Photo Editor page */}
                <figure className="w-full h-80 rounded-2xl bg-[#0e243f] border border-white/20 relative overflow-hidden flex flex-col p-4">
                  {/* 3 Main Panels Row */}
                  <div className="flex-1 flex gap-3 min-h-0 relative">
                    {/* Panel Left: Photo Selection */}
                    <div
                      className={`w-1/4 rounded-xl border p-2 flex flex-col gap-1.5 transition-all ${
                        currentStep === 1
                          ? 'border-[#3F72AF] bg-[#3F72AF]/30 ring-2 ring-[#3F72AF]'
                          : 'border-white/15 bg-white/5 opacity-60'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-[#DBE2EF] uppercase tracking-wider">
                        Photos
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 flex-1">
                        <div className="rounded-md bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white/80">
                          #1
                        </div>
                        <div className="rounded-md bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white/80">
                          #2
                        </div>
                        <div className="rounded-md bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white/80">
                          #3
                        </div>
                        <div className="rounded-md bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white/80">
                          #4
                        </div>
                      </div>
                    </div>

                    {/* Panel Center: Canvas Preview Area */}
                    <div
                      className={`flex-1 rounded-xl border p-3 flex flex-col items-center justify-center relative transition-all ${
                        currentStep === 2
                          ? 'border-[#3F72AF] bg-[#3F72AF]/20 ring-2 ring-[#3F72AF]'
                          : 'border-white/15 bg-white/5'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-[#DBE2EF] uppercase tracking-wider mb-1">
                        Preview Area
                      </div>

                      {/* Strip Frame Mockup */}
                      <div className="w-24 h-36 rounded-lg border border-white/30 bg-white/10 p-1.5 flex flex-col gap-1.5 relative overflow-hidden">
                        {/* Slot 1 */}
                        <div className="w-full h-1/2 rounded border border-dashed border-[#3F72AF]/70 bg-[#3F72AF]/20 flex items-center justify-center relative overflow-hidden">
                          {currentStep >= 2 && (
                            <div
                              className="w-full h-full bg-[#3F72AF]/60 border border-white/30 flex items-center justify-center font-bold text-xs relative text-white"
                              style={
                                currentStep === 2
                                  ? { animation: 'panZoomDemo 4s ease-in-out infinite' }
                                  : {}
                              }
                            >
                              <span>Photo</span>

                              {/* STEP 3 ANIMATION: Pinch & Drag gesture indicators */}
                              {currentStep === 2 && (
                                <>
                                  {/* Finger 1 */}
                                  <div className="absolute left-2 top-2 animate-bounce text-white drop-shadow">
                                    <Hand className="w-4 h-4 -rotate-45 text-white" />
                                  </div>
                                  {/* Finger 2 for Pinch */}
                                  <div
                                    className="absolute right-2 bottom-2 animate-bounce text-white drop-shadow"
                                    style={{ animationDelay: '0.2s' }}
                                  >
                                    <Hand className="w-4 h-4 rotate-135 text-white" />
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Slot 2 */}
                        <div className="w-full h-1/2 rounded border border-dashed border-[#3F72AF]/70 bg-[#3F72AF]/20 flex items-center justify-center">
                          {currentStep >= 4 ? (
                            <div className="w-full h-full bg-[#3F72AF]/60 border border-white/30 flex items-center justify-center text-xs font-bold text-white">
                              <span>Photo</span>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-white/50">Slot 2</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Panel Right: Frame & Filter Selection */}
                    <div
                      className={`w-1/4 rounded-xl border p-2 flex flex-col gap-1.5 transition-all ${
                        currentStep === 0 || currentStep === 3
                          ? 'border-[#3F72AF] bg-[#3F72AF]/30 ring-2 ring-[#3F72AF]'
                          : 'border-white/15 bg-white/5 opacity-60'
                      }`}
                    >
                      {/* Tabs Mockup */}
                      <div className="flex border-b border-white/20 text-xs font-bold text-center">
                        <div
                          className={`flex-1 py-1 ${
                            currentStep !== 3 ? 'text-white border-b-2 border-[#3F72AF]' : 'text-white/40'
                          }`}
                        >
                          Frame
                        </div>
                        <div
                          className={`flex-1 py-1 ${
                            currentStep === 3 ? 'text-white border-b-2 border-[#3F72AF]' : 'text-white/40'
                          }`}
                        >
                          Filter
                        </div>
                      </div>

                      {/* Tab Content Mockup */}
                      {currentStep !== 3 ? (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <div className="h-7 rounded-md bg-white/10 border border-white/15" />
                          <div className="h-7 rounded-md bg-[#3F72AF] border-2 border-white/40" />
                          <div className="h-7 rounded-md bg-white/10 border border-white/15" />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <div className="h-7 rounded-md bg-[#3F72AF] border-2 border-white/40 text-xs flex items-center justify-center font-bold text-white">Warm</div>
                          <div className="h-7 rounded-md bg-white/10 border border-white/15 text-xs flex items-center justify-center text-white/70">Cool</div>
                        </div>
                      )}
                    </div>

                    {/* ANIMATION OVERLAYS ACCORDING TO STEP */}
                    {/* STEP 1: Hand tapping Frame Panel */}
                    {currentStep === 0 && (
                      <div className="absolute right-8 top-12 animate-bounce text-white drop-shadow">
                        <Hand className="w-7 h-7 -rotate-45" />
                      </div>
                    )}

                    {/* STEP 2: Dragging Photo from Left Panel to Center Slot */}
                    {currentStep === 1 && (
                      <div
                        className="absolute left-8 top-1/3 w-12 h-14 rounded-lg bg-[#3F72AF] border border-white/50 shadow-md flex items-center justify-center pointer-events-none z-20"
                        style={{ animation: 'dragPhotoDemo 3.2s ease-in-out infinite' }}
                      >
                        <Hand className="w-5 h-5 text-white absolute -bottom-2 -right-2 drop-shadow" />
                      </div>
                    )}
                  </div>

                  {/* Bottom Row Mockup: Slot Toolbar + Confirm Print */}
                  <div className="w-full flex items-center justify-between pt-2.5 border-t border-white/10 mt-2.5 shrink-0">
                    <div className="w-1/4" />

                    {/* Center Toolbar Mockup */}
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/80 border border-white/30 text-xs font-semibold text-white/80">
                      <span className="flex items-center gap-1"><ZoomIn className="w-3 h-3" /> Zoom</span>
                      <span className="flex items-center gap-1"><RotateCw className="w-3 h-3" /> Rotate</span>
                      <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Reset</span>
                    </div>

                    {/* Right Confirm Print Button Mockup (No icon) */}
                    <div className="w-1/4 flex justify-end">
                      <div
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center transition-all ${
                          currentStep === 4
                            ? 'bg-blue-100/34 text-white border-2 border-white/80 scale-105 shadow-md'
                            : 'bg-white/10 text-white/40 border border-white/15'
                        }`}
                      >
                        <span>Confirm Print</span>
                      </div>
                    </div>
                  </div>
                </figure>

                {/* Step Title & Description */}
                <figcaption className="flex flex-col gap-2 max-w-xl">
                  <h3 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                    <span>{step.title}</span>
                    {currentStep === 4 && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                  </h3>
                  <p className="text-base font-normal text-[#DBE2EF] leading-relaxed">
                    {step.description}
                  </p>
                </figcaption>
              </section>

              {/* Footer Navigation */}
              <footer className="px-8 py-5 bg-[#112D4E] border-t border-white/15 flex items-center justify-between">
                {/* Back button using shadcn Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className="h-10 px-5 text-sm font-bold gap-1 border-white/40 text-white hover:bg-white/10 disabled:opacity-30 rounded-full"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>

                {/* Navigation Step Dots */}
                <nav className="flex items-center gap-2.5" aria-label="Onboarding Progress">
                  {STEPS.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentStep(idx)}
                      className={`h-3 rounded-full transition-all cursor-pointer ${
                        idx === currentStep
                          ? 'w-8 bg-[#3F72AF] border border-white/50'
                          : 'w-3 bg-white/25 hover:bg-white/40'
                      }`}
                      aria-label={`Go to step ${idx + 1}`}
                    />
                  ))}
                </nav>

                {/* Next / Got It button using shadcn Button */}
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleNext}
                  className={cn(
                    'h-10 px-6 text-sm font-bold gap-1.5 shadow-md rounded-full transition-opacity duration-300',
                    // Ditahan (bukan cuma diredupkan) sampai narasi step ini
                    // habis — ruangnya tetap dipesan supaya footer tidak lompat.
                    !audioDone && 'opacity-0 pointer-events-none',
                  )}
                >
                  <span>{currentStep === totalSteps - 1 ? 'Got it! Start Editing' : 'Next'}</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </footer>
            </article>
          </GlassCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
