import React from 'react';
import { Badge } from '@/components/admin/ui/badge';
import { type Package, type PackageStatus } from '../api/types';
import {
  formatIDR as formatCurrency,
  formatDateShort as formatDate,
} from '@/lib/formats';

interface PackageDetailPanelProps {
  pkg: Package | null;
}

const STATUS_CONFIG: Record<
  PackageStatus,
  { label: string; className: string }
> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-rose-100 text-rose-800 hover:bg-rose-100/80',
  },
  draft: {
    label: 'Draft',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80',
  },
};

// Hardcoded values per package id (will come from a different API later)
const getSoldCount = (id: number) => ((id * 37) % 250) + 12;

const getDateCreated = (id: number) => {
  const base = new Date(2024, 0, 1).getTime();
  const offset = (id * 86400000 * 5) % (86400000 * 365);
  return new Date(base + offset).toISOString();
};

const getLastModified = (id: number) => {
  const base = new Date(2024, 6, 1).getTime();
  const offset = (id * 86400000 * 3) % (86400000 * 180);
  return new Date(base + offset).toISOString();
};


export function PackageDetailPanel({ pkg }: PackageDetailPanelProps) {
  if (!pkg) return null;

  const statusConfig = STATUS_CONFIG[pkg.status] || STATUS_CONFIG.draft;
  const soldCount = getSoldCount(pkg.id);
  const dateCreated = getDateCreated(pkg.id);
  const lastModified = getLastModified(pkg.id);

  return (
    <div className="relative hidden shrink-0 flex-col gap-4 lg:flex lg:w-80 xl:w-md">
      <div className="absolute -top-8 left-0 text-lg font-semibold">Details</div>

      {/* Information */}
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-6 text-sm shadow-sm">
        <div className="text-base font-semibold">Information</div>

        <div className="flex justify-between items-center border-b pb-2">
          <span className="text-muted-foreground">Status</span>
          <Badge
            variant="secondary"
            className={`px-2.5 py-0.5 text-xs font-medium ${statusConfig.className}`}
          >
            {statusConfig.label}
          </Badge>
        </div>

        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Code</span>
          <span className="text-right font-mono font-medium uppercase">
            {pkg.code || '-'}
          </span>
        </div>

        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Price</span>
          <span className="text-right font-medium">
            {formatCurrency(pkg.price)}
          </span>
        </div>

        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Duration</span>
          <span className="text-right font-medium">
            {pkg.durationMins} mins ({pkg.durationSecs}s)
          </span>
        </div>

        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Print Count</span>
          <span className="text-right font-medium">
            {pkg.printCount > 0 ? `${pkg.printCount} prints` : '0 (Digital)'}
          </span>
        </div>

        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Print Unit Price</span>
          <span className="text-right font-medium">
            {formatCurrency(pkg.printUnitPrice)}
          </span>
        </div>

        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Popular Package</span>
          <span className="text-right font-medium">
            {pkg.isPopular ? 'Yes' : 'No'}
          </span>
        </div>

        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Sold</span>
          <span className="text-right font-medium">{soldCount}</span>
        </div>

        <div className="flex justify-between border-b pb-2">
          <span className="text-muted-foreground">Date Created</span>
          <span className="text-right font-medium">
            {formatDate(dateCreated)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Modified</span>
          <span className="text-right font-medium">
            {formatDate(lastModified)}
          </span>
        </div>
      </div>
    </div>
  );
}



