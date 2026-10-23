// Dev-only harness: mounts WriterView alone so it can be driven headlessly (window.writer is the WriterHandle).
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/index.css";
import { saveCompany } from "../company";
import { WriterView, type WriterHandle } from "../WriterView";
import type { LptkFile } from "../lptk";

const q = new URLSearchParams(location.search);
if (q.get("theme") === "dark") document.documentElement.classList.add("dark");
if (q.has("company"))
  saveCompany({ name: "Rossi Studio S.r.l.", address: "Via Roma 1, 20121 Milano (MI)", vat: "IT01234567890", taxCode: "RSSMRA80A01F205X", email: "info@rossistudio.it", phone: "+39 02 1234567", iban: "IT60 X054 2811 1010 0000 0123 456", defaultPlace: "Milano" });

const t = q.get("template");
let template = t;

declare global {
  interface Window {
    writer: WriterHandle;
    lastFile: LptkFile | null;
    exported: number;
  }
}

function Harness() {
  const [file, setFile] = useState<LptkFile | null>(null);
  const ref = useRef<WriterHandle>(null);
  return (
    <TooltipProvider delay={500}>
      <div className="fixed inset-0 bg-canvas">
        <WriterView
          ref={(h) => {
            ref.current = h;
            if (h) window.writer = h;
            if (h && template) {
              template = null;
              setTimeout(() => h.applyTemplate(t!));
            }
          }}
          file={file}
          onChange={(f) => {
            window.lastFile = f;
            setFile(f);
          }}
          onExportPdf={(bytes) => (window.exported = bytes.length)}
        />
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
