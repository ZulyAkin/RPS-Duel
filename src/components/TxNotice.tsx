import { ExternalLink, Loader2, TriangleAlert, X } from 'lucide-react'
import { txExplorerUrl } from '@/lib/usdc'
import type { TxStatus } from '@/hooks/useTxRunner'

interface Props {
  status: TxStatus
  onDismiss: () => void
}

/** Honest transaction state: wallet prompt, real confirmation, real errors. */
export function TxNotice({ status, onDismiss }: Props) {
  if (status.phase === 'idle') return null

  if (status.phase === 'error') {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-2xl px-4 py-3 text-sm"
        style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <span className="flex-1 text-pretty">
          {status.error}
          {status.detail && <span className="mono mt-1 block break-words text-[11px] opacity-70">{status.detail}</span>}
        </span>
        <button onClick={onDismiss} aria-label="Dismiss" className="-m-2 p-2">
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="glass-inner flex items-center gap-2 rounded-2xl px-4 py-3 text-sm" role="status">
      <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: 'var(--accent-hover)' }} />
      <span className="flex-1" style={{ color: 'var(--ink-2)' }}>
        {status.phase === 'wallet' ? `${status.label}: confirm in your wallet` : `${status.label}: confirming`}
      </span>
      {status.phase === 'confirming' && (
        <a
          href={txExplorerUrl(status.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold"
          style={{ color: 'var(--accent-hover)' }}
        >
          View <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  )
}
