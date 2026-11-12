
import type { PaymentStatus } from '../types/order'

const labels: Record<string, string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  completed: 'Completed',
}

export function StatusBadge({ status }: { status: PaymentStatus | string }) {
  const refunded = status === 'refunded'
  return (

    <span
      className=
        {`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase
        ${refunded ? 'bg-slate-100 text-slate-600' : 'bg-soft text-brand'}`}
      
    >
      {labels[status] ?? status}
    </span>
  )
}
