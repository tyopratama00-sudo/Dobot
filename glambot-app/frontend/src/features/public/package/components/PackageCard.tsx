'use client';

import { formatPriceToK } from '@/lib/formats';

interface PackageCardProps {
  title: string;
  description: string;
  price: number;
  imageSrc: string;
  isPopular?: boolean;
  onClick?: () => void;
}

export default function PackageCard({
  title,
  description,
  price,
  imageSrc,
  isPopular,
  onClick,
}: PackageCardProps) {
  return (
    <div
      onClick={onClick}
      className="overflow-hidden w-116 h-134.25 bg-white-400 bg-clip-padding backdrop-filter backdrop-blur-sm bg-opacity-10 border border-gray-100 hover:border-2 hover:border-primary rounded-[29.31px] cursor-pointer transition-all duration-300"
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={464} height={244} src={imageSrc} alt={title} />
        {isPopular && (
          <div className="absolute top-2 left-2 gradient-primary text-white px-3.5 py-1 m-2 rounded-full text-sm font-medium">
            Popular
          </div>
        )}
      </div>

      <div className="p-9.75 pb-90">
        <h3 className="text-primary font-bold text-[26px] mb-3">{title}</h3>
        <p className="text-primary text-[18px] leading-6.75">{description}</p>
        <p className="text-primary text-[58px] font-bold mt-6">
          RP {formatPriceToK(price)}
        </p>
      </div>
    </div>
  );
}
