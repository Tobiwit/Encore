import { formatPriceRange } from "@/lib/format";
import type { PriceSummary } from "@/lib/types";
import { cn } from "./ui";

/** Shows a provider-supplied price range, or an explicit unknown state. Never estimates. */
export function TicketPrice({ price, className, detailed = false }: { price: PriceSummary | null; className?: string; detailed?: boolean }) {
  const text = price ? formatPriceRange(price.min, price.max, price.currency) : null;
  if (!text) {
    return <span className={cn("text-support text-fg-muted", className)}>Price not announced</span>;
  }
  return (
    <span className={cn("tabular text-support text-fg-secondary", className)}>
      <span className="font-semibold text-fg">{text}</span>
      {detailed ? (
        <span className="block text-meta text-fg-muted">
          {price!.isResale ? "Resale listing" : price!.offerType === "standard" ? "Standard tickets" : `${price!.offerType.toUpperCase()} offer`} ·
          range from provider, may not cover every category or fee
        </span>
      ) : null}
    </span>
  );
}
