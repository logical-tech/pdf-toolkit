import { useState } from "react";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptionGroup, OptionRow } from "@/components/Chrome";
import { t } from "@/lib/i18n";
import { pickFiles } from "@/lib/io";
import { saveCompany, useCompany } from "./company";
import { imageToPng } from "./image";
import type { CompanyData } from "./model";

type TextKey = Exclude<keyof CompanyData, "logo">;

const FIELDS: { key: TextKey; label: string; placeholder: string; hint?: string }[] = [
  { key: "name", label: t("Ragione sociale"), placeholder: t("Rossi Studio S.r.l.") },
  { key: "address", label: t("Indirizzo"), placeholder: t("Via Roma 1, 20121 Milano (MI)") },
  { key: "vat", label: t("Partita IVA"), placeholder: "IT01234567890" },
  { key: "taxCode", label: t("Codice fiscale"), placeholder: "01234567890", hint: t("Se diverso dalla P.IVA") },
  { key: "email", label: t("Email o PEC"), placeholder: "info@rossistudio.it" },
  { key: "phone", label: t("Telefono"), placeholder: "+39 02 1234567" },
  { key: "iban", label: t("IBAN"), placeholder: "IT60 X054 2811 1010 0000 0123 456" },
  { key: "defaultPlace", label: t("Luogo predefinito"), placeholder: t("Milano"), hint: t("Per luogo e data nelle firme") },
];

const fieldClass =
  "h-8 w-56 min-w-0 rounded-[10px] bg-muted px-2.5 text-[13px] outline-none transition-[box-shadow] duration-150 placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring";

/** Company data used by headers, payment blocks and templates. Saved on this computer only. */
export function CompanySettings() {
  const company = useCompany();
  const [error, setError] = useState("");

  const chooseLogo = async () => {
    const [file] = await pickFiles("image/png,image/jpeg,image/webp,image/svg+xml");
    if (!file) return;
    try {
      saveCompany({ logo: await imageToPng(file, 600) });
      setError("");
    } catch {
      setError(t("Immagine non leggibile"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <OptionGroup>
        <OptionRow label={t("Logo")} hint={error || t("PNG o JPEG, compare nell'intestazione")}>
          <div className="flex items-center gap-2">
            {company.logo && <img src={company.logo} alt="" className="h-8 max-w-24 rounded-[4px] bg-white object-contain p-0.5" />}
            {company.logo && (
              <Button variant="ghost" className="h-8 rounded-[10px] px-3" onClick={() => saveCompany({ logo: undefined })}>
                {t("Rimuovi")}
              </Button>
            )}
            <Button variant="secondary" className="h-8 rounded-[10px] px-3" onClick={chooseLogo}>
              <ImageUp /> {company.logo ? t("Cambia") : t("Scegli")}
            </Button>
          </div>
        </OptionRow>
      </OptionGroup>
      <OptionGroup>
        {FIELDS.map((f) => (
          <OptionRow key={f.key} label={f.label} hint={f.hint} htmlFor={`company-${f.key}`}>
            <input
              id={`company-${f.key}`}
              className={fieldClass + (f.key === "iban" || f.key === "vat" || f.key === "taxCode" ? " tabular-nums" : "")}
              value={company[f.key] ?? ""}
              placeholder={f.placeholder}
              spellCheck={false}
              onChange={(e) => saveCompany({ [f.key]: e.target.value })}
            />
          </OptionRow>
        ))}
      </OptionGroup>
      <p className="px-1 text-xs text-muted-foreground">{t("I dati restano su questo computer e vengono usati nelle intestazioni e nelle condizioni di pagamento.")}</p>
    </div>
  );
}
