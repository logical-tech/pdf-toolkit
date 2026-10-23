# Componenti di terze parti

PDF Toolkit è distribuito con la licenza [CC BY-NC-SA 4.0](LICENSE). Include i componenti seguenti, ciascuno con la propria licenza.

## Ghostscript (AGPL-3.0)

L'app include, come programma separato, **Ghostscript 10.08.0** di Artifex Software, usato solo per l'esportazione in PDF/A. Non è modificato e non è collegato al codice dell'app: viene avviato come processo a parte.

- Licenza: GNU Affero General Public License v3.0, <https://www.gnu.org/licenses/agpl-3.0.html>
- Codice sorgente della versione inclusa: <https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/gs10080>
- Come viene compilato: [scripts/build-ghostscript.sh](scripts/build-ghostscript.sh) (macOS, Linux) e [scripts/fetch-ghostscript-windows.sh](scripts/fetch-ghostscript-windows.sh) (Windows, build ufficiale Artifex)

## Riconoscimento del testo (Apache-2.0)

- tesseract.js 7.0.0 e tesseract.js-core, <https://github.com/naptha/tesseract.js>
- Modelli linguistici italiano e inglese da tessdata (Apache-2.0), pacchetti @tesseract.js-data/ita ed eng

## Librerie

| Componente | Licenza |
| --- | --- |
| PDF.js (pdfjs-dist) | Apache-2.0 |
| @cantoo/pdf-lib | MIT |
| Tauri e plugin | MIT o Apache-2.0 |
| React, React DOM | MIT |
| Base UI, shadcn/ui | MIT |
| Tailwind CSS, tailwind-merge, tw-animate-css | MIT |
| class-variance-authority | Apache-2.0 |
| lucide-react | ISC |
| signature_pad, sonner, torph, clsx, next-themes | MIT |
