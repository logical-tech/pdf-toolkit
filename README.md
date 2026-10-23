# PDF Toolkit

Firma, compila e sistema i PDF sul tuo computer. Niente account, niente cloud: i file non lasciano mai il computer.

App desktop per macOS (Windows e Linux funzionano), costruita con Tauri 2, React e shadcn/ui.

## Cosa fa

- **Modifica**: testo, data, firma disegnata o caricata, immagini, timbri pronti, spunte, penna libera, linee, frecce, forme, commenti, evidenziatore, rettangolo bianco e oscuramento vero (il contenuto sotto viene rimosso). Ogni elemento si sposta, ridimensiona e ruota.
- **Moduli**: compila i campi esistenti o creane di nuovi (testo, casella di spunta).
- **Testo**: selezionabile, ricerca con ⌘F, evidenzia/sottolinea/barra seguendo il testo, link cliccabili.
- **Pagine**: riordina, ruota, elimina, duplica, inserisci pagine bianche, ritaglia i margini, unisci PDF, dividi, estrai, inverti l'ordine, trova le pagine bianche, crea un PDF da immagini, salva le pagine come PNG.
- **Scansioni**: raddrizza, sbianca lo sfondo, scala di grigi e OCR offline (italiano e inglese) per renderle ricercabili.
- **Timbri su tutte le pagine**: numeri di pagina, intestazione, piè di pagina, filigrana.
- **Salva come**: A4 o 2/4 pagine per foglio, compressione immagini, password, limiti a stampa/copia/modifica, rimozione dei dati nascosti, PDF/A per l'archiviazione, titolo e autore.
- **Altro**: indice (segnalibri) modificabile, allegati, confronto tra due PDF, apertura dei file firmati .p7m, stampa, annulla/ripeti, file recenti, apertura dal Finder, aggiornamenti automatici.

## Installazione

Scarica il file per il tuo sistema dall'[ultima release](https://github.com/logical-tech/pdf-toolkit/releases/latest).

Su macOS l'app non è ancora firmata da Apple: al primo avvio fai clic destro sull'app → **Apri** → **Apri**. Dopo, gli aggiornamenti arrivano da soli.

## Sviluppo

```bash
pnpm install                                   # copia anche i file dell'OCR in public/ocr
scripts/build-ghostscript.sh aarch64-apple-darwin   # Ghostscript per il PDF/A (una volta sola)
pnpm tauri dev
pnpm test
```

## Pubblicare una versione

1. Alza la versione in `package.json` e `src-tauri/tauri.conf.json`.
2. Crea e pusha il tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. La GitHub Action compila per macOS (Apple Silicon e Intel), Windows e Linux e crea una release in bozza con `latest.json`.
4. Pubblica la bozza: le app installate si aggiornano.

Gli aggiornamenti sono firmati: la chiave privata sta fuori dal repo (`~/.tauri/pdf-toolkit.key`) e nei secret `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. La pubblica è in `src-tauri/tauri.conf.json`.

## Licenza

[CC BY-NC-SA 4.0](LICENSE): puoi usarlo, modificarlo e condividerlo citando l'autore, **non per scopi commerciali**, e le versioni modificate vanno condivise con la stessa licenza. I componenti inclusi hanno le proprie licenze: vedi [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (Ghostscript è AGPL-3.0).
