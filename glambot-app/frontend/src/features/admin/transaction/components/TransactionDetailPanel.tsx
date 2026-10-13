import React from 'react';
import { Badge } from '@/components/admin/ui/badge';
import { Separator } from '@/components/admin/ui/separator';
import { type Transaction } from '../api/types';
import {
  formatIDR as formatCurrency,
  formatDateTimeShort as formatDateTime,
} from '@/lib/formats';
import { TRANSACTION_STATUS_CONFIG } from '../utils/status';

interface TransactionDetailPanelProps {
  transaction: Transaction | null;
}

const STATUS_CONFIG = TRANSACTION_STATUS_CONFIG;

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function TransactionDetailPanel({
  transaction,
}: TransactionDetailPanelProps) {
  if (!transaction) return null;

  // `amount` is the price AFTER the voucher discount (sessions.final_price).
  // Harga asli sebelum voucher = amount + discount, jadi pengurangan voucher
  // bisa ditelusuri: Subtotal − Voucher = Total.
  const discount = transaction.voucher?.discount ?? 0;
  const total = transaction.amount;
  const subtotal = total + discount;
  const statusConfig = STATUS_CONFIG[transaction.status];

  return (
    <div className="hidden shrink-0 flex-col gap-4 lg:flex lg:w-80 xl:w-md">
      <div className="text-lg font-semibold">Transaction Detail</div>
      <div className="bg-card flex flex-col gap-4 rounded-xl border p-6 shadow-sm">
        {/* Header info */}
        <div className="flex flex-col gap-3">
          <Row label="Transaction ID">
            <span className="font-mono">{transaction.id}</span>
          </Row>
          <Row label="Created At">
            {formatDateTime(transaction.createdAt)}
          </Row>
        </div>

        <Separator />

        {/* Payment Information */}
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Payment Information</h3>
          <Row label="Status">
            <Badge
              variant="secondary"
              className={statusConfig.className}
            >
              {statusConfig.label}
            </Badge>
          </Row>
          <Row label="Midtrans Order ID">
            <span className="font-mono text-xs">
              {transaction.midtransOrderId}
            </span>
          </Row>
          <Row label="Subtotal">{formatCurrency(subtotal)}</Row>
          <Row label="Voucher">
            {transaction.voucher ? (
              <span className="flex flex-col items-end">
                <span className="font-mono">{transaction.voucher.code}</span>
                {discount > 0 && (
                  <span className="text-xs text-emerald-600">
                    -{formatCurrency(discount)}
                  </span>
                )}
              </span>
            ) : (
              '-'
            )}
          </Row>
          <Separator />
          <Row label="Total">
            <span className="text-base font-semibold">
              {formatCurrency(total)}
            </span>
          </Row>
        </div>

        <Separator />

        {/* Order Information */}
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Order Information</h3>
          <Row label="Package">
            {transaction.package ? (
              <span className="flex flex-col items-end">
                <span>{transaction.package.name}</span>
                <span className="text-muted-foreground text-xs capitalize">
                  {transaction.package.code} ·{' '}
                  {transaction.package.type === 'digital+print'
                    ? 'Digital + Print'
                    : 'Digital'}
                </span>
              </span>
            ) : (
              '-'
            )}
          </Row>
          <Row label="Frame">
            {transaction.frame ? (
              <span className="flex flex-col items-end">
                <span>{transaction.frame.name}</span>
                {transaction.frame.category && (
                  <span className="text-muted-foreground text-xs">
                    {transaction.frame.category}
                  </span>
                )}
              </span>
            ) : (
              '-'
            )}
          </Row>
        </div>
      </div>
    </div>
  );
}
