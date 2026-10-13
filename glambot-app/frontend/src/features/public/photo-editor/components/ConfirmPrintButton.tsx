import { Printer, ArrowRight } from 'lucide-react';

interface ConfirmPrintButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export default function ConfirmPrintButton({
  disabled,
  onClick,
}: ConfirmPrintButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full px-8 py-4 rounded-[19.28px] text-[#ffff] border-2 border-white/60  bg-blue-100/34 hover:border-white/80 font-bold text-[22px] flex items-center justify-center gap-6 disabled:cursor-not-allowed"
    >
      <Printer className="w-6 h-6" />
      <span>Confirm Print</span>
      <ArrowRight className="w-6 h-6" />
    </button>
  );
}
