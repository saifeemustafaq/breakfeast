"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Doc } from "@/lib/export";
import { cn } from "@/lib/utils";

/** An export laid out for paper. Also used as the on-screen print preview. */
export function PrintDocument({ doc, onePerPage = true }: { doc: Doc; onePerPage?: boolean }) {
  return (
    <article className="flex flex-col gap-2 text-sm leading-relaxed">
      {doc.blocks.map((b, i) => {
        switch (b.kind) {
          case "title":
            return (
              <header key={i} className="mb-2 border-b pb-3">
                <h1 className="font-heading text-2xl font-semibold">{b.text}</h1>
                {b.sub && <p className="text-muted-foreground">{b.sub}</p>}
              </header>
            );
          case "heading":
            return (
              <h2 key={i} className="mt-4 font-heading text-lg font-semibold break-after-avoid">
                {b.text}
              </h2>
            );
          case "subheading":
            return (
              <h3 key={i} className="mt-2 font-semibold break-after-avoid">
                {b.text}
              </h3>
            );
          case "text":
            return (
              <p key={i} className={cn(b.muted && "text-muted-foreground")}>
                {b.text}
              </p>
            );
          case "list":
            if (b.style === "numbered") {
              return (
                <ol key={i} className="flex list-decimal flex-col gap-1 pl-5">
                  {b.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ol>
              );
            }
            return (
              <ul key={i} className={cn("flex flex-col gap-1", b.style !== "check" && "list-disc pl-5")}>
                {b.items.map((item, j) => (
                  <li key={j} className={cn(b.style === "check" && "flex items-start gap-2 break-inside-avoid")}>
                    {b.style === "check" && (
                      <span aria-hidden className="mt-1 size-3.5 shrink-0 rounded-sm border border-foreground/60" />
                    )}
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-foreground/30">
                      {b.columns.map((c) => (
                        <th key={c} className="py-1.5 pr-3 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j} className="border-b border-border break-inside-avoid">
                        {row.map((cell, k) => (
                          <td key={k} className="py-1.5 pr-3 align-top">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "break":
            return <hr key={i} className={cn("my-4", onePerPage && "print:my-0 print:break-after-page print:border-0")} />;
        }
      })}
    </article>
  );
}

/** Mounts the document outside the app shell, opens the print dialog, and unmounts after. */
export function PrintPortal({ doc, onePerPage, onDone }: { doc: Doc; onePerPage: boolean; onDone: () => void }) {
  useEffect(() => {
    const after = () => onDone();
    window.addEventListener("afterprint", after);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", after);
    };
  }, [onDone]);

  return createPortal(
    <div className="print-root">
      <PrintDocument doc={doc} onePerPage={onePerPage} />
    </div>,
    document.body,
  );
}
