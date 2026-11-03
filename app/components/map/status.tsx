import { cn } from "@/lib/utils";

import type { SimStatus } from "./map-model";

export const STATUS_LABEL: Record<SimStatus, string> = {
  blocked: "Blocked",
  at_risk: "At risk",
  available: "Available",
  unknown: "Unknown",
};

const STATUS_TONE: Record<SimStatus, string> = {
  blocked: "bg-status-blocked-soft text-status-blocked",
  at_risk: "bg-status-at-risk-soft text-status-at-risk",
  available: "bg-status-available-soft text-status-available",
  unknown: "bg-status-unknown-soft text-status-unknown",
};

const STATUS_DOT: Record<SimStatus, string> = {
  blocked: "bg-status-blocked",
  at_risk: "bg-status-at-risk",
  available: "bg-status-available",
  unknown: "bg-status-unknown",
};

/** Shape marks status as well as colour: square, triangle, circle, ring. */
function StatusMark({ status }: { status: SimStatus }) {
  if (status === "unknown") {
    return (
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full border border-current"
      />
    );
  }
  if (status === "at_risk") {
    return (
      <span
        aria-hidden
        className={cn("size-2 shrink-0", STATUS_DOT[status])}
        style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0",
        status === "blocked" ? "rounded-[1px]" : "rounded-full",
        STATUS_DOT[status],
      )}
    />
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: SimStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium leading-none",
        STATUS_TONE[status],
        className,
      )}
    >
      <StatusMark status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ConfidenceTag({
  confidence,
}: {
  confidence: "verified" | "assumed" | "unknown";
}) {
  if (confidence === "verified") {
    return <span className="text-[11px] text-muted-foreground">Verified</span>;
  }
  return (
    <span
      className={cn(
        "text-[11px] font-medium",
        confidence === "assumed" ? "text-status-at-risk" : "text-status-unknown",
      )}
    >
      {confidence === "assumed" ? "Assumed" : "Confidence unknown"}
    </span>
  );
}
